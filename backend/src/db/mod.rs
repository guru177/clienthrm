pub mod runtime;
pub mod connection;
pub mod dialect;
pub mod error;
pub mod migrations;
pub mod params;
pub mod pool;
pub mod scalability;
pub mod partitions;
pub mod tenant_rls;
pub mod postgres_bootstrap;
pub mod postgres_seeds;
pub mod row;

pub use connection::{Connection, OptionalExt, Transaction};
pub use dialect::Backend;
pub use error::{DbError, Result};
pub use params::{into_param_value, Params, ParamValue};
pub use pool::{init_pool, init_read_pool, DbPool};
pub use row::Row;

pub fn run_migrations(pool: &DbPool) {
    postgres_bootstrap::ensure_postgres_schema(pool);
}
