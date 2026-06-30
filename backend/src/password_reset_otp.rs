use crate::db::Connection;
use lettre::message::MultiPart;
use lettre::Message;
use uuid::Uuid;

const OTP_TTL_SECS: i64 = 600;
const RESET_WINDOW_SECS: i64 = 1800;
const MAX_ATTEMPTS: i32 = 5;

fn otp_pepper() -> String {
    std::env::var("JWT_SECRET").unwrap_or_else(|_| "hrm-otp-pepper".into())
}

fn hash_otp(otp: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in otp_pepper().as_bytes().iter().chain(otp.as_bytes()) {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", h)
}

pub fn debug_enabled() -> bool {
    std::env::var("SIGNUP_OTP_DEBUG")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(cfg!(debug_assertions))
}

pub fn mask_email(email: &str) -> String {
    let Some((local, domain)) = email.split_once('@') else {
        return "***".to_string();
    };
    let visible = local.chars().take(1).collect::<String>();
    format!("{visible}***@{domain}")
}

pub fn store_challenge(
    conn: &Connection,
    user_id: i64,
    organization_id: i64,
    email: &str,
    otp: &str,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let now_str = now.format("%Y-%m-%d %H:%M:%S").to_string();
    let expires = (now + chrono::Duration::seconds(OTP_TTL_SECS))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();

    let _ = conn.execute(
        "DELETE FROM password_reset_otp_challenges WHERE user_id = ?1 AND verified_at IS NULL",
        [user_id],
    );

    conn.execute(
        "INSERT INTO password_reset_otp_challenges
         (id, user_id, organization_id, email, otp_hash, attempts, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)",
        crate::params![
            &id,
            user_id,
            organization_id,
            email,
            hash_otp(otp),
            &expires,
            &now_str
        ],
    )
    .map_err(|e| format!("Failed to store OTP challenge: {e}"))?;

    Ok(id)
}

pub fn verify_otp(conn: &Connection, verification_id: &str, otp: &str) -> Result<i64, String> {
    let now = chrono::Utc::now();
    let now_str = now.format("%Y-%m-%d %H:%M:%S").to_string();

    let row = conn
        .query_row(
            "SELECT user_id, otp_hash, attempts, expires_at, verified_at
             FROM password_reset_otp_challenges WHERE id = ?1",
            [verification_id],
            |r| {
                Ok((
                    r.get_idx::<i64>(0)?,
                    r.get_idx::<String>(1)?,
                    r.get_idx::<i64>(2)?,
                    r.get_idx::<String>(3)?,
                    r.get_idx::<Option<String>>(4)?,
                ))
            },
        )
        .map_err(|_| "Invalid or expired verification. Request a new code.".to_string())?;

    let (user_id, otp_hash, attempts, expires_at, verified_at) = row;

    if verified_at.is_some() {
        return Ok(user_id);
    }

    if expires_at < now_str {
        let _ = conn.execute(
            "DELETE FROM password_reset_otp_challenges WHERE id = ?1",
            [verification_id],
        );
        return Err("Verification code expired. Request a new code.".to_string());
    }

    if attempts >= MAX_ATTEMPTS as i64 {
        let _ = conn.execute(
            "DELETE FROM password_reset_otp_challenges WHERE id = ?1",
            [verification_id],
        );
        return Err("Too many failed attempts. Request a new code.".to_string());
    }

    if hash_otp(otp.trim()) != otp_hash {
        let _ = conn.execute(
            "UPDATE password_reset_otp_challenges SET attempts = attempts + 1 WHERE id = ?1",
            [verification_id],
        );
        return Err("Invalid verification code.".to_string());
    }

    let reset_expires = (now + chrono::Duration::seconds(RESET_WINDOW_SECS))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();

    conn.execute(
        "UPDATE password_reset_otp_challenges
         SET verified_at = ?1, reset_expires_at = ?2, attempts = 0
         WHERE id = ?3",
        crate::params![&now_str, &reset_expires, verification_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(user_id)
}

pub fn consume_verified_challenge(conn: &Connection, verification_id: &str) -> Result<i64, String> {
    let now_str = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let row = conn
        .query_row(
            "SELECT user_id, verified_at, reset_expires_at
             FROM password_reset_otp_challenges WHERE id = ?1",
            [verification_id],
            |r| {
                Ok((
                    r.get_idx::<i64>(0)?,
                    r.get_idx::<Option<String>>(1)?,
                    r.get_idx::<Option<String>>(2)?,
                ))
            },
        )
        .map_err(|_| "Invalid or expired reset session. Start again.".to_string())?;

    let (user_id, verified_at, reset_expires_at) = row;
    let Some(verified_at) = verified_at else {
        return Err("Verify the code before setting a new password.".to_string());
    };
    if verified_at.is_empty() {
        return Err("Verify the code before setting a new password.".to_string());
    }

    let Some(reset_expires_at) = reset_expires_at else {
        return Err("Reset session expired. Request a new code.".to_string());
    };
    if reset_expires_at < now_str {
        let _ = conn.execute(
            "DELETE FROM password_reset_otp_challenges WHERE id = ?1",
            [verification_id],
        );
        return Err("Reset session expired. Request a new code.".to_string());
    }

    let _ = conn.execute(
        "DELETE FROM password_reset_otp_challenges WHERE id = ?1",
        [verification_id],
    );

    Ok(user_id)
}

pub async fn send_otp_email(
    conn: &crate::db::Connection,
    org_id: i64,
    to: &str,
    otp: &str,
    org_name: &str,
) -> Result<(), String> {
    let smtp = match crate::smtp_config::resolve(conn, org_id) {
        Some(c) => c,
        None => {
            if debug_enabled() {
                log::info!("Password reset OTP for {} ({}): {}", to, org_name, otp);
                return Ok(());
            }
            return Err("Email is not configured (set in App Settings or .env)".into());
        }
    };

    let app_name = std::env::var("APP_NAME").unwrap_or_else(|_| "RAINTECH HRM".to_string());
    let (plain, html) =
        crate::password_reset_otp_email::render_password_reset_otp_email(otp, to, org_name);

    let email_message = Message::builder()
        .from(smtp.from_mailbox().map_err(|e| e)?)
        .to(to.parse().map_err(|_| "Invalid recipient email".to_string())?)
        .subject(format!("{app_name} — Password reset code"))
        .multipart(MultiPart::alternative_plain_html(plain, html))
        .map_err(|e| format!("Email build failed: {e}"))?;

    let result = actix_web::web::block(move || smtp.send(&email_message)).await;
    match result {
        Ok(Ok(_)) => Ok(()),
        Ok(Err(e)) => Err(format!("Failed to send email: {e}")),
        Err(e) => Err(format!("Email task failed: {e}")),
    }
}
