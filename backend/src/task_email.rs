//! Task assignment / completion emails.

use crate::tenant_email::{html_escape, render_base_template};

pub fn render_assigned_email(
    title: &str,
    assigner_name: &str,
    due_date: Option<&str>,
) -> (String, String) {
    let due_plain = due_date.unwrap_or("Not set");
    let plain = format!(
        "Task Assigned\n\n\
         {assigner_name} assigned you a task: {title}\n\
         Due: {due_plain}"
    );
    let due_html = due_date
        .map(|d| {
            format!(
                r#"<p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Due Date</p>
                   <p style="margin:0;font-size:15px;color:#001f3f;">{}</p>"#,
                html_escape(d)
            )
        })
        .unwrap_or_default();
    let body_html = format!(
        r#"<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#64748b;">
             You have been assigned a new task.
           </p>
           <table role="presentation" width="100%">
             <tr><td style="background:#f8fbff;border:1px solid #dce8f8;border-radius:12px;padding:20px;">
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Task</p>
               <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#001f3f;">{title}</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Assigned By</p>
               <p style="margin:0 0 16px;font-size:15px;color:#001f3f;">{assigner}</p>
               {due_html}
             </td></tr>
           </table>"#,
        title = html_escape(title),
        assigner = html_escape(assigner_name),
        due_html = due_html,
    );
    (plain, render_base_template("Task Assigned", &body_html))
}

pub fn render_completed_email(title: &str, assignee_name: &str) -> (String, String) {
    let plain = format!(
        "Task Completed\n\n\
         {assignee_name} marked the task as completed: {title}"
    );
    let body_html = format!(
        r#"<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#64748b;">
             A task you created or assigned has been completed.
           </p>
           <table role="presentation" width="100%">
             <tr><td style="background:#f8fbff;border:1px solid #dce8f8;border-radius:12px;padding:20px;">
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Task</p>
               <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#001f3f;">{title}</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Completed By</p>
               <p style="margin:0;font-size:15px;color:#001f3f;">{assignee}</p>
             </td></tr>
           </table>"#,
        title = html_escape(title),
        assignee = html_escape(assignee_name),
    );
    (plain, render_base_template("Task Completed", &body_html))
}
