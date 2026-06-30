//! Branded HTML email for password-reset OTP.

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

pub fn render_password_reset_otp_email(
    otp: &str,
    recipient_email: &str,
    org_name: &str,
) -> (String, String) {
    let safe_otp = html_escape(otp);
    let safe_email = html_escape(recipient_email);
    let safe_org = html_escape(org_name);
    let otp_display = otp_digits_display(otp);
    let year = chrono::Utc::now().format("%Y");

    let app_name = std::env::var("APP_NAME").unwrap_or_else(|_| "RAINTECH HRM".to_string());
    let safe_app = html_escape(&app_name);

    let plain = format!(
        "{app_name} — Password reset code\n\n\
         Your password reset code for {org_name} is: {otp}\n\n\
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
  <title>Password reset code — {safe_app}</title>
</head>
<body style="margin:0;padding:0;background-color:#F0F4F8;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F0F4F8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
          <tr>
            <td style="border-radius:16px 16px 0 0;background:linear-gradient(135deg,#040e1e 0%,#092244 45%,#071b3a 100%);padding:28px 32px;text-align:center;">
              <span style="font-size:18px;font-weight:700;color:#ffffff;">{safe_app}</span>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border-left:1px solid #dce8f8;border-right:1px solid #dce8f8;padding:36px 32px 28px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#001f3f;">Reset your password</h1>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#64748b;">
                Use this code to reset the password for <strong style="color:#071b3a;">{safe_email}</strong>
                at <strong style="color:#071b3a;">{safe_org}</strong>.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;">
                <tr>
                  <td align="center" style="background:linear-gradient(180deg,#f8fbff 0%,#eef4fc 100%);border:1px solid #dce8f8;border-radius:16px;padding:28px 24px;">
                    <p style="margin:0 0 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.14em;color:#64748b;">Reset code</p>
                    <p style="margin:0;font-family:'Courier New',Consolas,monospace;font-size:36px;font-weight:700;letter-spacing:0.28em;color:#001f3f;">{safe_otp}</p>
                    <p style="margin:14px 0 0;font-size:13px;color:#94a3b8;">{otp_display}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:14px;line-height:1.65;color:#64748b;">
                This code expires in 10 minutes. Do not share it with anyone.
              </p>
            </td>
          </tr>
          <tr>
            <td style="border-radius:0 0 16px 16px;background-color:#001f3f;padding:22px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;color:rgba(191,219,254,0.65);">&copy; {year} {safe_app}</p>
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
        safe_org = safe_org,
        safe_otp = safe_otp,
        otp_display = html_escape(&otp_display),
        year = year,
    );

    (plain, html)
}
