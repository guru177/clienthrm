use crate::db::dialect::{adapt_sql, Backend};
use crate::db::pool::DbPool;
use crate::params;

/// Returns true when the PostgreSQL database has the base HRM schema.
pub fn schema_ready(pool: &DbPool) -> bool {
    let Ok(conn) = pool.get() else {
        return false;
    };
    conn.query_row(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users' LIMIT 1",
        params![],
        |row| row.get_idx::<i32>(0),
    )
    .is_ok()
}

/// Ensure PostgreSQL has the HRM schema. Import base schema with
/// `scripts/migrate-sqlite-to-postgres.py` when migrating from SQLite.
pub fn ensure_postgres_schema(pool: &DbPool) {
    let conn = match pool.get() {
        Ok(c) => c,
        Err(e) => {
            log::error!("PostgreSQL connection failed during bootstrap: {e}");
            return;
        }
    };

    if !schema_ready(pool) {
        log::error!(
            "PostgreSQL has no HRM schema (users table missing). \
             Import data first: python scripts/migrate-sqlite-to-postgres.py \
             --sqlite <path> --pg-url $DATABASE_URL"
        );
        return;
    }

    let has_orgs = conn
        .query_row(
            "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organizations' LIMIT 1",
            params![],
            |row| row.get_idx::<i32>(0),
        )
        .is_ok();

    if !has_orgs {
        log::info!("Applying SaaS organization tables on PostgreSQL");
        let ddl = adapt_sql(
            "CREATE TABLE IF NOT EXISTS organizations (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL DEFAULT 'active',
                plan TEXT NOT NULL DEFAULT 'trial',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS platform_admins (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO organizations (id, name, slug, status, plan)
            VALUES (1, 'Default Organization', 'default', 'active', 'enterprise')
            ON CONFLICT (slug) DO NOTHING;",
            Backend::Postgres,
        );
        if let Err(e) = conn.execute_batch(&ddl) {
            log::warn!("PostgreSQL SaaS table bootstrap: {e}");
        }
    }

    if let Err(e) = conn.execute_batch(&adapt_sql(
        "DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'password_reset_tokens'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'password_reset_tokens' AND column_name = 'user_id'
          ) THEN
            DROP TABLE password_reset_tokens;
          END IF;
        END $$;",
        Backend::Postgres,
    )) {
        log::warn!("PostgreSQL legacy password_reset_tokens cleanup: {e}");
    }

    if let Err(e) = conn.execute_batch(&adapt_sql(
        include_str!("postgres_rust_tables.sql"),
        Backend::Postgres,
    )) {
        log::warn!("PostgreSQL rust table migration: {e}");
    }

    super::postgres_seeds::run_postgres_seeds(&conn);
    super::scalability::apply_scalability_indexes(&conn);
    super::scalability::analyze_postgres_stats(&conn);
    super::scalability::ensure_attendance_summary_materialized_view(&conn);
    super::partitions::apply_postgres_partitions(&conn);
    super::tenant_rls::apply_postgres_rls(&conn);
}
