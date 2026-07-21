//! Send every branded email template to MAIL_OVERRIDE for visual QA.
//! Run: cargo test send_all_branded_test_emails -- --ignored --nocapture

use crate::db::{init_pool, DbPool};
use crate::smtp_config::SmtpConfig;

fn sample_recipient() -> &'static str {
    "info@retaildaddy.in"
}

fn send_one(
    smtp: &SmtpConfig,
    to: &str,
    subject: &str,
    plain: String,
    html: String,
) -> Result<(), String> {
    let msg = crate::tenant_email::build_html_email(smtp, to, subject, plain, html)?;
    smtp.send(&msg)
}

pub fn blast_all(conn: &crate::db::Connection, org_id: i64) -> Vec<(String, Result<(), String>)> {
    let to = sample_recipient();
    let smtp = match crate::smtp_config::resolve_from_env()
        .or_else(|| crate::smtp_config::resolve(conn, org_id))
    {
        Some(s) => s,
        None => return vec![("SMTP".into(), Err("SMTP not configured".into()))],
    };

    let mut cases: Vec<(&str, String, String)> = Vec::new();

    let (p, h) = crate::signup_otp_email::render_signup_otp_email("482916", to);
    cases.push(("Signup OTP", p, h));

    let (p, h) = crate::password_reset_otp_email::render_password_reset_otp_email(
        "739104",
        to,
        "MashupTech",
    );
    cases.push(("Password reset OTP", p, h));

    let (p, h) = crate::password_reset_email::render_password_reset_email(
        "http://localhost:5174/reset-password?token=test-token",
        to,
        "MashupTech",
    );
    cases.push(("Password reset link", p, h));

    let (p, h) =
        crate::user_lifecycle_email::render_welcome_email(
            "Test User",
            to,
            "TempPass!QA123",
            Some("MashupTech"),
        );
    cases.push(("Welcome — account created", p, h));

    let (p, h) = crate::user_lifecycle_email::render_status_changed_email("Test User", "active");
    cases.push(("Account status updated", p, h));

    let (p, h) = crate::leave_email::render_submitted_email(
        "Test Employee",
        "Annual Leave",
        "2026-08-01",
        "2026-08-03",
        3,
    );
    cases.push(("Leave request submitted", p, h));

    let (p, h) = crate::leave_email::render_decision_email(
        "Annual Leave",
        "2026-08-01",
        "2026-08-03",
        "approved",
        Some("Enjoy your time off."),
    );
    cases.push(("Leave approved", p, h));

    let (p, h) = crate::task_email::render_assigned_email(
        "QA mail blast task",
        "Admin",
        Some("2026-08-15"),
    );
    cases.push(("Task assigned", p, h));

    let (p, h) = crate::task_email::render_completed_email("QA mail blast task", "Test Employee");
    cases.push(("Task completed", p, h));

    let (p, h) = crate::asset_email::render_allocation_email("MacBook Pro 14", "2026-07-17");
    cases.push(("Asset allocated", p, h));

    let (p, h) = crate::asset_email::render_expense_email("MacBook Pro 14", 2500.0, "Test Employee");
    cases.push(("Asset expense logged", p, h));

    let (p, h) = crate::asset_email::render_expense_review_email("MacBook Pro 14", 2500.0, "approved");
    cases.push(("Asset expense reviewed", p, h));

    let (p, h) = crate::grocery_email::render_enrolled_email(15, 1500.0, "2026-07-01");
    cases.push(("Grocery benefit enrolled", p, h));

    let (p, h) = crate::grocery_email::render_claim_logged_email("Test Employee", 450.0, 7, 2026);
    cases.push(("Grocery claim submitted", p, h));

    let (p, h) = crate::grocery_email::render_claim_reviewed_email(
        450.0,
        "approved",
        Some("Claim processed."),
    );
    cases.push(("Grocery claim approved", p, h));

    let (p, h) = crate::doctor_report_email::render_published_email("2026-07-10", "Dr. Sharma");
    cases.push(("Doctor report published", p, h));

    let (p, h) = crate::attendance_shift_email::render_manual_attendance_email(
        "2026-07-17",
        "present",
        Some("09:15"),
        Some("18:00"),
    );
    cases.push(("Attendance updated", p, h));

    let (p, h) = crate::attendance_shift_email::render_shift_assigned_email(
        "Morning Shift",
        "2026-07-18",
        "09:00",
        "18:00",
    );
    cases.push(("Shift assigned", p, h));

    {
        let subject = "Workflow: QA mail blast";
        let body = "This is a workflow email_action test notification.";
        let plain = body.to_string();
        let html = crate::tenant_email::render_base_template(
            subject,
            &format!(
                r#"<p style="margin:0;font-size:15px;line-height:1.6;color:#64748b;">{}</p>"#,
                crate::tenant_email::html_escape(body)
            ),
        );
        cases.push(("Workflow notification", plain, html));
    }

    {
        let subject = "Application received — Software Engineer";
        let plain = "Thank you for applying. We will review your resume shortly.".to_string();
        let inner = format!(
            "<p style=\"margin:0;font-size:15px;line-height:1.6;color:#64748b;\">{}</p>",
            crate::tenant_email::html_escape(&plain)
        );
        let html = crate::tenant_email::render_base_template(subject, &inner);
        cases.push(("Job application reply", plain, html));
    }

    let mut results = Vec::new();
    for (name, plain, html) in cases {
        let subject = format!("[MAIL BLAST] {name}");
        let r = send_one(&smtp, to, &subject, plain, html);
        if let Ok(()) = &r {
            log::info!("Sent test email: {name}");
        } else if let Err(e) = &r {
            log::warn!("Failed test email {name}: {e}");
        }
        results.push((name.to_string(), r));
    }

    let payslip_id: Option<i64> = conn
        .query_row(
            "SELECT p.id FROM payslips p
             JOIN users u ON u.id = p.user_id
             WHERE u.organization_id = ?1 AND p.status = 'generated'
             ORDER BY p.id DESC LIMIT 1",
            crate::params![org_id],
            |row| row.get_idx::<i64>(0),
        )
        .ok();

    if let Some(id) = payslip_id {
        results.push((
            "Payslip (with PDF)".into(),
            crate::payslip_email::send_payslip_email(conn, org_id, id),
        ));
    } else {
        results.push((
            "Payslip (with PDF)".into(),
            Err("No generated payslip found — skipped".into()),
        ));
    }

    results
}

fn default_org_id(pool: &DbPool) -> i64 {
    pool.get()
        .ok()
        .and_then(|conn| {
            conn.query_row(
                "SELECT id FROM organizations WHERE slug = 'mashuptech' LIMIT 1",
                [],
                |row| row.get_idx::<i64>(0),
            )
            .ok()
        })
        .unwrap_or(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "manual: sends all branded test emails to MAIL_OVERRIDE"]
    async fn send_all_branded_test_emails() {
        let _ = dotenv::from_filename(".env");
        let _ = dotenv::dotenv();
        let _ = env_logger::try_init();
        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://hrm:hrm@127.0.0.1:5433/hrm".to_string());
        let pool = init_pool(&database_url);
        let conn = pool.get().expect("db conn");
        let org_id = default_org_id(&pool);
        let override_to = std::env::var("MAIL_OVERRIDE").unwrap_or_default();
        println!("MAIL_OVERRIDE={override_to}");
        println!("Blasting emails for org_id={org_id}...");
        let results = blast_all(&conn, org_id);
        let mut ok = 0usize;
        let mut fail = 0usize;
        for (name, r) in &results {
            match r {
                Ok(()) => {
                    ok += 1;
                    println!("[OK] {name}");
                }
                Err(e) => {
                    fail += 1;
                    println!("[FAIL] {name}: {e}");
                }
            }
        }
        println!("Done: {ok} sent, {fail} failed/skipped (total {})", results.len());
        assert!(ok > 0, "expected at least one email to send");
    }
}
