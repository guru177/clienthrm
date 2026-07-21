//! Branded HTML email for password reset links — uses shared tenant email shell.
#![allow(dead_code)]

use crate::tenant_email::{html_escape, render_base_template};

/// Plain-text + HTML bodies for the password reset email.
pub fn render_password_reset_email(
    reset_url: &str,
    recipient_email: &str,
    org_name: &str,
) -> (String, String) {
    let app_name = std::env::var("APP_NAME").unwrap_or_else(|_| "RAINTECH HRM".to_string());
    let year = chrono::Utc::now().format("%Y");
    let safe_url = html_escape(reset_url);

    let plain = format!(
        "{app_name} — Reset your password\n\n\
         We received a request to reset the password for {recipient_email} ({org_name}).\n\n\
         Open this link to choose a new password (expires in 60 minutes):\n\
         {reset_url}\n\n\
         If you did not request this, you can safely ignore this email.\n\n\
         © {year} {app_name}"
    );

    let body_html = format!(
        r#"<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#64748b;">
             A password reset was requested for
             <strong style="color:#071b3a;">{safe_email}</strong>
             at <strong style="color:#071b3a;">{safe_org}</strong>.
           </p>
           <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
             <tr>
               <td align="center">
                 <a href="{safe_url}" style="display:inline-block;background-color:#001f3f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:10px;">
                   Reset password
                 </a>
               </td>
             </tr>
           </table>
           <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#64748b;">
             Or copy this link into your browser:<br />
             <span style="word-break:break-all;color:#071b3a;">{safe_url}</span>
           </p>
           <p style="margin:0;font-size:13px;color:#94a3b8;">This link expires in 60 minutes. If you did not request a reset, ignore this email.</p>"#,
        safe_email = html_escape(recipient_email),
        safe_org = html_escape(org_name),
        safe_url = safe_url,
    );
    let html = render_base_template("Reset your password", &body_html);

    (plain, html)
}
