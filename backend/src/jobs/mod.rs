//! Background jobs: biometric sync, data retention, payroll queue polling.

pub mod biometric_worker;
pub mod payroll_queue;
pub mod retention_worker;

use crate::db::pool::DbPool;

pub fn spawn_all(pool: DbPool) {
    biometric_worker::spawn(pool.clone());
    retention_worker::spawn(pool.clone());
    payroll_queue::spawn(pool);
}

/// Run synchronous DB work off the Tokio runtime (required for sync `postgres` pool).
pub async fn run_db<F>(pool: &DbPool, f: F)
where
    F: FnOnce(&crate::db::Connection) + Send + 'static,
{
    let pool = pool.clone();
    let _ = tokio::task::spawn_blocking(move || {
        if let Ok(conn) = pool.get() {
            f(&conn);
        }
    })
    .await;
}
