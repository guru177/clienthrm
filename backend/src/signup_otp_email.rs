//! Branded HTML email for signup OTP — matches tenant dashboard / auth theme.

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn otp_digits_display(otp: &str) -> String {
    otp.chars()
        .filter(|c| c.is_ascii_digit())
        .collect::<Vec<_>>()
        .chunks(3)
        .map(|chunk| chunk.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join(" ")
}

/// Plain-text + HTML bodies for the signup verification email.
pub fn render_signup_otp_email(otp: &str, recipient_email: &str) -> (String, String) {
    let safe_otp = html_escape(otp);
    let safe_email = html_escape(recipient_email);
    let otp_display = otp_digits_display(otp);
    let year = chrono::Utc::now().format("%Y");

    let app_name = std::env::var("APP_NAME").unwrap_or_else(|_| "RAINTECH HRM".to_string());
    let safe_app = html_escape(&app_name);

    let plain = format!(
        "{app_name} — Verification code\n\n\
         Your one-time verification code is: {otp}\n\n\
         This code expires in 10 minutes.\n\
         Sent to: {recipient_email}\n\n\
         If you did not request this, you can safely ignore this email.\n\n\
         © {year} {app_name}"
    );

    let html = format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Your verification code — {safe_app}</title>
</head>
<body style="margin:0;padding:0;background-color:#F0F4F8;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F0F4F8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
          <!-- Header -->
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
          <!-- Body card -->
          <tr>
            <td style="background-color:#ffffff;border-left:1px solid #dce8f8;border-right:1px solid #dce8f8;padding:36px 32px 28px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;line-height:1.3;color:#001f3f;letter-spacing:-0.02em;">Verify your account</h1>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#64748b;">
                Enter this code to complete your organization signup. It was requested for
                <strong style="color:#071b3a;">{safe_email}</strong>.
              </p>
              <!-- OTP box -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;">
                <tr>
                  <td align="center" style="background:linear-gradient(180deg,#f8fbff 0%,#eef4fc 100%);border:1px solid #dce8f8;border-radius:16px;padding:28px 24px;box-shadow:0 8px 32px rgba(7,27,58,0.07);">
                    <p style="margin:0 0 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.14em;color:#64748b;">Verification code</p>
                    <p style="margin:0;font-family:'Courier New',Consolas,monospace;font-size:36px;font-weight:700;letter-spacing:0.28em;color:#001f3f;">{safe_otp}</p>
                    <p style="margin:14px 0 0;font-size:13px;color:#94a3b8;">{otp_display}</p>
                  </td>
                </tr>
              </table>
              <!-- Expiry pill -->
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
                If you did not start a signup, you can ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
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
        safe_app = safe_app,
        safe_email = safe_email,
        safe_otp = safe_otp,
        otp_display = html_escape(&otp_display),
        year = year,
    );

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
