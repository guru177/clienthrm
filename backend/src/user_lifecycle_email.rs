//! User account lifecycle emails.

use crate::tenant_email::{html_escape, render_base_template};

pub fn render_welcome_email(
    name: &str,
    email: &str,
    password: &str,
    org_name: Option<&str>,
) -> (String, String) {
    let org = org_name.unwrap_or("your organization");
    let login_url = std::env::var("FRONTEND_URL")
        .ok()
        .map(|u| u.trim_end_matches('/').to_string())
        .filter(|u| !u.is_empty())
        .map(|base| format!("{base}/login"))
        .unwrap_or_else(|| "/login".to_string());
    let change_password_hint =
        "After you sign in, go to Settings → Password and change this password immediately.";

    let plain = format!(
        "Welcome to HRM\n\n\
         Hi {name},\n\n\
         An account has been created for you at {org}.\n\n\
         Login email: {email}\n\
         Temporary password: {password}\n\n\
         Sign in at: {login_url}\n\n\
         {change_password_hint}\n\
         Do not share this password with anyone."
    );
    let body_html = format!(
        r#"<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#64748b;">
             Hi {name}, an account has been created for you.
           </p>
           <table role="presentation" width="100%">
             <tr><td style="background:#f8fbff;border:1px solid #dce8f8;border-radius:12px;padding:20px;">
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Organization</p>
               <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#001f3f;">{org}</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Login Email</p>
               <p style="margin:0 0 16px;font-size:15px;color:#001f3f;">{email}</p>
               <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;">Temporary Password</p>
               <p style="margin:0;font-size:15px;font-family:ui-monospace,Consolas,monospace;color:#001f3f;letter-spacing:0.02em;">{password}</p>
             </td></tr>
           </table>
           <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#64748b;">
             Sign in at <a href="{login_url}" style="color:#092244;font-weight:600;">{login_url}</a>.
           </p>
           <p style="margin:12px 0 0;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;font-size:14px;line-height:1.55;color:#9a3412;">
             <strong>Important:</strong> {change_password_hint}
             Do not share this password with anyone.
           </p>"#,
        name = html_escape(name),
        org = html_escape(org),
        email = html_escape(email),
        password = html_escape(password),
        login_url = html_escape(&login_url),
        change_password_hint = html_escape(change_password_hint),
    );
    (plain, render_base_template("Welcome — Account Created", &body_html))
}

pub fn render_status_changed_email(name: &str, status: &str) -> (String, String) {
    let plain = format!(
        "Account Status Updated\n\n\
         Hi {name},\n\n\
         Your account status is now: {status}."
    );
    let body_html = format!(
        r#"<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#64748b;">
             Hi {name}, your account status has been updated.
           </p>
           <p style="margin:0;font-size:18px;font-weight:700;color:#001f3f;">Status: {status}</p>"#,
        name = html_escape(name),
        status = html_escape(status),
    );
    (plain, render_base_template("Account Status Updated", &body_html))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn welcome_email_includes_password_and_change_hint() {
        let (plain, html) =
            render_welcome_email("Ada", "ada@example.com", "TempPass!23", Some("Acme"));
        assert!(plain.contains("TempPass!23"));
        assert!(plain.contains("ada@example.com"));
        assert!(plain.to_lowercase().contains("change"));
        assert!(html.contains("TempPass!23"));
        assert!(html.contains("Important"));
    }
}
