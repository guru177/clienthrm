//! Leave request notification emails.

use crate::tenant_email::{html_escape, render_base_template};

pub fn render_submitted_email(
    employee_name: &str,
    leave_type: &str,
    start_date: &str,
    end_date: &str,
    days: i64,
) -> (String, String) {
    let plain = format!(
        "Leave Request Submitted\n\n\
         {employee_name} submitted a {leave_type} leave request.\n\
         Dates: {start_date} to {end_date} ({days} day(s)).\n\n\
         Please review it in Manage Leave."
    );
    let body_html = format!(
        r#"<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#64748b;">
             A new leave request needs your review.
           </p>
           <table role="presentation" width="100%" style="margin-bottom:24px;">
             <tr><td style="background:#f8fbff;border:1px solid #dce8f8;border-radius:12px;padding:20px;">
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Employee</p>
               <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#001f3f;">{employee}</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Type</p>
               <p style="margin:0 0 16px;font-size:15px;color:#001f3f;">{leave_type}</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Dates</p>
               <p style="margin:0;font-size:15px;color:#001f3f;">{start} → {end} ({days} day(s))</p>
             </td></tr>
           </table>"#,
        employee = html_escape(employee_name),
        leave_type = html_escape(leave_type),
        start = html_escape(start_date),
        end = html_escape(end_date),
        days = days,
    );
    (plain, render_base_template("Leave Request Submitted", &body_html))
}

pub fn render_decision_email(
    leave_type: &str,
    start_date: &str,
    end_date: &str,
    status: &str,
    notes: Option<&str>,
) -> (String, String) {
    let status_label = status.to_uppercase();
    let notes_plain = notes.unwrap_or("");
    let plain = format!(
        "Leave Request {status_label}\n\n\
         Your {leave_type} leave ({start_date} to {end_date}) has been {status}.\n\
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
             Your leave request has been <strong>{status}</strong>.
           </p>
           <table role="presentation" width="100%" style="margin-bottom:16px;">
             <tr><td style="background:#f8fbff;border:1px solid #dce8f8;border-radius:12px;padding:20px;">
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Type</p>
               <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#001f3f;">{leave_type}</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Dates</p>
               <p style="margin:0;font-size:15px;color:#001f3f;">{start} → {end}</p>
             </td></tr>
           </table>
           {notes_html}"#,
        status = html_escape(status),
        leave_type = html_escape(leave_type),
        start = html_escape(start_date),
        end = html_escape(end_date),
        notes_html = notes_html,
    );
    let title = format!("Leave Request {status_label}");
    (plain, render_base_template(&title, &body_html))
}
