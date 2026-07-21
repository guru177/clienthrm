//! Periodic workflow events: task overdue (became due yesterday).

use std::time::Duration;

use crate::db::pool::DbPool;
use crate::jobs::run_db;

pub fn spawn(pool: DbPool) {
    let hours = std::env::var("WORKFLOW_EVENTS_INTERVAL_HOURS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(6);

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(hours * 3600));
        loop {
            ticker.tick().await;
            run_db(&pool, |conn| {
                fire_task_overdue(conn);
                send_manager_digests(conn);
            })
            .await;
        }
    });
    log::info!("Workflow events worker started (every {hours}h)");
}

fn fire_task_overdue(conn: &crate::db::Connection) {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let yesterday = (chrono::Local::now().date_naive() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    let stmt = match conn.prepare(
        "SELECT t.id, t.title, t.assigned_to, t.due_date, t.organization_id, t.created_by
         FROM tasks t
         WHERE t.due_date IS NOT NULL
           AND t.due_date <= ?1
           AND t.due_date >= ?2
           AND LOWER(COALESCE(t.status, '')) NOT IN ('done', 'completed', 'cancelled')
           AND t.organization_id IS NOT NULL",
    ) {
        Ok(s) => s,
        Err(e) => {
            log::warn!("task_overdue prepare failed: {e}");
            return;
        }
    };

    let rows: Vec<(i64, String, Option<i64>, Option<String>, i64, Option<i64>)> = stmt
        .query_map(crate::params![&today, &yesterday], |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<Option<i64>>(2)?,
                row.get_idx::<Option<String>>(3)?,
                row.get_idx::<i64>(4)?,
                row.get_idx::<Option<i64>>(5)?,
            ))
        });

    for (task_id, title, assigned_to, due_date, org_id, created_by) in rows {
        let ctx = serde_json::json!({
            "task_id": task_id,
            "title": title,
            "assigned_to": assigned_to,
            "user_id": assigned_to,
            "due_date": due_date,
            "organization_id": org_id,
            "created_by": created_by.or(assigned_to),
        });
        crate::workflow_logic::trigger(conn, org_id, "task_overdue", &ctx);
    }
}

/// Daily digest: absences today + pending leave for each manager with reports.
fn send_manager_digests(conn: &crate::db::Connection) {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let hour = chrono::Local::now().format("%H").to_string();
    // Run digest once in the morning window (06–10 local) per worker tick.
    if hour.as_str() < "06" || hour.as_str() > "10" {
        return;
    }

    let managers: Vec<(i64, i64)> = match conn.prepare(
        "SELECT DISTINCT COALESCE(u.reporting_manager_id, u.manager_id) AS mid, u.organization_id
         FROM users u
         WHERE u.deleted_at IS NULL
           AND COALESCE(u.reporting_manager_id, u.manager_id) IS NOT NULL",
    ) {
        Ok(stmt) => stmt.query_map([], |row| {
            Ok((row.get_idx::<i64>(0)?, row.get_idx::<i64>(1)?))
        }),
        Err(_) => return,
    };

    for (manager_id, org_id) in managers {
        let absent_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM users u
                 WHERE u.organization_id = ?1 AND u.deleted_at IS NULL
                   AND (u.reporting_manager_id = ?2 OR u.manager_id = ?2)
                   AND NOT EXISTS (
                     SELECT 1 FROM attendance a WHERE a.user_id = u.id AND a.date = ?3
                   )
                   AND NOT EXISTS (
                     SELECT 1 FROM leave_requests lr
                     WHERE lr.user_id = u.id AND lr.status = 'approved' AND lr.deleted_at IS NULL
                       AND lr.start_date <= ?3 AND lr.end_date >= ?3
                   )",
                crate::params![org_id, manager_id, &today],
                |r| r.get_idx::<i64>(0),
            )
            .unwrap_or(0);

        let pending_leave: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM leave_requests lr
                 INNER JOIN users u ON u.id = lr.user_id
                 WHERE u.organization_id = ?1 AND lr.deleted_at IS NULL AND lr.status = 'pending'
                   AND (u.reporting_manager_id = ?2 OR u.manager_id = ?2)",
                crate::params![org_id, manager_id],
                |r| r.get_idx::<i64>(0),
            )
            .unwrap_or(0);

        if absent_count == 0 && pending_leave == 0 {
            continue;
        }

        let Some(email) = crate::tenant_email::user_email(conn, manager_id) else {
            continue;
        };
        if crate::smtp_config::resolve(conn, org_id).is_none() {
            continue;
        }

        let subject = format!("Manager digest — {today}");
        let plain = format!(
            "Team digest for {today}:\n- No punch / possible absences: {absent_count}\n- Pending leave requests: {pending_leave}\n\nReview Team Attendance and Team Leave in HRM."
        );
        let html = crate::tenant_email::render_base_template(
            &subject,
            &format!(
                r#"<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#64748b;">Team digest for <strong>{}</strong></p>
                <ul style="margin:0;padding-left:18px;color:#334155;font-size:14px;line-height:1.7;">
                  <li>No punch / possible absences: <strong>{}</strong></li>
                  <li>Pending leave requests: <strong>{}</strong></li>
                </ul>"#,
                crate::tenant_email::html_escape(&today),
                absent_count,
                pending_leave
            ),
        );
        crate::tenant_email::send_tenant_email(conn, org_id, &email, &subject, plain, html);
    }
}
