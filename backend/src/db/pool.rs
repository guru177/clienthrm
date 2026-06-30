use std::sync::RwLock;

use r2d2::Pool;
use r2d2_postgres::{postgres::NoTls, PostgresConnectionManager};
use r2d2_sqlite::SqliteConnectionManager;

use crate::db::connection::Connection;
use crate::db::dialect::Backend;
use crate::db::tenant_rls;

type PgManager = PostgresConnectionManager<NoTls>;

static READ_POOL: RwLock<Option<DbPool>> = RwLock::new(None);

pub enum DbPool {
    Sqlite(Pool<SqliteConnectionManager>),
    Postgres(Pool<PgManager>),
}

impl Clone for DbPool {
    fn clone(&self) -> Self {
        match self {
            DbPool::Sqlite(p) => DbPool::Sqlite(p.clone()),
            DbPool::Postgres(p) => DbPool::Postgres(p.clone()),
        }
    }
}

impl DbPool {
    pub fn backend(&self) -> Backend {
        match self {
            DbPool::Sqlite(_) => Backend::Sqlite,
            DbPool::Postgres(_) => Backend::Postgres,
        }
    }

    pub fn get(&self) -> Result<Connection, r2d2::Error> {
        match self {
            DbPool::Sqlite(p) => p.get().map(Connection::sqlite),
            DbPool::Postgres(p) => {
                if tokio::runtime::Handle::try_current().is_ok() {
                    let pool = p.clone();
                    match std::thread::spawn(move || pool.get().map(Connection::postgres)).join() {
                        Ok(result) => result,
                        Err(panic) => std::panic::resume_unwind(panic),
                    }
                } else {
                    p.get().map(Connection::postgres)
                }
            }
        }
    }

    /// Checkout connection with PostgreSQL RLS tenant context when enabled.
    pub fn get_for_tenant(&self, org_id: i64) -> Result<Connection, r2d2::Error> {
        let conn = self.get()?;
        tenant_rls::set_tenant_context(&conn, org_id);
        Ok(conn)
    }

    /// Prefer read replica when `DATABASE_READ_URL` was configured at startup.
    pub fn get_read(&self) -> Result<Connection, r2d2::Error> {
        if let Ok(guard) = READ_POOL.read() {
            if let Some(ref pool) = *guard {
                return pool.get();
            }
        }
        self.get()
    }

    /// Platform admin connection with RLS bypass when enabled.
    pub fn get_platform(&self) -> Result<Connection, r2d2::Error> {
        let conn = self.get()?;
        tenant_rls::clear_tenant_context(&conn);
        tenant_rls::set_platform_bypass(&conn);
        Ok(conn)
    }

    /// Read replica for platform analytics when configured.
    pub fn get_platform_read(&self) -> Result<Connection, r2d2::Error> {
        let conn = self.get_read()?;
        tenant_rls::clear_tenant_context(&conn);
        tenant_rls::set_platform_bypass(&conn);
        Ok(conn)
    }
}

fn env_pool_size(key: &str, default: u32) -> u32 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

pub fn init_pool(database_path: &str, database_url: Option<&str>) -> DbPool {
    if let Some(url) = database_url.filter(|u| {
        let u = u.trim();
        u.starts_with("postgres://") || u.starts_with("postgresql://")
    }) {
        log::info!("Using PostgreSQL database");
        return init_postgres(url);
    }

    log::info!("Using SQLite database at {}", database_path);
    init_sqlite(database_path)
}

/// Optional read replica pool (`DATABASE_READ_URL`).
pub fn init_read_pool() {
    if let Some(url) = std::env::var("DATABASE_READ_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
    {
        let pool = init_postgres(&url);
        if let Ok(mut guard) = READ_POOL.write() {
            *guard = Some(pool);
            log::info!("Read replica pool configured");
        }
    }
}

fn init_sqlite(database_path: &str) -> DbPool {
    let max_size = env_pool_size("DB_POOL_MAX_SIZE", 10);
    let manager = SqliteConnectionManager::file(database_path);
    let pool = Pool::builder()
        .max_size(max_size)
        .build(manager)
        .expect("Failed to create SQLite pool");

    if let Ok(conn) = pool.get() {
        let _ = conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=5000;",
        );
    }

    DbPool::Sqlite(pool)
}

fn init_postgres(url: &str) -> DbPool {
    let max_size = env_pool_size("DB_POOL_MAX_SIZE", 50);
    let pg_config: postgres::Config = url.parse().expect("Invalid DATABASE_URL");
    let manager = PgManager::new(pg_config, NoTls);
    let pool = Pool::builder()
        .max_size(max_size)
        .build(manager)
        .expect("Failed to create PostgreSQL pool");

    DbPool::Postgres(pool)
}
