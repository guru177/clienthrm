//! Attendance regularization and shift assignment emails.

use crate::tenant_email::{html_escape, render_base_template};

pub fn render_manual_attendance_email(
    date: &str,
    status: &str,
    clock_in: Option<&str>,
    clock_out: Option<&str>,
) -> (String, String) {
    let cin = clock_in.unwrap_or("—");
    let cout = clock_out.unwrap_or("—");
    let plain = format!(
        "Attendance Updated\n\n\
         An admin updated your attendance for {date}.\n\
         Status: {status}\n\
         Clock in: {cin}\n\
         Clock out: {cout}"
    );
    let body_html = format!(
        r#"<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#64748b;">
             An administrator updated your attendance record.
           </p>
           <table role="presentation" width="100%">
             <tr><td style="background:#f8fbff;border:1px solid #dce8f8;border-radius:12px;padding:20px;">
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Date</p>
               <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#001f3f;">{date}</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Status</p>
               <p style="margin:0 0 16px;font-size:15px;color:#001f3f;">{status}</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Clock In / Out</p>
               <p style="margin:0;font-size:15px;color:#001f3f;">{cin} → {cout}</p>
             </td></tr>
           </table>"#,
        date = html_escape(date),
        status = html_escape(status),
        cin = html_escape(cin),
        cout = html_escape(cout),
    );
    (plain, render_base_template("Attendance Updated", &body_html))
}

pub fn render_shift_assigned_email(
    shift_name: &str,
    effective_from: &str,
    start_time: &str,
    end_time: &str,
) -> (String, String) {
    let plain = format!(
        "Shift Assigned\n\n\
         You have been assigned to shift: {shift_name}\n\
         Effective from: {effective_from}\n\
         Hours: {start_time} – {end_time}"
    );
    let body_html = format!(
        r#"<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#64748b;">
             Your work shift assignment has been updated.
           </p>
           <table role="presentation" width="100%">
             <tr><td style="background:#f8fbff;border:1px solid #dce8f8;border-radius:12px;padding:20px;">
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Shift</p>
               <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#001f3f;">{name}</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Effective From</p>
               <p style="margin:0 0 16px;font-size:15px;color:#001f3f;">{from}</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Hours</p>
               <p style="margin:0;font-size:15px;color:#001f3f;">{start} – {end}</p>
             </td></tr>
           </table>"#,
        name = html_escape(shift_name),
        from = html_escape(effective_from),
        start = html_escape(start_time),
        end = html_escape(end_time),
    );
    (plain, render_base_template("Shift Assigned", &body_html))
}
