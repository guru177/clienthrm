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
    "CREATE INDEX IF NOT EXISTS idx_chat_messages_space_created ON chat_messages(space_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_chat_messages_space_active ON chat_messages(space_id, id) WHERE is_deleted = 0",
    "CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_message_reactions(message_id)",
    "CREATE INDEX IF NOT EXISTS idx_chat_attachments_message ON chat_message_attachments(message_id)",
    "CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_space_members(user_id, space_id)",
    // Hot list endpoints — without these, org inbox / tasks seq-scan tens of thousands of rows.
    "CREATE INDEX IF NOT EXISTS idx_org_notifications_org_created ON org_notifications(organization_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_org_notification_reads_user ON org_notification_reads(user_id, notification_id)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_org_created ON tasks(organization_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_projects_org_created ON projects(organization_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_permission_role_role ON permission_role(role_id)",
    "CREATE INDEX IF NOT EXISTS idx_permission_role_pair ON permission_role(permission_id, role_id)",
    "CREATE INDEX IF NOT EXISTS idx_roles_org_name ON roles(organization_id, name)",
    "CREATE INDEX IF NOT EXISTS idx_role_user_role ON role_user(role_id)",
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
    dedupe_permission_role(conn);
    log::info!("SaaS scalability indexes applied");
}

/// permission_role historically lacked a unique (permission_id, role_id) pair —
/// duplicate rows made roles list / RBAC joins multi-second. Keep one row per pair.
fn dedupe_permission_role(conn: &Connection) {
    let backend = conn.backend();
    let delete_sql = if backend == Backend::Postgres {
        "DELETE FROM permission_role a
         USING permission_role b
         WHERE a.permission_id = b.permission_id
           AND a.role_id = b.role_id
           AND a.id > b.id"
    } else {
        "DELETE FROM permission_role
         WHERE id NOT IN (
             SELECT MIN(id) FROM permission_role GROUP BY permission_id, role_id
         )"
    };
    match conn.execute(delete_sql, []) {
        Ok(n) if n > 0 => log::info!("Deduped permission_role: removed {n} duplicate rows"),
        Ok(_) => {}
        Err(e) => log::warn!("permission_role dedupe skipped: {e}"),
    }
    let unique_sql = adapt_sql(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_permission_role_unique ON permission_role(permission_id, role_id)",
        backend,
    );
    if let Err(e) = conn.execute_batch(&unique_sql) {
        log::warn!("permission_role unique index skipped: {e}");
    }
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
