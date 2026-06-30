//! Link-based password reset (alternate to OTP flow). Used by `consume_token` on reset-password.
#![allow(dead_code)]

use crate::db::Connection;
use lettre::message::MultiPart;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use uuid::Uuid;

const TOKEN_TTL_SECS: i64 = 3600;

fn token_pepper() -> String {
    std::env::var("JWT_SECRET").unwrap_or_else(|_| "hrm-otp-pepper".into())
}

fn hash_token(token: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in token_pepper().as_bytes().iter().chain(token.as_bytes()) {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", h)
}

pub fn tenant_app_url() -> String {
    std::env::var("TENANT_APP_URL")
        .unwrap_or_else(|_| "http://localhost:5174".to_string())
        .trim_end_matches('/')
        .to_string()
}

pub fn password_reset_debug_enabled() -> bool {
    std::env::var("SIGNUP_OTP_DEBUG")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(cfg!(debug_assertions))
}

/// Invalidate unused tokens for a user, create a new token, return the raw secret.
pub fn create_token(conn: &Connection, user_id: i64) -> Result<String, String> {
    let now = chrono::Utc::now();
    let now_str = now.format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "UPDATE password_reset_tokens SET used_at = ?1 WHERE user_id = ?2 AND used_at IS NULL",
        crate::params![&now_str, user_id],
    );

    let raw_token = Uuid::new_v4().to_string();
    let id = Uuid::new_v4().to_string();
    let expires = (now + chrono::Duration::seconds(TOKEN_TTL_SECS))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();

    conn.execute(
        "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        crate::params![&id, user_id, hash_token(&raw_token), &expires, &now_str],
    )
    .map_err(|e| format!("Failed to store reset token: {e}"))?;

    Ok(raw_token)
}

/// Validate token for email, mark used, return user_id.
pub fn consume_token(conn: &Connection, email: &str, raw_token: &str) -> Result<i64, String> {
    let email = email.trim();
    let raw_token = raw_token.trim();
    if email.is_empty() || raw_token.is_empty() {
        return Err("Invalid or expired reset link".into());
    }

    let token_hash = hash_token(raw_token);
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let row: Option<(i64, String, Option<String>)> = conn
        .query_row(
            "SELECT prt.user_id, prt.expires_at, prt.used_at
             FROM password_reset_tokens prt
             INNER JOIN users u ON u.id = prt.user_id
             WHERE u.email = ?1 AND u.deleted_at IS NULL AND prt.token_hash = ?2
             ORDER BY prt.created_at DESC
             LIMIT 1",
            crate::params![email, &token_hash],
            |row| {
                Ok((
                    row.get_idx::<i64>(0)?,
                    row.get_idx::<String>(1)?,
                    row.get_idx::<Option<String>>(2)?,
                ))
            },
        )
        .ok();

    let Some((user_id, expires_at, used_at)) = row else {
        return Err("Invalid or expired reset link".into());
    };

    if used_at.is_some() {
        return Err("This reset link has already been used".into());
    }

    if expires_at < now {
        return Err("This reset link has expired".into());
    }

    let _ = conn.execute(
        "UPDATE password_reset_tokens SET used_at = ?1 WHERE user_id = ?2 AND token_hash = ?3 AND used_at IS NULL",
        crate::params![&now, user_id, &token_hash],
    );

    Ok(user_id)
}

pub fn build_reset_url(raw_token: &str, email: &str) -> String {
    let base = tenant_app_url();
    let q = serde_urlencoded::to_string(&[("token", raw_token), ("email", email.trim())])
        .unwrap_or_default();
    format!("{base}/reset-password?{q}")
}

pub async fn send_reset_email(
    to: &str,
    reset_url: &str,
    org_name: &str,
) -> Result<(), String> {
    let smtp_host = std::env::var("SMTP_HOST").unwrap_or_default();
    if smtp_host.is_empty() {
        if password_reset_debug_enabled() {
            log::info!(
                "Password reset link for {} ({}): {}",
                to,
                org_name,
                reset_url
            );
            return Ok(());
        }
        return Err("Email is not configured on this server".into());
    }

    let smtp_user = std::env::var("SMTP_USER").unwrap_or_default();
    let smtp_pass = std::env::var("SMTP_PASSWORD")
        .or_else(|_| std::env::var("SMTP_PASS"))
        .unwrap_or_default();
    let smtp_port = std::env::var("SMTP_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(587);
    let smtp_from = std::env::var("SMTP_FROM")
        .unwrap_or_else(|_| smtp_user.clone())
        .trim()
        .to_string();
    let from_addr = if smtp_from.is_empty() {
        "no-reply@hrm.local".to_string()
    } else {
        smtp_from
    };

    let app_name = std::env::var("APP_NAME").unwrap_or_else(|_| "RAINTECH HRM".to_string());
    let (plain, html) =
        crate::password_reset_email::render_password_reset_email(reset_url, to, org_name);

    let email_message = Message::builder()
        .from(from_addr.parse().map_err(|_| "Invalid SMTP_FROM".to_string())?)
        .to(to.parse().map_err(|_| "Invalid recipient email".to_string())?)
        .subject(format!("{app_name} — Reset your password"))
        .multipart(MultiPart::alternative_plain_html(plain, html))
        .map_err(|e| format!("Email build failed: {e}"))?;

    let creds = Credentials::new(smtp_user, smtp_pass);
    let mailer = SmtpTransport::starttls_relay(&smtp_host)
        .map_err(|e| format!("SMTP relay failed: {e}"))?
        .credentials(creds)
        .port(smtp_port)
        .build();

    let result = actix_web::web::block(move || mailer.send(&email_message)).await;
    match result {
        Ok(Ok(_)) => Ok(()),
        Ok(Err(e)) => Err(format!("Failed to send email: {e}")),
        Err(e) => Err(format!("Email task failed: {e}")),
    }
}
