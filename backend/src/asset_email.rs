//! Branded HTML email for asset allocation and expenses — matches tenant dashboard / auth theme.

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn render_base_template(title: &str, body_html: &str) -> String {
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
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;line-height:1.3;color:#001f3f;letter-spacing:-0.02em;">{title}</h1>
              {body_html}
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
        title = html_escape(title),
        safe_app = safe_app,
        body_html = body_html,
        year = year,
    )
}

pub fn render_allocation_email(asset_name: &str, allocated_date: &str) -> (String, String) {
    let plain = format!(
        "Asset Allocation Notice\n\n\
         You have been allocated a new asset: {asset_name}.\n\
         Date: {allocated_date}\n\n\
         Please take care of the asset. You can view it in your dashboard."
    );

    let body_html = format!(
        r#"<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#64748b;">
             You have been allocated a new asset from your organization.
           </p>
           <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
             <tr>
               <td style="background:linear-gradient(180deg,#f8fbff 0%,#eef4fc 100%);border:1px solid #dce8f8;border-radius:12px;padding:20px;box-shadow:0 4px 12px rgba(7,27,58,0.04);">
                 <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;">Asset Name</p>
                 <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#001f3f;">{asset_name}</p>
                 <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;">Allocated On</p>
                 <p style="margin:0;font-size:15px;font-weight:500;color:#001f3f;">{allocated_date}</p>
               </td>
             </tr>
           </table>
           <p style="margin:0;font-size:14px;line-height:1.65;color:#64748b;">
             You can view this asset and log any related expenses directly from your employee dashboard.
           </p>"#,
        asset_name = html_escape(asset_name),
        allocated_date = html_escape(allocated_date),
    );

    let html = render_base_template("New Asset Allocated", &body_html);
    (plain, html)
}

pub fn render_expense_email(asset_name: &str, amount: f64, logged_by_name: &str) -> (String, String) {
    let plain = format!(
        "Asset Expense Logged\n\n\
         A new expense was logged by {logged_by_name}.\n\
         Asset: {asset_name}\n\
         Amount: Rs. {amount}\n\n\
         Please review this expense in the admin panel."
    );

    let body_html = format!(
        r#"<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#64748b;">
             A new asset expense has been logged and requires your review.
           </p>
           <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
             <tr>
               <td style="background:linear-gradient(180deg,#f8fbff 0%,#eef4fc 100%);border:1px solid #dce8f8;border-radius:12px;padding:20px;box-shadow:0 4px 12px rgba(7,27,58,0.04);">
                 <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;">Logged By</p>
                 <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#001f3f;">{logged_by}</p>
                 <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;">Asset</p>
                 <p style="margin:0 0 16px;font-size:16px;font-weight:500;color:#001f3f;">{asset_name}</p>
                 <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;">Amount</p>
                 <p style="margin:0;font-size:20px;font-weight:700;color:#071b3a;">Rs. {amount}</p>
               </td>
             </tr>
           </table>
           <p style="margin:0;font-size:14px;line-height:1.65;color:#64748b;">
             Please log in to the admin dashboard to approve or reject this expense.
           </p>"#,
        logged_by = html_escape(logged_by_name),
        asset_name = html_escape(asset_name),
        amount = amount,
    );

    let html = render_base_template("New Expense Logged", &body_html);
    (plain, html)
}
