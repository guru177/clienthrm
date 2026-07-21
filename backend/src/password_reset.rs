//! Link-based password reset (alternate to OTP flow). Used by `consume_token` on reset-password.
#![allow(dead_code)]

use crate::db::Connection;
use uuid::Uuid;

const TOKEN_TTL_SECS: i64 = 3600;

fn hash_token(token: &str) -> String {
    crate::otp_hash::hash_secret(token)
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
    let smtp = match crate::smtp_config::resolve_from_env() {
        Some(c) => c,
        None => {
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
    };

    let app_name = std::env::var("APP_NAME").unwrap_or_else(|_| "RAINTECH HRM".to_string());
    let (plain, html) =
        crate::password_reset_email::render_password_reset_email(reset_url, to, org_name);

    let email_message = crate::tenant_email::build_html_email(
        &smtp,
        to,
        &format!("{app_name} — Reset your password"),
        plain,
        html,
    )?;

    crate::tenant_email::send_built_email(smtp, email_message).await
}
