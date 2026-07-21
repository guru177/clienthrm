//! Doctor report notification emails.

use crate::tenant_email::{html_escape, render_base_template};

pub fn render_published_email(consultation_date: &str, doctor_name: &str) -> (String, String) {
    let plain = format!(
        "Doctor Report Published\n\n\
         A medical consultation report from {doctor_name} dated {consultation_date} is now available.\n\
         View it under My Doctor Reports."
    );
    let body_html = format!(
        r#"<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#64748b;">
             A doctor consultation report has been published for you.
           </p>
           <table role="presentation" width="100%">
             <tr><td style="background:#f8fbff;border:1px solid #dce8f8;border-radius:12px;padding:20px;">
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Consultation Date</p>
               <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#001f3f;">{date}</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Doctor</p>
               <p style="margin:0;font-size:15px;color:#001f3f;">{doctor}</p>
             </td></tr>
           </table>
           <p style="margin:16px 0 0;font-size:14px;color:#64748b;">
             Open <strong>My Doctor Reports</strong> in the app to view the full SOAP notes and prescription.
           </p>"#,
        date = html_escape(consultation_date),
        doctor = html_escape(doctor_name),
    );
    (plain, render_base_template("Doctor Report Published", &body_html))
}
