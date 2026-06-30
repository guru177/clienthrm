//! Optional PostgreSQL row-level security for tenant isolation.

use crate::db::connection::Connection;
use crate::db::dialect::Backend;

const RLS_TABLES: &[&str] = &["users", "attendance", "leave_requests", "payslips"];

pub fn pg_rls_enabled() -> bool {
    if std::env::var("DISABLE_PG_RLS")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
    {
        return false;
    }
    std::env::var("ENABLE_PG_RLS")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or_else(|_| {
            std::env::var("DATABASE_URL")
                .ok()
                .filter(|s| !s.trim().is_empty())
                .is_some()
                && !cfg!(debug_assertions)
        })
}

/// Enable RLS policies on core tenant tables (PostgreSQL only).
pub fn apply_postgres_rls(conn: &Connection) {
    if conn.backend() != Backend::Postgres || !pg_rls_enabled() {
        return;
    }

    for table in RLS_TABLES {
        let enable = format!("ALTER TABLE {table} ENABLE ROW LEVEL SECURITY");
        if let Err(e) = conn.execute_batch(&enable) {
            log::warn!("RLS enable on {table}: {e}");
            continue;
        }
        let drop = format!("DROP POLICY IF EXISTS tenant_isolation ON {table}");
        let _ = conn.execute_batch(&drop);
        let policy = format!(
            "CREATE POLICY tenant_isolation ON {table}
             USING (
               organization_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
             )"
        );
        if let Err(e) = conn.execute_batch(&policy) {
            log::warn!("RLS policy on {table}: {e}");
        }
    }
    log::info!("PostgreSQL RLS policies applied on {} tables", RLS_TABLES.len());
}

/// Set request-scoped tenant for RLS (transaction-local).
pub fn set_tenant_context(conn: &Connection, org_id: i64) {
    if conn.backend() != Backend::Postgres || !pg_rls_enabled() {
        return;
    }
    let _ = conn.execute(
        "SELECT set_config('app.current_org_id', ?1, false)",
        crate::params![org_id.to_string()],
    );
}

/// Clear tenant context (platform / cross-tenant admin).
pub fn clear_tenant_context(conn: &Connection) {
    if conn.backend() != Backend::Postgres || !pg_rls_enabled() {
        return;
    }
    let _ = conn.execute("SELECT set_config('app.current_org_id', '', false)", crate::params![]);
}

/// Bypass RLS for platform super-admin connections (use sparingly).
pub fn set_platform_bypass(conn: &Connection) {
    if conn.backend() != Backend::Postgres || !pg_rls_enabled() {
        return;
    }
    let _ = conn.execute_batch("SET row_security = off");
}
