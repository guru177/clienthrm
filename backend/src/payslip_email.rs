//! Payslip notification emails (summary + HTML attachment + portal link).

use lettre::message::header::ContentType;
use lettre::message::{Attachment, MultiPart};
use lettre::Message;

const MONTH_NAMES: [&str; 12] = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

pub struct PayslipEmailBatchResult {
    pub sent: usize,
    pub skipped: usize,
    pub errors: Vec<serde_json::Value>,
}

fn portal_url() -> String {
    std::env::var("FRONTEND_URL")
        .or_else(|_| std::env::var("TENANT_APP_URL"))
        .unwrap_or_else(|_| "http://localhost:5174".to_string())
        .trim_end_matches('/')
        .to_string()
}

fn month_label(month: i32) -> String {
    MONTH_NAMES
        .get((month as usize).saturating_sub(1))
        .map(|s| (*s).to_string())
        .unwrap_or_else(|| month.to_string())
}

fn app_name(conn: &crate::db::Connection, org_id: i64) -> String {
    conn.query_row(
        "SELECT value FROM app_settings WHERE organization_id = ?1 AND key = 'app_name'",
        crate::params![org_id],
        |row| row.get_idx::<String>(0),
    )
    .ok()
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| std::env::var("APP_NAME").unwrap_or_else(|_| "RAINTECH HRM".into()))
}

fn build_email_bodies(
    app_name: &str,
    name: &str,
    month: i32,
    year: i32,
    gross: f64,
    net: f64,
    deductions: f64,
) -> (String, String) {
    let period = format!("{} {}", month_label(month), year);
    let portal = portal_url();
    let plain = format!(
        "{app_name} — Payslip for {period}\n\n\
         Dear {name},\n\n\
         Your payslip for {period} has been generated.\n\
         Gross: ₹{gross:.2}\n\
         Deductions: ₹{deductions:.2}\n\
         Net pay: ₹{net:.2}\n\n\
         View and download your payslip: {portal}/admin/my-payslips\n\n\
         Your payslip is attached as an A4 PDF.\n"
    );
    let html = format!(
        r#"<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <div style="background:linear-gradient(135deg,#071b3a,#1e4a8a);color:#fff;border-radius:12px 12px 0 0;padding:24px 28px">
    <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">Salary statement</div>
    <div style="font-size:22px;font-weight:700;margin-top:6px">{app_name}</div>
    <div style="font-size:13px;opacity:.9;margin-top:4px">{period}</div>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:24px 28px;background:#fff">
    <p style="margin:0 0 16px">Dear {name},</p>
    <p style="margin:0 0 20px;color:#475569">Your payslip for <strong>{period}</strong> is attached as a PDF. Summary:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b">Gross salary</td>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">₹{gross:.2}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b">Total deductions</td>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">₹{deductions:.2}</td>
      </tr>
      <tr>
        <td style="padding:14px 0;font-weight:700;color:#071b3a">Net pay</td>
        <td style="padding:14px 0;text-align:right;font-size:20px;font-weight:700;color:#071b3a">₹{net:.2}</td>
      </tr>
    </table>
    <p style="margin:24px 0 0">
      <a href="{portal}/admin/my-payslips" style="display:inline-block;background:#071b3a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View My Payslips</a>
    </p>
    <p style="font-size:12px;color:#94a3b8;margin:20px 0 0">Full breakdown is in the attached A4 PDF.</p>
  </div>
</div>"#
    );
    (plain, html)
}

/// Send payslip email for one generated payslip (HTML body + payslip HTML attachment).
pub fn send_payslip_email(
    conn: &crate::db::Connection,
    org_id: i64,
    payslip_id: i64,
) -> Result<(), String> {
    let smtp = crate::smtp_config::resolve(conn, org_id)
        .ok_or_else(|| "SMTP not configured (set in App Settings or .env)".to_string())?;

    let row: Option<(String, Option<String>, i32, i32, f64, f64, f64, String)> = conn
        .query_row(
            "SELECT u.name, u.email, p.month, p.year, p.gross_salary, p.net_salary,
                    p.total_deductions, p.status
             FROM payslips p JOIN users u ON u.id = p.user_id
             WHERE p.id=?1 AND u.organization_id=?2",
            crate::params![payslip_id, org_id],
            |r| {
                Ok((
                    r.get_idx::<String>(0)?,
                    r.get_idx::<Option<String>>(1)?,
                    r.get_idx::<i32>(2)?,
                    r.get_idx::<i32>(3)?,
                    r.get_idx::<f64>(4)?,
                    r.get_idx::<f64>(5)?,
                    r.get_idx::<f64>(6)?,
                    r.get_idx::<String>(7)?,
                ))
            },
        )
        .ok();

    let Some((name, email, month, year, gross, net, deductions, status)) = row else {
        return Err("Payslip not found".into());
    };
    if status != "generated" {
        return Err("Only generated payslips can be emailed".into());
    }
    let Some(email) = email.filter(|e| e.contains('@')) else {
        return Err("Employee has no email on file".into());
    };

    let Some(data) = crate::payslip_render::load_payslip(conn, payslip_id, org_id) else {
        return Err("Could not load payslip data".into());
    };

    let app_name = app_name(conn, org_id);
    let period = format!("{} {}", month_label(month), year);
    let (plain, html) = build_email_bodies(&app_name, &name, month, year, gross, net, deductions);

    let pdf_bytes = crate::payslip_pdf::render_payslip_pdf(&data)?;
    let attach_name = crate::payslip_render::payslip_filename(&data);

    let from = smtp.from_mailbox()?;
    let to = email
        .parse()
        .map_err(|_| "Invalid employee email address".to_string())?;

    let pdf_type = ContentType::parse("application/pdf")
        .map_err(|_| "Invalid PDF content type".to_string())?;
    let attachment = Attachment::new(attach_name).body(pdf_bytes, pdf_type);

    let message = Message::builder()
        .from(from)
        .to(to)
        .subject(format!("{app_name} — Payslip {period}"))
        .multipart(
            MultiPart::mixed()
                .multipart(MultiPart::alternative_plain_html(plain, html))
                .singlepart(attachment),
        )
        .map_err(|e| format!("Email build failed: {e}"))?;

    smtp.send(&message)
}

pub fn bulk_send_payslip_emails(
    conn: &crate::db::Connection,
    org_id: i64,
    payslip_ids: &[i64],
) -> PayslipEmailBatchResult {
    let mut sent = 0usize;
    let mut skipped = 0usize;
    let mut errors = Vec::new();

    if crate::smtp_config::resolve(conn, org_id).is_none() {
        return PayslipEmailBatchResult {
            sent: 0,
            skipped: payslip_ids.len(),
            errors: vec![serde_json::json!({
                "error": "SMTP not configured (set in App Settings or SMTP_HOST in .env)"
            })],
        };
    }

    for &id in payslip_ids {
        match send_payslip_email(conn, org_id, id) {
            Ok(()) => sent += 1,
            Err(e) => {
                skipped += 1;
                errors.push(serde_json::json!({ "payslip_id": id, "error": e }));
            }
        }
    }

    PayslipEmailBatchResult {
        sent,
        skipped,
        errors,
    }
}
