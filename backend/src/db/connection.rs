use std::sync::Mutex;

use r2d2_postgres::PostgresConnectionManager;
use r2d2_sqlite::SqliteConnectionManager;

use crate::db::dialect::{adapt_sql, Backend};
use crate::db::error::{DbError, Result};
use crate::db::params::{Params, ToParams};
use crate::db::row::Row;

fn sqlite_cb_err(e: DbError) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(e))
}

type PgConn = r2d2::PooledConnection<PostgresConnectionManager<postgres::NoTls>>;

pub struct Connection {
    backend: Backend,
    sqlite: Option<r2d2::PooledConnection<SqliteConnectionManager>>,
    postgres: Option<Mutex<PgConn>>,
    /// Last `id` from an INSERT … RETURNING on this connection (PostgreSQL).
    last_insert_id: Mutex<Option<i64>>,
    /// True when a PostgreSQL transaction is open on this connection.
    pg_in_transaction: Mutex<bool>,
}

impl Connection {
    pub fn sqlite(conn: r2d2::PooledConnection<SqliteConnectionManager>) -> Self {
        let _ = conn.execute_batch(
            "PRAGMA busy_timeout=5000;
             PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;",
        );
        Self {
            backend: Backend::Sqlite,
            sqlite: Some(conn),
            postgres: None,
            last_insert_id: Mutex::new(None),
            pg_in_transaction: Mutex::new(false),
        }
    }

    pub fn postgres(mut conn: PgConn) -> Self {
        let mut set_timezone = || {
            let _ = conn.batch_execute("SET timezone = 'UTC'");
        };
        if tokio::runtime::Handle::try_current().is_ok() {
            std::thread::scope(|scope| match scope.spawn(set_timezone).join() {
                Ok(()) => (),
                Err(panic) => std::panic::resume_unwind(panic),
            });
        } else {
            set_timezone();
        }
        Self {
            backend: Backend::Postgres,
            sqlite: None,
            postgres: Some(Mutex::new(conn)),
            last_insert_id: Mutex::new(None),
            pg_in_transaction: Mutex::new(false),
        }
    }

    pub fn backend(&self) -> Backend {
        self.backend
    }

    fn with_postgres<T, F>(&self, f: F) -> T
    where
        T: Send,
        F: FnOnce(&mut PgConn) -> T + Send,
    {
        let pg_mutex = self.postgres.as_ref().expect("postgres connection");
        if tokio::runtime::Handle::try_current().is_ok() {
            std::thread::scope(|scope| {
                match scope
                    .spawn(move || {
                        let mut pg = pg_mutex.lock().unwrap();
                        f(&mut pg)
                    })
                    .join()
                {
                    Ok(result) => result,
                    Err(panic) => std::panic::resume_unwind(panic),
                }
            })
        } else {
            let mut pg = pg_mutex.lock().unwrap();
            f(&mut pg)
        }
    }

    /// Return a PostgreSQL pooled connection off the Tokio runtime (sync `postgres` crate).
    fn release_postgres_conn(&mut self) {
        if self.backend != Backend::Postgres {
            return;
        }
        let Some(pg_mutex) = self.postgres.take() else {
            return;
        };
        let pg = match pg_mutex.into_inner() {
            Ok(c) => c,
            Err(p) => p.into_inner(),
        };
        if tokio::runtime::Handle::try_current().is_ok() {
            // Return connection to r2d2 off the async runtime (sync postgres cannot drop on Tokio).
            std::thread::spawn(move || drop(pg));
        } else {
            drop(pg);
        }
    }

    pub fn sqlite_conn(&self) -> &rusqlite::Connection {
        self.sqlite.as_ref().expect("sqlite connection")
    }

    pub fn query_row<T, P, F>(&self, sql: &str, params: P, f: F) -> Result<T>
    where
        P: ToParams,
        F: FnOnce(&Row<'_>) -> Result<T>,
    {
        let params = params.to_params();
        match self.backend {
            Backend::Sqlite => {
                let conn = self.sqlite.as_ref().expect("sqlite connection");
                let sql = adapt_sql(sql, Backend::Sqlite);
                let vals = params.sqlite_values();
                conn.query_row(&sql, rusqlite::params_from_iter(vals.iter()), |row| {
                    f(&Row::Sqlite(row)).map_err(sqlite_cb_err)
                })
                .map_err(DbError::from)
            }
            Backend::Postgres => {
                let sql = adapt_sql(sql, Backend::Postgres);
                let boxes = params.postgres_boxes();
                let row = self.with_postgres(|pg| {
                    let refs = Params::postgres_refs(&boxes);
                    pg.query_one(&sql, &refs).map_err(DbError::from)
                })?;
                f(&Row::Postgres(&row))
            }
        }
    }

    pub fn execute<P: ToParams>(&self, sql: &str, params: P) -> Result<usize> {
        let params = params.to_params();
        match self.backend {
            Backend::Sqlite => {
                let conn = self.sqlite.as_ref().expect("sqlite connection");
                let sql = adapt_sql(sql, Backend::Sqlite);
                let vals = params.sqlite_values();
                conn.execute(&sql, rusqlite::params_from_iter(vals.iter()))
                    .map_err(DbError::from)
            }
            Backend::Postgres => {
                let sql = adapt_sql(sql, Backend::Postgres);
                if is_insert_without_returning(&sql) {
                    return self.execute_insert_returning_id(&sql, params);
                }
                let boxes = params.postgres_boxes();
                self.with_postgres(|pg| {
                    let refs = Params::postgres_refs(&boxes);
                    pg.execute(&sql, &refs)
                        .map_err(DbError::from)
                        .map(|n| n as usize)
                })
            }
        }
    }

    fn execute_insert_returning_id(&self, sql: &str, params: Params) -> Result<usize> {
        let returning_sql = format!("{} RETURNING id", sql.trim().trim_end_matches(';'));
        match self.query_row(&returning_sql, params.clone(), |row| row.get_idx::<i64>(0)) {
            Ok(id) => {
                *self.last_insert_id.lock().unwrap() = Some(id);
                Ok(1)
            }
            // No row returned (e.g. `ON CONFLICT DO NOTHING` hit an existing row) or the
            // table has no integer `id` column (TEXT/composite PK). Fall back to a plain
            // INSERT so the row is still written; last_insert_id is left unset.
            Err(_) => {
                *self.last_insert_id.lock().unwrap() = None;
                let boxes = params.postgres_boxes();
                self.with_postgres(|pg| {
                    let refs = Params::postgres_refs(&boxes);
                    pg.execute(sql, &refs)
                        .map_err(DbError::from)
                        .map(|n| n as usize)
                })
            }
        }
    }

    pub fn unchecked_transaction(&self) -> Result<Transaction<'_>> {
        match self.backend {
            Backend::Sqlite => {
                let tx = self
                    .sqlite_conn()
                    .unchecked_transaction()
                    .map_err(DbError::from)?;
                Ok(Transaction {
                    backend: Backend::Sqlite,
                    sqlite: Some(tx),
                    postgres: None,
                    finished: std::cell::Cell::new(false),
                })
            }
            Backend::Postgres => {
                self.with_postgres(|pg| pg.batch_execute("BEGIN").map_err(DbError::from))?;
                *self.pg_in_transaction.lock().unwrap() = true;
                Ok(Transaction {
                    backend: Backend::Postgres,
                    sqlite: None,
                    postgres: Some(self),
                    finished: std::cell::Cell::new(false),
                })
            }
        }
    }

    pub fn execute_batch(&self, sql: &str) -> Result<()> {
        match self.backend {
            Backend::Sqlite => {
                let conn = self.sqlite.as_ref().expect("sqlite connection");
                conn.execute_batch(sql).map_err(DbError::from)
            }
            Backend::Postgres => {
                let upper = sql.trim().to_ascii_uppercase();
                if upper == "BEGIN" || upper == "BEGIN IMMEDIATE" || upper.starts_with("BEGIN ") {
                    self.with_postgres(|pg| pg.batch_execute("BEGIN").map_err(DbError::from))?;
                    *self.pg_in_transaction.lock().unwrap() = true;
                    return Ok(());
                }
                if upper == "COMMIT" {
                    return self.pg_commit();
                }
                if upper == "ROLLBACK" {
                    return self.pg_rollback();
                }
                let adapted = adapt_sql(sql, Backend::Postgres);
                self.with_postgres(|pg| pg.batch_execute(&adapted).map_err(DbError::from))
            }
        }
    }

    fn pg_commit(&self) -> Result<()> {
        self.with_postgres(|pg| pg.batch_execute("COMMIT").map_err(DbError::from))?;
        *self.pg_in_transaction.lock().unwrap() = false;
        Ok(())
    }

    fn pg_rollback(&self) -> Result<()> {
        let _ = self.with_postgres(|pg| pg.batch_execute("ROLLBACK"));
        *self.pg_in_transaction.lock().unwrap() = false;
        Ok(())
    }

    pub fn last_insert_rowid(&self) -> i64 {
        match self.backend {
            Backend::Sqlite => self
                .sqlite
                .as_ref()
                .expect("sqlite connection")
                .last_insert_rowid(),
            Backend::Postgres => self.last_insert_id.lock().unwrap().unwrap_or(0),
        }
    }

    pub fn prepare(&self, sql: &str) -> Result<Statement<'_>> {
        Ok(Statement {
            sql: adapt_sql(sql, self.backend),
            conn: self,
        })
    }

    pub fn query_map<T, P, F>(&self, sql: &str, params: P, f: F) -> Vec<T>
    where
        P: ToParams,
        F: FnMut(&Row<'_>) -> Result<T>,
    {
        self.query_map_result(sql, params, f).unwrap_or_default()
    }

    pub fn query_map_result<T, P, F>(&self, sql: &str, params: P, mut f: F) -> Result<Vec<T>>
    where
        P: ToParams,
        F: FnMut(&Row<'_>) -> Result<T>,
    {
        let params = params.to_params();
        match self.backend {
            Backend::Sqlite => {
                let conn = self.sqlite.as_ref().expect("sqlite connection");
                let vals = params.sqlite_values();
                let mut stmt = conn
                    .prepare(&adapt_sql(sql, Backend::Sqlite))
                    .map_err(DbError::from)?;
                let rows = stmt
                    .query_map(rusqlite::params_from_iter(vals.iter()), |row| {
                        f(&Row::Sqlite(row)).map_err(sqlite_cb_err)
                    })
                    .map_err(DbError::from)?;
                rows.collect::<std::result::Result<Vec<_>, _>>()
                    .map_err(DbError::from)
            }
            Backend::Postgres => {
                let sql = adapt_sql(sql, Backend::Postgres);
                let boxes = params.postgres_boxes();
                let rows = self.with_postgres(|pg| {
                    let refs = Params::postgres_refs(&boxes);
                    pg.query(&sql, &refs).map_err(DbError::from)
                })?;
                rows.iter()
                    .map(|row| f(&Row::Postgres(row)))
                    .collect()
            }
        }
    }
}

impl Drop for Connection {
    fn drop(&mut self) {
        self.release_postgres_conn();
    }
}

fn is_insert_without_returning(sql: &str) -> bool {
    let upper = sql.trim().to_ascii_uppercase();
    upper.starts_with("INSERT") && !upper.contains("RETURNING")
}

pub struct Transaction<'conn> {
    backend: Backend,
    sqlite: Option<rusqlite::Transaction<'conn>>,
    postgres: Option<&'conn Connection>,
    finished: std::cell::Cell<bool>,
}

impl Transaction<'_> {
    pub fn query_row<T, P, F>(&self, sql: &str, params: P, f: F) -> Result<T>
    where
        P: ToParams,
        F: FnOnce(&Row<'_>) -> Result<T>,
    {
        match self.backend {
            Backend::Sqlite => {
                let tx = self.sqlite.as_ref().expect("sqlite transaction");
                let params = params.to_params();
                let sql = adapt_sql(sql, Backend::Sqlite);
                let vals = params.sqlite_values();
                tx.query_row(&sql, rusqlite::params_from_iter(vals.iter()), |row| {
                    f(&Row::Sqlite(row)).map_err(sqlite_cb_err)
                })
                .map_err(DbError::from)
            }
            Backend::Postgres => self
                .postgres
                .expect("postgres transaction")
                .query_row(sql, params, f),
        }
    }

    pub fn execute<P: ToParams>(&self, sql: &str, params: P) -> Result<usize> {
        match self.backend {
            Backend::Sqlite => {
                let tx = self.sqlite.as_ref().expect("sqlite transaction");
                let params = params.to_params();
                let sql = adapt_sql(sql, Backend::Sqlite);
                let vals = params.sqlite_values();
                tx.execute(&sql, rusqlite::params_from_iter(vals.iter()))
                    .map_err(DbError::from)
            }
            Backend::Postgres => self
                .postgres
                .expect("postgres transaction")
                .execute(sql, params),
        }
    }

    pub fn last_insert_rowid(&self) -> i64 {
        match self.backend {
            Backend::Sqlite => self
                .sqlite
                .as_ref()
                .expect("sqlite transaction")
                .last_insert_rowid(),
            Backend::Postgres => self
                .postgres
                .expect("postgres transaction")
                .last_insert_rowid(),
        }
    }

    pub fn commit(mut self) -> Result<()> {
        self.finished.set(true);
        match self.backend {
            Backend::Sqlite => self
                .sqlite
                .take()
                .expect("sqlite transaction")
                .commit()
                .map_err(DbError::from),
            Backend::Postgres => self
                .postgres
                .expect("postgres transaction")
                .pg_commit(),
        }
    }

    pub fn rollback(mut self) -> Result<()> {
        self.finished.set(true);
        match self.backend {
            Backend::Sqlite => self
                .sqlite
                .take()
                .expect("sqlite transaction")
                .rollback()
                .map_err(DbError::from),
            Backend::Postgres => self
                .postgres
                .expect("postgres transaction")
                .pg_rollback(),
        }
    }
}

impl Drop for Transaction<'_> {
    /// Safety net for Postgres: if a transaction is dropped without an explicit
    /// commit/rollback (e.g. an early `return` on an error path), roll it back so the
    /// pooled connection is not left stuck mid-`BEGIN`. SQLite's own transaction Drop
    /// already rolls back, so nothing to do there.
    fn drop(&mut self) {
        if self.backend == Backend::Postgres && !self.finished.get() {
            if let Some(conn) = self.postgres {
                let _ = conn.pg_rollback();
            }
        }
    }
}

pub struct Statement<'conn> {
    sql: String,
    conn: &'conn Connection,
}

impl Statement<'_> {
    pub fn query_map<T, P, F>(&self, params: P, f: F) -> Vec<T>
    where
        P: ToParams,
        F: FnMut(&Row<'_>) -> Result<T>,
    {
        self.conn.query_map(&self.sql, params, f)
    }
}

pub trait OptionalExt<T> {
    fn optional(self) -> Result<Option<T>>;
}

impl<T> OptionalExt<T> for Result<T> {
    fn optional(self) -> Result<Option<T>> {
        match self {
            Ok(v) => Ok(Some(v)),
            Err(DbError::NotFound) => Ok(None),
            Err(e) => Err(e),
        }
    }
}
