pub mod connection;
pub mod dialect;
pub mod error;
pub mod migrations;
pub mod params;
pub mod pool;
pub mod postgres_bootstrap;
pub mod postgres_seeds;
pub mod row;

pub use connection::{Connection, OptionalExt, Statement, Transaction};
pub use dialect::Backend;
pub use error::{DbError, Result};
pub use params::{from_one, from_two, into_param_value, Params, ParamValue, ToParams};
pub use pool::{init_pool, DbPool};
pub use row::Row;

pub fn run_migrations(pool: &DbPool) {
    match pool.backend() {
        Backend::Sqlite => migrations::run_sqlite_migrations(pool),
        Backend::Postgres => postgres_bootstrap::ensure_postgres_schema(pool),
    }
}
