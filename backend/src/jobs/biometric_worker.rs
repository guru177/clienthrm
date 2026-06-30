//! Periodically sync unprocessed biometric punches to attendance.

use std::time::Duration;

use crate::db::pool::DbPool;
use crate::jobs::run_db;

pub fn spawn(pool: DbPool) {
    let interval_secs = std::env::var("BIOMETRIC_WORKER_INTERVAL_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(60);

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(interval_secs));
        loop {
            ticker.tick().await;
            run_db(&pool, |conn| {
                let org_ids: Vec<i64> = conn
                    .prepare("SELECT id FROM organizations")
                    .map(|stmt| stmt.query_map([], |row| row.get_idx::<i64>(0)))
                    .unwrap_or_default();
                let today = chrono::Utc::now().date_naive();
                let start = (today - chrono::Duration::days(2)).format("%Y-%m-%d").to_string();
                let end = (today + chrono::Duration::days(1)).format("%Y-%m-%d").to_string();
                for org_id in org_ids {
                    crate::handlers::biometric::sync_org_biometric_punches_between(
                        conn, org_id, &start, &end,
                    );
                }
            })
            .await;
        }
    });
    log::info!("Biometric background worker started");
}
