//! Branded HTML email for password-reset OTP — uses shared tenant email shell.

use crate::tenant_email::{html_escape, render_base_template, render_otp_code_block};

pub fn render_password_reset_otp_email(
    otp: &str,
    recipient_email: &str,
    org_name: &str,
) -> (String, String) {
    let app_name = std::env::var("APP_NAME").unwrap_or_else(|_| "RAINTECH HRM".to_string());
    let year = chrono::Utc::now().format("%Y");

    let plain = format!(
        "{app_name} — Password reset code\n\n\
         Your password reset code for {org_name} is: {otp}\n\n\
         This code expires in 10 minutes.\n\
         Sent to: {recipient_email}\n\n\
         If you did not request this, you can safely ignore this email.\n\n\
         © {year} {app_name}"
    );

    let intro = format!(
        "Use this code to reset the password for \
         <strong style=\"color:#071b3a;\">{}</strong> at \
         <strong style=\"color:#071b3a;\">{}</strong>.",
        html_escape(recipient_email),
        html_escape(org_name)
    );
    let body_html = render_otp_code_block(&intro, "Reset code", otp);
    let html = render_base_template("Reset your password", &body_html);

    (plain, html)
}
