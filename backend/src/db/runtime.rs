use actix_web::{web, HttpResponse};

use crate::db::{Backend, DbPool};
use crate::models::{ApiError, ApiResponse};

/// Serializable result from blocking DB work (HttpResponse is not always Send).
pub struct BlockJson {
    pub status: u16,
    pub body: serde_json::Value,
}

impl BlockJson {
    pub fn ok<T: serde::Serialize>(value: T) -> Self {
        Self {
            status: 200,
            body: serde_json::to_value(ApiResponse::success(value)).unwrap_or_default(),
        }
    }

    pub fn error(status: u16, message: &str) -> Self {
        Self {
            status,
            body: serde_json::to_value(ApiError::new(message)).unwrap_or_default(),
        }
    }

    pub fn into_response(self) -> HttpResponse {
        let status = actix_web::http::StatusCode::from_u16(self.status)
            .unwrap_or(actix_web::http::StatusCode::INTERNAL_SERVER_ERROR);
        HttpResponse::build(status).json(self.body)
    }
}

/// Run synchronous database work off the Tokio runtime when using PostgreSQL.
pub async fn run_db<F>(pool: &DbPool, f: F) -> Result<BlockJson, actix_web::Error>
where
    F: FnOnce(&DbPool) -> BlockJson + Send + 'static,
{
    if pool.backend() == Backend::Postgres {
        let pool = pool.clone();
        web::block(move || f(&pool))
            .await
            .map_err(actix_web::error::ErrorInternalServerError)
    } else {
        Ok(f(pool))
    }
}
