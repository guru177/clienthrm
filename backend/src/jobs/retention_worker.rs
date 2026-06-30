//! Data retention pass for audit logs and old biometric punches.

use std::time::Duration;

use crate::db::pool::DbPool;
use crate::jobs::run_db;

pub fn spawn(pool: DbPool) {
    let hours = std::env::var("RETENTION_WORKER_INTERVAL_HOURS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(24);

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(hours * 3600));
        loop {
            ticker.tick().await;
            run_db(&pool, |conn| {
                if let Err(e) = crate::db::partitions::run_retention_pass(conn) {
                    log::warn!("Retention pass: {e}");
                }
            })
            .await;
        }
    });
    log::info!("Data retention worker started (every {hours}h)");
}
