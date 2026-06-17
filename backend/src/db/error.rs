use std::fmt;

#[derive(Debug)]
pub enum DbError {
    Query(String),
    NotFound,
    Other(String),
}

impl fmt::Display for DbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DbError::Query(msg) => write!(f, "{msg}"),
            DbError::NotFound => write!(f, "Row not found"),
            DbError::Other(msg) => write!(f, "{msg}"),
        }
    }
}

impl std::error::Error for DbError {}

impl From<rusqlite::Error> for DbError {
    fn from(value: rusqlite::Error) -> Self {
        match value {
            rusqlite::Error::QueryReturnedNoRows => DbError::NotFound,
            other => DbError::Query(other.to_string()),
        }
    }
}

impl From<postgres::Error> for DbError {
    fn from(value: postgres::Error) -> Self {
        DbError::Query(value.to_string())
    }
}

impl From<r2d2::Error> for DbError {
    fn from(value: r2d2::Error) -> Self {
        DbError::Other(value.to_string())
    }
}

pub type Result<T> = std::result::Result<T, DbError>;
