//! Grocery benefits notification emails.

use crate::tenant_email::{html_escape, render_base_template};

pub fn render_enrolled_email(
    subsidy_percentage: i64,
    monthly_allowance: f64,
    start_date: &str,
) -> (String, String) {
    let plain = format!(
        "Grocery Benefit Enrolled\n\n\
         You have been enrolled in the grocery benefit program.\n\
         Subsidy: {subsidy_percentage}%\n\
         Monthly allowance: Rs. {monthly_allowance}\n\
         Start date: {start_date}"
    );
    let body_html = format!(
        r#"<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#64748b;">
             You are now enrolled in the company grocery benefit program.
           </p>
           <table role="presentation" width="100%">
             <tr><td style="background:#f8fbff;border:1px solid #dce8f8;border-radius:12px;padding:20px;">
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Subsidy</p>
               <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#001f3f;">{pct}%</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Monthly Allowance</p>
               <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#071b3a;">Rs. {allowance}</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Start Date</p>
               <p style="margin:0;font-size:15px;color:#001f3f;">{start}</p>
             </td></tr>
           </table>"#,
        pct = subsidy_percentage,
        allowance = monthly_allowance,
        start = html_escape(start_date),
    );
    (plain, render_base_template("Grocery Benefit Enrolled", &body_html))
}

pub fn render_claim_logged_email(
    employee_name: &str,
    amount: f64,
    claim_month: i64,
    claim_year: i64,
) -> (String, String) {
    let plain = format!(
        "Grocery Claim Submitted\n\n\
         {employee_name} submitted a grocery claim of Rs. {amount} for {claim_month}/{claim_year}.\n\
         Please review it in Grocery Benefits."
    );
    let body_html = format!(
        r#"<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#64748b;">
             A grocery claim is pending your review.
           </p>
           <table role="presentation" width="100%">
             <tr><td style="background:#f8fbff;border:1px solid #dce8f8;border-radius:12px;padding:20px;">
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Employee</p>
               <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#001f3f;">{employee}</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Amount</p>
               <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#071b3a;">Rs. {amount}</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Period</p>
               <p style="margin:0;font-size:15px;color:#001f3f;">{month}/{year}</p>
             </td></tr>
           </table>"#,
        employee = html_escape(employee_name),
        amount = amount,
        month = claim_month,
        year = claim_year,
    );
    (plain, render_base_template("Grocery Claim Submitted", &body_html))
}

pub fn render_claim_reviewed_email(amount: f64, status: &str, notes: Option<&str>) -> (String, String) {
    let status_label = status.to_uppercase();
    let notes_plain = notes.unwrap_or("");
    let plain = format!(
        "Grocery Claim {status_label}\n\n\
         Your grocery claim of Rs. {amount} has been {status}.\n\
         {notes_plain}"
    );
    let notes_html = notes
        .filter(|n| !n.trim().is_empty())
        .map(|n| {
            format!(
                r#"<p style="margin:16px 0 0;font-size:14px;color:#64748b;"><strong>Notes:</strong> {}</p>"#,
                html_escape(n)
            )
        })
        .unwrap_or_default();
    let body_html = format!(
        r#"<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#64748b;">
             Your grocery claim has been <strong>{status}</strong>.
           </p>
           <p style="margin:0;font-size:20px;font-weight:700;color:#071b3a;">Rs. {amount}</p>
           {notes_html}"#,
        status = html_escape(status),
        amount = amount,
        notes_html = notes_html,
    );
    let title = format!("Grocery Claim {status_label}");
    (plain, render_base_template(&title, &body_html))
}
