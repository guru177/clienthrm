//! Process queued payroll runs asynchronously.

use std::time::Duration;

use crate::db::pool::DbPool;

pub fn spawn(pool: DbPool) {
    let interval_secs = std::env::var("PAYROLL_QUEUE_POLL_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(30);

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(interval_secs));
        loop {
            ticker.tick().await;
            let pool = pool.clone();
            let _ = tokio::task::spawn_blocking(move || {
                let Ok(conn) = pool.get() else {
                    return;
                };
                let rows: Vec<(i64, i64, i32, i32, String)> = conn
                    .prepare(
                        "SELECT id, organization_id, month, year, status FROM payroll_runs
                         WHERE status = 'queued' ORDER BY id ASC LIMIT 1",
                    )
                    .map(|stmt| {
                        stmt.query_map([], |row| {
                            Ok((
                                row.get_idx::<i64>(0)?,
                                row.get_idx::<i64>(1)?,
                                row.get_idx::<i32>(2)?,
                                row.get_idx::<i32>(3)?,
                                row.get_idx::<String>(4)?,
                            ))
                        })
                    })
                    .unwrap_or_default();
                for (run_id, org_id, month, year, _status) in rows {
                    let Ok(conn) = pool.get_for_tenant(org_id) else {
                        continue;
                    };
                    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
                    let _ = conn.execute(
                        "UPDATE payroll_runs SET status='processing', updated_at=?2 WHERE id=?1",
                        crate::params![run_id, &now],
                    );
                    crate::handlers::payroll::prepare_attendance_for_payroll(
                        &conn, org_id, month, year,
                    );
                    let _ = conn.execute(
                        "UPDATE payroll_runs SET status='draft', updated_at=?2 WHERE id=?1",
                        crate::params![run_id, &now],
                    );
                    log::info!("Payroll queue processed run_id={run_id} org={org_id} {month}/{year}");
                }
            })
            .await;
        }
    });
    log::info!("Payroll queue worker started");
}
