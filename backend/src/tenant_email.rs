//! Shared tenant email helpers — branded HTML shell, recipient lookup, fire-and-forget SMTP.

use crate::db::Connection;
use crate::smtp_config::SmtpConfig;
use lettre::message::MultiPart;
use lettre::Message;

pub fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// When set (e.g. for QA), all outbound mail is delivered to this inbox instead.
pub fn resolve_recipient(original: &str) -> (String, Option<String>) {
    let trimmed = original.trim();
    if trimmed.is_empty() {
        return (String::new(), None);
    }
    let override_to = std::env::var("MAIL_OVERRIDE")
        .or_else(|_| std::env::var("MAIL_TEST_TO"))
        .unwrap_or_default();
    let override_to = override_to.trim();
    if !override_to.is_empty() && !override_to.eq_ignore_ascii_case(trimmed) {
        return (override_to.to_string(), Some(trimmed.to_string()));
    }
    (trimmed.to_string(), None)
}

pub fn resolve_subject(subject: &str, original_recipient: Option<&str>) -> String {
    match original_recipient.filter(|r| !r.is_empty()) {
        Some(orig) => format!("[TEST → {orig}] {subject}"),
        None => subject.to_string(),
    }
}

pub fn otp_digits_display(otp: &str) -> String {
    otp.chars()
        .filter(|c| c.is_ascii_digit())
        .collect::<Vec<_>>()
        .chunks(3)
        .map(|chunk| chunk.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join(" ")
}

/// OTP code block used by signup / password-reset verification emails.
pub fn render_otp_code_block(intro_html: &str, label: &str, otp: &str) -> String {
    let safe_otp = html_escape(otp);
    let otp_display = html_escape(&otp_digits_display(otp));
    let safe_label = html_escape(label);
    format!(
        r#"<p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#64748b;">{intro_html}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;">
  <tr>
    <td align="center" style="background:linear-gradient(180deg,#f8fbff 0%,#eef4fc 100%);border:1px solid #dce8f8;border-radius:16px;padding:28px 24px;box-shadow:0 8px 32px rgba(7,27,58,0.07);">
      <p style="margin:0 0 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.14em;color:#64748b;">{safe_label}</p>
      <p style="margin:0;font-family:'Courier New',Consolas,monospace;font-size:36px;font-weight:700;letter-spacing:0.28em;color:#001f3f;">{safe_otp}</p>
      <p style="margin:14px 0 0;font-size:13px;color:#94a3b8;">{otp_display}</p>
    </td>
  </tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
  <tr>
    <td align="center">
      <span style="display:inline-block;background-color:#eef4fc;border:1px solid #dce8f8;border-radius:999px;padding:8px 16px;font-size:13px;font-weight:600;color:#071b3a;">
        Expires in 10 minutes
      </span>
    </td>
  </tr>
</table>
<p style="margin:0;font-size:14px;line-height:1.65;color:#64748b;">
  Do not share this code with anyone. Our team will never ask for it.
  If you did not request this, you can ignore this email.
</p>"#,
        intro_html = intro_html,
        safe_label = safe_label,
        safe_otp = safe_otp,
        otp_display = otp_display,
    )
}

pub fn build_html_email(
    smtp: &SmtpConfig,
    to: &str,
    subject: &str,
    plain: String,
    html: String,
) -> Result<Message, String> {
    let (actual_to, original) = resolve_recipient(to);
    if actual_to.is_empty() {
        return Err("Empty recipient email".into());
    }
    let subject = resolve_subject(subject, original.as_deref());
    let from = smtp.from_mailbox()?;
    let to_addr = actual_to
        .parse()
        .map_err(|_| "Invalid email address".to_string())?;
    Message::builder()
        .from(from)
        .to(to_addr)
        .subject(subject)
        .multipart(MultiPart::alternative_plain_html(plain, html))
        .map_err(|e| format!("Email build failed: {e}"))
}

pub async fn send_built_email(smtp: SmtpConfig, message: Message) -> Result<(), String> {
    actix_web::web::block(move || smtp.send(&message))
        .await
        .map_err(|e| format!("Email task failed: {e}"))?
        .map_err(|e| format!("SMTP send failed: {e}"))
}

/// Branded HTML email shell (matches tenant dashboard / auth theme).
pub fn render_base_template(title: &str, body_html: &str) -> String {
    let year = chrono::Utc::now().format("%Y");
    let app_name = std::env::var("APP_NAME").unwrap_or_else(|_| "RAINTECH HRM".to_string());
    let safe_app = html_escape(&app_name);

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>{title} — {safe_app}</title>
</head>
<body style="margin:0;padding:0;background-color:#F0F4F8;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F0F4F8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
          <tr>
            <td style="border-radius:16px 16px 0 0;background:linear-gradient(135deg,#040e1e 0%,#092244 45%,#071b3a 100%);padding:28px 32px;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.22);border-radius:14px;padding:10px 18px;margin-bottom:14px;">
                      <span style="font-size:18px;font-weight:700;letter-spacing:0.04em;color:#ffffff;">{safe_app}</span>
                    </div>
                    <p style="margin:0;font-size:13px;font-weight:500;color:rgba(191,219,254,0.85);letter-spacing:0.02em;">Workforce management platform</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border-left:1px solid #dce8f8;border-right:1px solid #dce8f8;padding:36px 32px 28px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;line-height:1.3;color:#001f3f;letter-spacing:-0.02em;">{title}</h1>
              {body_html}
            </td>
          </tr>
          <tr>
            <td style="border-radius:0 0 16px 16px;background-color:#001f3f;border:1px solid #001f3f;padding:22px 32px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.92);">{safe_app}</p>
              <p style="margin:0;font-size:11px;color:rgba(191,219,254,0.65);">
                Secure · Compliant · Built for modern HR teams
              </p>
              <p style="margin:14px 0 0;font-size:11px;color:rgba(191,219,254,0.45);">
                &copy; {year} {safe_app}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"#,
        title = html_escape(title),
        safe_app = safe_app,
        body_html = body_html,
        year = year,
    )
}

/// Active user email by id (None if missing/empty).
pub fn user_email(conn: &Connection, user_id: i64) -> Option<String> {
    conn.query_row(
        "SELECT email FROM users WHERE id = ?1 AND deleted_at IS NULL",
        crate::params![user_id],
        |row| row.get_idx::<String>(0),
    )
    .ok()
    .map(|e| e.trim().to_string())
    .filter(|e| !e.is_empty())
}

pub fn user_name(conn: &Connection, user_id: i64) -> Option<String> {
    conn.query_row(
        "SELECT name FROM users WHERE id = ?1 AND deleted_at IS NULL",
        crate::params![user_id],
        |row| row.get_idx::<String>(0),
    )
    .ok()
    .filter(|n| !n.trim().is_empty())
}

/// Distinct active user emails that hold a permission slug (via roles).
pub fn emails_with_permission(conn: &Connection, org_id: i64, permission_slug: &str) -> Vec<String> {
    let mut emails = Vec::new();
    let Ok(stmt) = conn.prepare(
        "SELECT DISTINCT u.email FROM users u
         JOIN role_user ru ON u.id = ru.user_id
         JOIN permission_role pr ON ru.role_id = pr.role_id
         JOIN permissions p ON p.id = pr.permission_id
         WHERE u.organization_id = ?1
           AND p.slug = ?2
           AND u.status = 'active'
           AND u.deleted_at IS NULL
           AND u.email IS NOT NULL
           AND TRIM(u.email) != ''",
    ) else {
        return emails;
    };
    for email in stmt.query_map(crate::params![org_id, permission_slug], |row| {
        row.get_idx::<String>(0)
    }) {
        let e = email.trim().to_string();
        if !e.is_empty() && !emails.iter().any(|x| x == &e) {
            emails.push(e);
        }
    }
    // Super-admins in org also receive admin-style notices
    if let Ok(stmt) = conn.prepare(
        "SELECT DISTINCT email FROM users
         WHERE organization_id = ?1
           AND is_super_admin = 1
           AND status = 'active'
           AND deleted_at IS NULL
           AND email IS NOT NULL
           AND TRIM(email) != ''",
    ) {
        for email in stmt.query_map(crate::params![org_id], |row| row.get_idx::<String>(0)) {
            let e = email.trim().to_string();
            if !e.is_empty() && !emails.iter().any(|x| x == &e) {
                emails.push(e);
            }
        }
    }
    emails
}

/// Union of emails for any of the given permission slugs.
pub fn emails_with_any_permission(
    conn: &Connection,
    org_id: i64,
    permission_slugs: &[&str],
) -> Vec<String> {
    let mut out = Vec::new();
    for slug in permission_slugs {
        for e in emails_with_permission(conn, org_id, slug) {
            if !out.iter().any(|x| x == &e) {
                out.push(e);
            }
        }
    }
    out
}

/// Best-effort async send to one recipient. No-ops if SMTP missing or address invalid.
pub fn send_tenant_email(
    conn: &Connection,
    org_id: i64,
    to: &str,
    subject: &str,
    plain: String,
    html: String,
) {
    let to = to.trim();
    if to.is_empty() {
        return;
    }
    let Some(smtp) = crate::smtp_config::resolve(conn, org_id) else {
        return;
    };
    let Ok(msg) = build_html_email(&smtp, to, subject, plain, html) else {
        return;
    };
    actix_web::rt::spawn(async move {
        if let Err(e) = send_built_email(smtp, msg).await {
            log::warn!("tenant email send failed: {e}");
        } else {
            log::info!("tenant email sent successfully");
        }
    });
}

/// Best-effort async send to many recipients (each gets their own message).
pub fn send_tenant_email_bulk(
    conn: &Connection,
    org_id: i64,
    recipients: &[String],
    subject: &str,
    plain: String,
    html: String,
) {
    for to in recipients {
        send_tenant_email(conn, org_id, to, subject, plain.clone(), html.clone());
    }
}
