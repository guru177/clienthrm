use crate::db::error::{DbError, Result};

/// Unified row accessor for SQLite and PostgreSQL.
pub enum Row<'a> {
    Sqlite(&'a rusqlite::Row<'a>),
    Postgres(&'a postgres::Row),
}

impl Row<'_> {
    pub fn get<T>(&self, col: &str) -> Result<T>
    where
        T: RowGet,
    {
        match self {
            Row::Sqlite(r) => T::from_sqlite(r, col),
            Row::Postgres(r) => T::from_postgres(r, col),
        }
    }

    pub fn get_idx<T>(&self, idx: usize) -> Result<T>
    where
        T: RowGetIdx,
    {
        match self {
            Row::Sqlite(r) => T::from_sqlite_idx(r, idx),
            Row::Postgres(r) => T::from_postgres_idx(r, idx),
        }
    }
}

pub trait RowGet: Sized {
    fn from_sqlite(row: &rusqlite::Row<'_>, col: &str) -> Result<Self>;
    fn from_postgres(row: &postgres::Row, col: &str) -> Result<Self>;
}

pub trait RowGetIdx: Sized {
    fn from_sqlite_idx(row: &rusqlite::Row<'_>, idx: usize) -> Result<Self>;
    fn from_postgres_idx(row: &postgres::Row, idx: usize) -> Result<Self>;
}

macro_rules! impl_row_get {
    ($ty:ty) => {
        impl RowGet for $ty {
            fn from_sqlite(row: &rusqlite::Row<'_>, col: &str) -> Result<Self> {
                row.get(col).map_err(DbError::from)
            }
            fn from_postgres(row: &postgres::Row, col: &str) -> Result<Self> {
                row.try_get(col).map_err(DbError::from)
            }
        }
        impl RowGetIdx for $ty {
            fn from_sqlite_idx(row: &rusqlite::Row<'_>, idx: usize) -> Result<Self> {
                row.get(idx).map_err(DbError::from)
            }
            fn from_postgres_idx(row: &postgres::Row, idx: usize) -> Result<Self> {
                row.try_get(idx).map_err(DbError::from)
            }
        }
    };
}

impl_row_get!(i64);
impl_row_get!(i32);
impl_row_get!(f64);
impl_row_get!(String);
impl_row_get!(bool);
impl_row_get!(Vec<u8>);

impl RowGet for Option<String> {
    fn from_sqlite(row: &rusqlite::Row<'_>, col: &str) -> Result<Self> {
        row.get(col).map_err(DbError::from)
    }
    fn from_postgres(row: &postgres::Row, col: &str) -> Result<Self> {
        row.try_get(col).map_err(DbError::from)
    }
}

impl RowGetIdx for Option<String> {
    fn from_sqlite_idx(row: &rusqlite::Row<'_>, idx: usize) -> Result<Self> {
        row.get(idx).map_err(DbError::from)
    }
    fn from_postgres_idx(row: &postgres::Row, idx: usize) -> Result<Self> {
        row.try_get(idx).map_err(DbError::from)
    }
}

impl RowGet for Option<i64> {
    fn from_sqlite(row: &rusqlite::Row<'_>, col: &str) -> Result<Self> {
        row.get(col).map_err(DbError::from)
    }
    fn from_postgres(row: &postgres::Row, col: &str) -> Result<Self> {
        row.try_get(col).map_err(DbError::from)
    }
}

impl RowGetIdx for Option<i64> {
    fn from_sqlite_idx(row: &rusqlite::Row<'_>, idx: usize) -> Result<Self> {
        row.get(idx).map_err(DbError::from)
    }
    fn from_postgres_idx(row: &postgres::Row, idx: usize) -> Result<Self> {
        row.try_get(idx).map_err(DbError::from)
    }
}

impl RowGet for Option<i32> {
    fn from_sqlite(row: &rusqlite::Row<'_>, col: &str) -> Result<Self> {
        row.get(col).map_err(DbError::from)
    }
    fn from_postgres(row: &postgres::Row, col: &str) -> Result<Self> {
        row.try_get(col).map_err(DbError::from)
    }
}

impl RowGetIdx for Option<i32> {
    fn from_sqlite_idx(row: &rusqlite::Row<'_>, idx: usize) -> Result<Self> {
        row.get(idx).map_err(DbError::from)
    }
    fn from_postgres_idx(row: &postgres::Row, idx: usize) -> Result<Self> {
        row.try_get(idx).map_err(DbError::from)
    }
}

impl RowGet for Option<f64> {
    fn from_sqlite(row: &rusqlite::Row<'_>, col: &str) -> Result<Self> {
        row.get(col).map_err(DbError::from)
    }
    fn from_postgres(row: &postgres::Row, col: &str) -> Result<Self> {
        row.try_get(col).map_err(DbError::from)
    }
}

impl RowGetIdx for Option<f64> {
    fn from_sqlite_idx(row: &rusqlite::Row<'_>, idx: usize) -> Result<Self> {
        row.get(idx).map_err(DbError::from)
    }
    fn from_postgres_idx(row: &postgres::Row, idx: usize) -> Result<Self> {
        row.try_get(idx).map_err(DbError::from)
    }
}

impl RowGet for Option<bool> {
    fn from_sqlite(row: &rusqlite::Row<'_>, col: &str) -> Result<Self> {
        match row.get::<_, Option<i64>>(col) {
            Ok(Some(v)) => Ok(Some(v != 0)),
            Ok(None) => Ok(None),
            Err(e) => match row.get::<_, Option<bool>>(col) {
                Ok(v) => Ok(v),
                Err(_) => Err(DbError::from(e)),
            },
        }
    }
    fn from_postgres(row: &postgres::Row, col: &str) -> Result<Self> {
        match row.try_get::<_, Option<i16>>(col) {
            Ok(Some(v)) => Ok(Some(v != 0)),
            Ok(None) => Ok(None),
            Err(_) => match row.try_get::<_, Option<i64>>(col) {
                Ok(Some(v)) => Ok(Some(v != 0)),
                Ok(None) => Ok(None),
                Err(_) => row.try_get(col).map_err(DbError::from),
            },
        }
    }
}

impl RowGetIdx for Option<bool> {
    fn from_sqlite_idx(row: &rusqlite::Row<'_>, idx: usize) -> Result<Self> {
        match row.get::<_, Option<i64>>(idx) {
            Ok(Some(v)) => Ok(Some(v != 0)),
            Ok(None) => Ok(None),
            Err(e) => match row.get::<_, Option<bool>>(idx) {
                Ok(v) => Ok(v),
                Err(_) => Err(DbError::from(e)),
            },
        }
    }
    fn from_postgres_idx(row: &postgres::Row, idx: usize) -> Result<Self> {
        match row.try_get::<_, Option<i16>>(idx) {
            Ok(Some(v)) => Ok(Some(v != 0)),
            Ok(None) => Ok(None),
            Err(_) => match row.try_get::<_, Option<i64>>(idx) {
                Ok(Some(v)) => Ok(Some(v != 0)),
                Ok(None) => Ok(None),
                Err(_) => row.try_get(idx).map_err(DbError::from),
            },
        }
    }
}
