use std::sync::{OnceLock, RwLock};

use r2d2::Pool;
use r2d2_postgres::{postgres::NoTls, PostgresConnectionManager};

use crate::db::connection::Connection;
use crate::db::dialect::Backend;
use crate::db::tenant_rls;

type PgManager = PostgresConnectionManager<NoTls>;

static READ_POOL: RwLock<Option<DbPool>> = RwLock::new(None);
static PRIMARY_POOL: OnceLock<DbPool> = OnceLock::new();

#[derive(Clone)]
pub struct DbPool(Pool<PgManager>);

impl DbPool {
    pub fn backend(&self) -> Backend {
        Backend::Postgres
    }

    pub fn get(&self) -> Result<Connection, r2d2::Error> {
        let pool = self.0.clone();
        if tokio::runtime::Handle::try_current().is_ok() {
            match std::thread::spawn(move || pool.get().map(Connection::postgres)).join() {
                Ok(result) => result,
                Err(panic) => std::panic::resume_unwind(panic),
            }
        } else {
            self.0.get().map(Connection::postgres)
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

pub fn init_pool(database_url: &str) -> DbPool {
    let url = database_url.trim();
    if !(url.starts_with("postgres://") || url.starts_with("postgresql://")) {
        panic!("DATABASE_URL must be a PostgreSQL URL; got: {url}");
    }
    if let Some(pool) = PRIMARY_POOL.get() {
        return pool.clone();
    }
    log::info!("Using PostgreSQL database");
    let pool = init_postgres(url);
    let _ = PRIMARY_POOL.set(pool.clone());
    pool
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

fn init_postgres(url: &str) -> DbPool {
    let default_max = if cfg!(test) { 8 } else { 50 };
    let max_size = env_pool_size("DB_POOL_MAX_SIZE", default_max);
    let pg_config: postgres::Config = url.parse().expect("Invalid DATABASE_URL");
    let manager = PgManager::new(pg_config, NoTls);
    let pool = Pool::builder()
        .max_size(max_size)
        .build(manager)
        .expect("Failed to create PostgreSQL pool");

    DbPool(pool)
}
