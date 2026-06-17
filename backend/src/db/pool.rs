use r2d2::Pool;
use r2d2_postgres::{postgres::NoTls, PostgresConnectionManager};
use r2d2_sqlite::SqliteConnectionManager;

use crate::db::connection::Connection;
use crate::db::dialect::Backend;

type PgManager = PostgresConnectionManager<NoTls>;

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
            DbPool::Postgres(p) => p.get().map(Connection::postgres),
        }
    }
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

fn init_sqlite(database_path: &str) -> DbPool {
    let manager = SqliteConnectionManager::file(database_path);
    let pool = Pool::builder()
        .max_size(10)
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
    let pg_config: postgres::Config = url.parse().expect("Invalid DATABASE_URL");
    let manager = PgManager::new(pg_config, NoTls);
    let pool = Pool::builder()
        .max_size(20)
        .build(manager)
        .expect("Failed to create PostgreSQL pool");

    if let Ok(mut conn) = pool.get() {
        let _ = conn.batch_execute("SET timezone = 'UTC'");
    }

    DbPool::Postgres(pool)
}
