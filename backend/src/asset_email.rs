//! Branded HTML email for asset allocation and expenses.

use crate::tenant_email::{html_escape, render_base_template};

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

pub fn render_expense_review_email(
    asset_name: &str,
    amount: f64,
    status: &str,
) -> (String, String) {
    let status_label = status.to_uppercase();
    let plain = format!(
        "Expense Log {status_label}\n\n\
         Your expense log of Rs. {amount} for asset '{asset_name}' has been {status}."
    );
    let body_html = format!(
        r#"<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#64748b;">
             Your asset expense has been reviewed.
           </p>
           <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
             <tr>
               <td style="background:linear-gradient(180deg,#f8fbff 0%,#eef4fc 100%);border:1px solid #dce8f8;border-radius:12px;padding:20px;">
                 <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;">Asset</p>
                 <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#001f3f;">{asset}</p>
                 <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;">Amount</p>
                 <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#071b3a;">Rs. {amount}</p>
                 <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;">Decision</p>
                 <p style="margin:0;font-size:16px;font-weight:700;color:#001f3f;">{status}</p>
               </td>
             </tr>
           </table>"#,
        asset = html_escape(asset_name),
        amount = amount,
        status = html_escape(status),
    );
    let title = format!("Expense Log {status_label}");
    let html = render_base_template(&title, &body_html);
    (plain, html)
}
