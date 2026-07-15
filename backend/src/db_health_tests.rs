//! Database Health and Integrity Tests.
use std::sync::OnceLock;

use crate::db::{init_pool, run_migrations, DbPool};

struct TestHarness {
    pool: DbPool,
}

static SHARED_HARNESS: OnceLock<TestHarness> = OnceLock::new();

fn shared_harness() -> &'static TestHarness {
    SHARED_HARNESS.get_or_init(|| {
        let database_url = std::env::var("TEST_DATABASE_URL")
            .or_else(|_| std::env::var("DATABASE_URL"))
            .unwrap_or_else(|_| "postgres://hrm:hrm@127.0.0.1:5433/hrm".to_string());

        let pool = init_pool(&database_url);
        // Ensure migrations run cleanly without panics
        run_migrations(&pool);
        
        TestHarness { pool }
    })
}

#[test]
fn test_migrations_apply_cleanly() {
    let harness = shared_harness();
    let conn = harness.pool.get_platform().expect("Failed to get DB connection");
    
    // We check if the schema_migrations table exists and has entries
    let count: i64 = conn.query_row(
        "SELECT count(*) FROM schema_migrations",
        [],
        |row| row.get_idx(0)
    ).unwrap_or(0);
    
    assert!(count > 0, "Migrations should have been recorded");
}



#[test]
fn test_concurrent_db_connections() {
    let harness = shared_harness();
    let mut threads = vec![];
    
    for i in 0..10 {
        let pool = harness.pool.clone();
        threads.push(std::thread::spawn(move || {
            let conn = pool.get_platform().expect("Failed to get connection");
            let result: i64 = conn.query_row("SELECT 1", [], |r| r.get_idx(0)).unwrap();
            assert_eq!(result, 1);
        }));
    }
    
    for t in threads {
        t.join().unwrap();
    }
}
