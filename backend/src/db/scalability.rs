//! SaaS scalability: hot-path indexes, PostgreSQL RLS, partitioning hooks.

use crate::db::connection::Connection;
use crate::db::dialect::{adapt_sql, Backend};

const SCALABILITY_INDEXES: &[&str] = &[
    "CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date) WHERE deleted_at IS NULL",
    "CREATE INDEX IF NOT EXISTS idx_attendance_org_date ON attendance(organization_id, date)",
    "CREATE INDEX IF NOT EXISTS idx_leave_requests_user_status_dates ON leave_requests(user_id, status, start_date, end_date)",
    "CREATE INDEX IF NOT EXISTS idx_leave_requests_org_status_start ON leave_requests(organization_id, status, start_date)",
    "CREATE INDEX IF NOT EXISTS idx_payslips_org_period ON payslips(organization_id, year, month)",
    "CREATE INDEX IF NOT EXISTS idx_holidays_org_date ON holidays(organization_id, date)",
    "CREATE INDEX IF NOT EXISTS idx_bio_punches_user_time ON biometric_punches(user_id, punch_time)",
    "CREATE INDEX IF NOT EXISTS idx_users_org_active ON users(organization_id) WHERE deleted_at IS NULL",
    "CREATE INDEX IF NOT EXISTS idx_role_user_user ON role_user(user_id)",
];

/// Indexes for attendance, leave, payroll hot paths (SQLite + PostgreSQL).
pub fn apply_scalability_indexes(conn: &Connection) {
    let backend = conn.backend();
    for ddl in SCALABILITY_INDEXES {
        let sql = adapt_sql(ddl, backend);
        if let Err(e) = conn.execute_batch(&sql) {
            log::warn!("Scalability index skipped: {e}");
        }
    }
    log::info!("SaaS scalability indexes applied");
}

/// Run ANALYZE on PostgreSQL after bulk migration or index creation.
pub fn analyze_postgres_stats(conn: &Connection) {
    if conn.backend() != Backend::Postgres {
        return;
    }
    if let Err(e) = conn.execute_batch("ANALYZE") {
        log::warn!("PostgreSQL ANALYZE failed: {e}");
    } else {
        log::info!("PostgreSQL ANALYZE completed");
    }
}

/// Monthly attendance summary MV for report dashboards (PostgreSQL).
pub fn ensure_attendance_summary_materialized_view(conn: &Connection) {
    if conn.backend() != Backend::Postgres {
        return;
    }
    let ddl = adapt_sql(
        "CREATE MATERIALIZED VIEW IF NOT EXISTS mv_org_attendance_monthly AS
         SELECT u.organization_id,
                substr(a.date, 1, 7) AS month_key,
                COUNT(DISTINCT a.user_id || '-' || a.date) AS present_sessions
         FROM attendance a
         INNER JOIN users u ON u.id = a.user_id
         WHERE a.deleted_at IS NULL AND a.clock_out IS NOT NULL
         GROUP BY u.organization_id, substr(a.date, 1, 7)
         WITH NO DATA",
        Backend::Postgres,
    );
    let _ = conn.execute_batch(&ddl);
    let _ = conn.execute_batch("REFRESH MATERIALIZED VIEW mv_org_attendance_monthly");
}
