//! Branded HTML email for signup OTP — uses shared tenant email shell.

use crate::tenant_email::{html_escape, render_base_template, render_otp_code_block};

/// Plain-text + HTML bodies for the signup verification email.
pub fn render_signup_otp_email(otp: &str, recipient_email: &str) -> (String, String) {
    let app_name = std::env::var("APP_NAME").unwrap_or_else(|_| "RAINTECH HRM".to_string());
    let year = chrono::Utc::now().format("%Y");

    let plain = format!(
        "{app_name} — Verification code\n\n\
         Your one-time verification code is: {otp}\n\n\
         This code expires in 10 minutes.\n\
         Sent to: {recipient_email}\n\n\
         If you did not request this, you can safely ignore this email.\n\n\
         © {year} {app_name}"
    );

    let intro = format!(
        "Enter this code to complete your organization signup. It was requested for \
         <strong style=\"color:#071b3a;\">{}</strong>.",
        html_escape(recipient_email)
    );
    let body_html = render_otp_code_block(&intro, "Verification code", otp);
    let html = render_base_template("Verify your account", &body_html);

    (plain, html)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_otp_email_with_brand_colors() {
        let (plain, html) = render_signup_otp_email("482916", "user@example.com");
        assert!(plain.contains("482916"));
        assert!(html.contains("#001f3f"));
        assert!(html.contains("482916"));
        assert!(html.contains("user@example.com"));
        assert!(html.contains("Verify your account"));
    }

    #[test]
    fn escapes_html_in_email() {
        let (_, html) = render_signup_otp_email("123456", "a<b>@example.com");
        assert!(!html.contains("a<b>"));
        assert!(html.contains("&lt;b&gt;"));
    }
}
