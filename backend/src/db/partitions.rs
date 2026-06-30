//! PostgreSQL partitioning hooks and data retention (large-scale SaaS).

use chrono::{Datelike, Utc};
use crate::db::connection::Connection;
use crate::db::dialect::{adapt_sql, Backend};

fn pg_partitioning_enabled() -> bool {
    std::env::var("ENABLE_PG_PARTITIONING")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

/// Retention days for high-volume tables (default 24 months ≈ 730 days).
pub fn retention_days() -> i32 {
    std::env::var("DATA_RETENTION_DAYS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(730)
}

/// Apply PG partitioning registry, BRIN indexes, and ensure future monthly partitions.
pub fn apply_postgres_partitions(conn: &Connection) {
    if conn.backend() != Backend::Postgres {
        return;
    }

    let ddl = adapt_sql(
        "
        CREATE TABLE IF NOT EXISTS saas_partition_registry (
            id SERIAL PRIMARY KEY,
            parent_table TEXT NOT NULL,
            partition_name TEXT NOT NULL UNIQUE,
            range_start TEXT NOT NULL,
            range_end TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS archived_data_exports (
            id SERIAL PRIMARY KEY,
            organization_id INTEGER,
            table_name TEXT NOT NULL,
            range_start TEXT NOT NULL,
            range_end TEXT NOT NULL,
            row_count INTEGER NOT NULL DEFAULT 0,
            storage_path TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        ",
        Backend::Postgres,
    );
    if let Err(e) = conn.execute_batch(&ddl) {
        log::warn!("Partition registry DDL: {e}");
        return;
    }

    let brin = adapt_sql(
        "CREATE INDEX IF NOT EXISTS idx_bio_punches_time_brin ON biometric_punches USING BRIN (punch_time)",
        Backend::Postgres,
    );
    let _ = conn.execute_batch(&brin);

    if pg_partitioning_enabled() {
        ensure_monthly_partitions(conn, "biometric_punches", "punch_time");
        ensure_monthly_partitions(conn, "attendance", "date");
        ensure_monthly_partitions(conn, "platform_audit_log", "created_at");
    }

    log::info!("PostgreSQL partition hooks applied");
}

fn ensure_monthly_partitions(conn: &Connection, parent: &str, _time_column: &str) {
    let is_partitioned: bool = conn
        .query_row(
            "SELECT EXISTS (
               SELECT 1 FROM pg_partitioned_table pt
               JOIN pg_class c ON c.oid = pt.partrelid
               WHERE c.relname = ?1
             )",
            [parent],
            |row| row.get_idx::<bool>(0),
        )
        .unwrap_or(false);

    if !is_partitioned {
        log::info!(
            "Table {parent} is not partitioned yet; set ENABLE_PG_PARTITIONING=1 after converting to PARTITION BY RANGE"
        );
        return;
    }

    let now = Utc::now().date_naive();
    for offset in 0..3i32 {
        let d = now + chrono::Duration::days(offset as i64 * 32);
        let y = d.year();
        let m = d.month();
        let part_name = format!("{parent}_{y:04}_{m:02}");
        let start = format!("{y:04}-{m:02}-01");
        let (ny, nm) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
        let end = format!("{ny:04}-{nm:02}-01");
        let sql = format!(
            "CREATE TABLE IF NOT EXISTS {part_name} PARTITION OF {parent}
             FOR VALUES FROM ('{start}') TO ('{end}')"
        );
        if conn.execute_batch(&sql).is_ok() {
            let _ = conn.execute(
                "INSERT INTO saas_partition_registry (parent_table, partition_name, range_start, range_end)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT (partition_name) DO NOTHING",
                crate::params![parent, part_name, start, end],
            );
        }
    }
}

/// Delete or archive rows older than retention policy (platform audit + processed punches).
pub fn run_retention_pass(conn: &Connection) -> Result<(), String> {
    if conn.backend() != Backend::Postgres {
        return Ok(());
    }
    let days = retention_days();
    let cutoff = (Utc::now() - chrono::Duration::days(days as i64))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();

    let _ = conn.execute(
        "DELETE FROM platform_audit_log WHERE created_at < ?1",
        crate::params![&cutoff],
    );

    let _ = conn.execute(
        "DELETE FROM biometric_punches WHERE is_processed = 1 AND punch_time < ?1",
        crate::params![&cutoff],
    );

    Ok(())
}
