use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use crate::db::error::{DbError, Result};

fn postgres_timestamp_string(row: &postgres::Row, col: &str) -> Result<Option<String>> {
    if let Ok(v) = row.try_get::<_, Option<String>>(col) {
        return Ok(v);
    }
    if let Ok(v) = row.try_get::<_, Option<NaiveDateTime>>(col) {
        return Ok(v.map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string()));
    }
    if let Ok(v) = row.try_get::<_, Option<DateTime<Utc>>>(col) {
        return Ok(v.map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string()));
    }
    if let Ok(v) = row.try_get::<_, Option<NaiveDate>>(col) {
        return Ok(v.map(|d| d.format("%Y-%m-%d").to_string()));
    }
    if let Ok(v) = row.try_get::<_, Option<NaiveTime>>(col) {
        return Ok(v.map(|t| t.format("%H:%M:%S").to_string()));
    }
    row.try_get::<_, Option<String>>(col).map_err(DbError::from)
}

fn postgres_timestamp_string_idx(row: &postgres::Row, idx: usize) -> Result<Option<String>> {
    if let Ok(v) = row.try_get::<_, Option<String>>(idx) {
        return Ok(v);
    }
    if let Ok(v) = row.try_get::<_, Option<NaiveDateTime>>(idx) {
        return Ok(v.map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string()));
    }
    if let Ok(v) = row.try_get::<_, Option<DateTime<Utc>>>(idx) {
        return Ok(v.map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string()));
    }
    if let Ok(v) = row.try_get::<_, Option<NaiveDate>>(idx) {
        return Ok(v.map(|d| d.format("%Y-%m-%d").to_string()));
    }
    if let Ok(v) = row.try_get::<_, Option<NaiveTime>>(idx) {
        return Ok(v.map(|t| t.format("%H:%M:%S").to_string()));
    }
    row.try_get::<_, Option<String>>(idx).map_err(DbError::from)
}

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

    /// Read bool-ish columns stored as bool / smallint / int in PostgreSQL or SQLite.
    pub fn get_boolish(&self, col: &str) -> Result<bool> {
        match self.get::<Option<i64>>(col) {
            Ok(Some(v)) => Ok(v != 0),
            Ok(None) => Ok(false),
            Err(_) => match self.get::<Option<bool>>(col) {
                Ok(Some(v)) => Ok(v),
                Ok(None) => Ok(false),
                Err(e) => Err(e),
            },
        }
    }

    /// Read a required string column (text or timestamp).
    pub fn get_string_flex(&self, col: &str) -> Result<String> {
        match self.get::<Option<String>>(col) {
            Ok(Some(v)) => Ok(v),
            Ok(None) => Ok(String::new()),
            Err(e) => Err(e),
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

/// PostgreSQL `INTEGER` (INT4) vs `BIGINT` (INT8): accept both when callers use `i64`.
impl RowGet for i64 {
    fn from_sqlite(row: &rusqlite::Row<'_>, col: &str) -> Result<Self> {
        row.get(col).map_err(DbError::from)
    }
    fn from_postgres(row: &postgres::Row, col: &str) -> Result<Self> {
        if let Ok(v) = row.try_get::<_, i64>(col) {
            return Ok(v);
        }
        if let Ok(v) = row.try_get::<_, i32>(col) {
            return Ok(i64::from(v));
        }
        let v: i16 = row.try_get(col).map_err(DbError::from)?;
        Ok(i64::from(v))
    }
}

impl RowGetIdx for i64 {
    fn from_sqlite_idx(row: &rusqlite::Row<'_>, idx: usize) -> Result<Self> {
        row.get(idx).map_err(DbError::from)
    }
    fn from_postgres_idx(row: &postgres::Row, idx: usize) -> Result<Self> {
        if let Ok(v) = row.try_get::<_, i64>(idx) {
            return Ok(v);
        }
        if let Ok(v) = row.try_get::<_, i32>(idx) {
            return Ok(i64::from(v));
        }
        let v: i16 = row.try_get(idx).map_err(DbError::from)?;
        Ok(i64::from(v))
    }
}

impl RowGet for String {
    fn from_sqlite(row: &rusqlite::Row<'_>, col: &str) -> Result<Self> {
        row.get(col).map_err(DbError::from)
    }
    fn from_postgres(row: &postgres::Row, col: &str) -> Result<Self> {
        match postgres_timestamp_string(row, col)? {
            Some(v) => Ok(v),
            None => Ok(String::new()),
        }
    }
}

impl RowGetIdx for String {
    fn from_sqlite_idx(row: &rusqlite::Row<'_>, idx: usize) -> Result<Self> {
        row.get(idx).map_err(DbError::from)
    }
    fn from_postgres_idx(row: &postgres::Row, idx: usize) -> Result<Self> {
        match postgres_timestamp_string_idx(row, idx)? {
            Some(v) => Ok(v),
            None => Ok(String::new()),
        }
    }
}

impl_row_get!(i32);
impl_row_get!(f64);
impl_row_get!(bool);
impl_row_get!(Vec<u8>);

impl RowGet for Option<String> {
    fn from_sqlite(row: &rusqlite::Row<'_>, col: &str) -> Result<Self> {
        row.get(col).map_err(DbError::from)
    }
    fn from_postgres(row: &postgres::Row, col: &str) -> Result<Self> {
        postgres_timestamp_string(row, col)
    }
}

impl RowGetIdx for Option<String> {
    fn from_sqlite_idx(row: &rusqlite::Row<'_>, idx: usize) -> Result<Self> {
        row.get(idx).map_err(DbError::from)
    }
    fn from_postgres_idx(row: &postgres::Row, idx: usize) -> Result<Self> {
        postgres_timestamp_string_idx(row, idx)
    }
}

impl RowGet for Option<i64> {
    fn from_sqlite(row: &rusqlite::Row<'_>, col: &str) -> Result<Self> {
        row.get(col).map_err(DbError::from)
    }
    fn from_postgres(row: &postgres::Row, col: &str) -> Result<Self> {
        if let Ok(v) = row.try_get::<_, Option<i64>>(col) {
            return Ok(v);
        }
        if let Ok(v) = row.try_get::<_, Option<i32>>(col) {
            return Ok(v.map(i64::from));
        }
        row.try_get::<_, Option<i16>>(col)
            .map(|opt| opt.map(i64::from))
            .map_err(DbError::from)
    }
}

impl RowGetIdx for Option<i64> {
    fn from_sqlite_idx(row: &rusqlite::Row<'_>, idx: usize) -> Result<Self> {
        row.get(idx).map_err(DbError::from)
    }
    fn from_postgres_idx(row: &postgres::Row, idx: usize) -> Result<Self> {
        if let Ok(v) = row.try_get::<_, Option<i64>>(idx) {
            return Ok(v);
        }
        if let Ok(v) = row.try_get::<_, Option<i32>>(idx) {
            return Ok(v.map(i64::from));
        }
        row.try_get::<_, Option<i16>>(idx)
            .map(|opt| opt.map(i64::from))
            .map_err(DbError::from)
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
