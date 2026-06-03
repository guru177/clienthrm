pub mod migrations;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

pub type DbPool = Pool<SqliteConnectionManager>;

pub fn init_pool(database_path: &str) -> DbPool {
    let manager = SqliteConnectionManager::file(database_path);
    let pool = Pool::builder()
        .max_size(10)
        .build(manager)
        .expect("Failed to create database pool");

    // Enable WAL mode and foreign keys
    {
        let conn = pool.get().expect("Failed to get connection");
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=5000;",
        )
        .expect("Failed to set pragmas");
    }

    pool
}
