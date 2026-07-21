use crate::db::Connection;
use crate::models::organization::SignupRequest;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const OTP_TTL_SECS: i64 = 600;
const MAX_ATTEMPTS: i32 = 5;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignupOtpPayload {
    pub organization_name: String,
    pub org_slug: String,
    pub company_email: String,
    pub company_phone: String,
    pub contact_person: String,
    pub country: String,
    pub timezone: String,
    pub admin_name: String,
    pub admin_email: String,
    pub admin_mobile: String,
    pub admin_password: String,
}

impl SignupOtpPayload {
    pub fn from_request(body: &SignupRequest) -> Self {
        Self {
            organization_name: body.organization_name.trim().to_string(),
            org_slug: crate::tenant::normalize_org_slug(&body.org_slug),
            company_email: body.company_email.trim().to_string(),
            company_phone: body.company_phone.trim().to_string(),
            contact_person: body.contact_person.trim().to_string(),
            country: body.country.trim().to_string(),
            timezone: body.timezone.trim().to_string(),
            admin_name: body.admin_name.trim().to_string(),
            admin_email: body.admin_email.trim().to_string(),
            admin_mobile: body.admin_mobile.trim().to_string(),
            admin_password: body.admin_password.clone(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct SendSignupOtpRequest {
    pub channel: String,
    #[serde(flatten)]
    pub signup: SignupRequest,
}

pub fn signup_otp_debug_enabled() -> bool {
    std::env::var("SIGNUP_OTP_DEBUG")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(cfg!(debug_assertions))
}

pub fn signup_otp_required() -> bool {
    !std::env::var("SIGNUP_OTP_BYPASS")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn hash_otp(otp: &str) -> String {
    crate::otp_hash::hash_secret(otp)
}

pub fn generate_otp() -> String {
    crate::otp_hash::generate_otp()
}

pub fn mask_email(email: &str) -> String {
    let Some((local, domain)) = email.split_once('@') else {
        return "***".to_string();
    };
    let visible = local.chars().take(1).collect::<String>();
    format!("{visible}***@{domain}")
}

pub fn mask_phone(phone: &str) -> String {
    let digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() < 4 {
        return "***".to_string();
    }
    format!("***{}", &digits[digits.len().saturating_sub(4)..])
}

pub fn destination_for_channel(channel: &str, payload: &SignupOtpPayload) -> Option<String> {
    match channel {
        "email" => Some(payload.admin_email.clone()),
        "whatsapp" => Some(payload.admin_mobile.clone()),
        _ => None,
    }
}

pub fn store_challenge(
    conn: &Connection,
    channel: &str,
    destination: &str,
    otp: &str,
    payload: &SignupOtpPayload,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let json = serde_json::to_string(payload).map_err(|e| e.to_string())?;
    let expires = (chrono::Utc::now() + chrono::Duration::seconds(OTP_TTL_SECS))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "DELETE FROM signup_otp_challenges WHERE expires_at < ?1",
        [&now],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO signup_otp_challenges (id, channel, destination, otp_hash, payload_json, attempts, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)",
        crate::params![&id, channel, destination, hash_otp(otp), &json, &expires, &now],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

pub fn verify_and_consume(
    conn: &Connection,
    verification_id: &str,
    otp: &str,
) -> Result<SignupOtpPayload, String> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let row = conn
        .query_row(
            "SELECT channel, destination, otp_hash, payload_json, attempts, expires_at
             FROM signup_otp_challenges WHERE id = ?1",
            [verification_id],
            |r| {
                Ok((
                    r.get_idx::<String>(0)?,
                    r.get_idx::<String>(1)?,
                    r.get_idx::<String>(2)?,
                    r.get_idx::<String>(3)?,
                    r.get_idx::<i64>(4)?,
                    r.get_idx::<String>(5)?,
                ))
            },
        )
        .map_err(|_| "Invalid or expired verification. Request a new code.".to_string())?;

    let (channel, destination, otp_hash, payload_json, attempts, expires_at) = row;

    if expires_at < now {
        let _ = conn.execute(
            "DELETE FROM signup_otp_challenges WHERE id = ?1",
            [verification_id],
        );
        return Err("Verification code expired. Request a new code.".to_string());
    }

    if attempts >= MAX_ATTEMPTS as i64 {
        let _ = conn.execute(
            "DELETE FROM signup_otp_challenges WHERE id = ?1",
            [verification_id],
        );
        return Err("Too many failed attempts. Request a new code.".to_string());
    }

    if hash_otp(otp) != otp_hash {
        let _ = conn.execute(
            "UPDATE signup_otp_challenges SET attempts = attempts + 1 WHERE id = ?1",
            [verification_id],
        );
        return Err("Invalid verification code.".to_string());
    }

    let _ = conn.execute(
        "DELETE FROM signup_otp_challenges WHERE id = ?1",
        [verification_id],
    );

    let payload: SignupOtpPayload = serde_json::from_str(&payload_json)
        .map_err(|_| "Stored signup data is invalid".to_string())?;

    log::info!(
        "Signup OTP verified via {} for {}",
        channel,
        mask_destination(&channel, &destination)
    );

    Ok(payload)
}

fn mask_destination(channel: &str, destination: &str) -> String {
    if channel == "email" {
        mask_email(destination)
    } else {
        mask_phone(destination)
    }
}

pub async fn send_email_otp(to: &str, otp: &str) -> Result<(), String> {
    let smtp = match crate::smtp_config::resolve_from_env() {
        Some(c) => c,
        None => {
            if signup_otp_debug_enabled() {
                log::warn!("SMTP unset — signup OTP email not sent (debug mode)");
                return Ok(());
            }
            return Err("Email OTP is not configured (set SMTP in .env)".to_string());
        }
    };

    let (plain_body, html_body) =
        crate::signup_otp_email::render_signup_otp_email(otp, to);

    let subject = format!(
        "{} — Your verification code",
        std::env::var("APP_NAME").unwrap_or_else(|_| "RAINTECH HRM".to_string())
    );
    let email_message = crate::tenant_email::build_html_email(
        &smtp,
        to,
        &subject,
        plain_body,
        html_body,
    )
    .map_err(|e| e)?;

    let result = crate::tenant_email::send_built_email(smtp, email_message).await;
    match result {
        Ok(()) => Ok(()),
        Err(e) => {
            // Debug/QA builds expose debug_otp — don't block signup when SMTP is flaky.
            if signup_otp_debug_enabled() {
                log::warn!("Signup OTP email send failed (debug mode continues): {e}");
                return Ok(());
            }
            Err(e)
        }
    }
}

pub async fn send_whatsapp_otp(phone: &str, otp: &str) -> Result<(), String> {
    let auth_key = std::env::var("MSG91_AUTH_KEY")
        .or_else(|_| std::env::var("MSG91_AUTHKEY"))
        .unwrap_or_default();
    if auth_key.is_empty() {
        if signup_otp_debug_enabled() {
            log::warn!("MSG91_AUTH_KEY unset — signup OTP WhatsApp not sent (debug mode)");
            return Ok(());
        }
        return Err(
            "WhatsApp OTP is not configured (set MSG91_AUTH_KEY in backend .env)".to_string(),
        );
    }

    let phone_digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
    if phone_digits.len() < 10 {
        return Err("Invalid mobile number for WhatsApp OTP".to_string());
    }

    let integrated = std::env::var("MSG91_INTEGRATED_NUMBER").unwrap_or_default();
    if integrated.trim().is_empty() {
        return Err(
            "WhatsApp OTP is not configured (set MSG91_INTEGRATED_NUMBER in backend .env)"
                .to_string(),
        );
    }
    let sender: String = integrated.chars().filter(|c| c.is_ascii_digit()).collect();

    let template_name = std::env::var("MSG91_TEMPLATE_NAME")
        .unwrap_or_else(|_| "brcddyotp".to_string());
    let namespace = std::env::var("MSG91_TEMPLATE_NAMESPACE").map_err(|_| {
        "WhatsApp OTP template not configured (set MSG91_TEMPLATE_NAMESPACE in backend .env)"
            .to_string()
    })?;
    let language = std::env::var("MSG91_TEMPLATE_LANGUAGE").unwrap_or_else(|_| "en".to_string());

    let body_key = std::env::var("MSG91_TEMPLATE_BODY_PARAM_KEY")
        .unwrap_or_else(|_| "body_1".to_string());
    let body_component = if body_key == "otp" {
        "body_1".to_string()
    } else {
        body_key
    };

    let mut components = serde_json::Map::new();
    components.insert(
        body_component,
        serde_json::json!({
            "type": "text",
            "value": otp
        }),
    );

    let button_key = std::env::var("MSG91_TEMPLATE_BUTTON_KEY").unwrap_or_else(|_| "button_1".to_string());
    if !button_key.trim().is_empty() {
        components.insert(
            button_key,
            serde_json::json!({
                "subtype": "url",
                "type": "text",
                "value": otp
            }),
        );
    }

    let payload = serde_json::json!({
        "integrated_number": sender,
        "content_type": "template",
        "payload": {
            "messaging_product": "whatsapp",
            "type": "template",
            "template": {
                "name": template_name,
                "language": {
                    "code": language,
                    "policy": "deterministic"
                },
                "namespace": namespace,
                "to_and_components": [{
                    "to": [phone_digits],
                    "components": components
                }]
            }
        }
    });

    let client = reqwest::Client::new();
    let resp = match client
        .post("https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/")
        .header("authkey", &auth_key)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            let err = format!("MSG91 request failed: {e}");
            if signup_otp_debug_enabled() {
                log::warn!("Signup WhatsApp OTP failed (debug mode continues): {err}");
                return Ok(());
            }
            return Err(err);
        }
    };

    if resp.status().is_success() {
        log::info!(
            "Signup WhatsApp OTP dispatched via template {} to {}",
            template_name,
            mask_phone(&phone_digits)
        );
        Ok(())
    } else {
        let body = resp.text().await.unwrap_or_default();
        log::error!("MSG91 WhatsApp OTP failed: {body}");
        let err = format!(
            "MSG91 rejected WhatsApp OTP: {}",
            if body.is_empty() {
                "unknown error".to_string()
            } else {
                body
            }
        );
        if signup_otp_debug_enabled() {
            log::warn!("Signup WhatsApp OTP failed (debug mode continues): {err}");
            return Ok(());
        }
        Err(err)
    }
}

pub async fn dispatch_otp(channel: &str, destination: &str, otp: &str) -> Result<(), String> {
    match channel {
        "email" => send_email_otp(destination, otp).await,
        "whatsapp" => send_whatsapp_otp(destination, otp).await,
        _ => Err("Channel must be email or whatsapp".to_string()),
    }
}
