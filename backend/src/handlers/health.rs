use actix_web::{web, HttpResponse};
use crate::db::dialect::Backend;
use crate::db::runtime::{run_db, BlockJson};
use crate::db::DbPool;

fn health_payload(pool: &DbPool, db_ok: bool) -> BlockJson {
    let backend = match pool.backend() {
        Backend::Sqlite => "sqlite",
        Backend::Postgres => "postgres",
    };

    let redis_ok = std::env::var("REDIS_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|url| redis::Client::open(url.as_str()).and_then(|c| c.get_connection()).is_ok())
        .unwrap_or(true);

    let status = if db_ok { "ok" } else { "degraded" };
    let code = if db_ok { 200 } else { 503 };

    BlockJson {
        status: code,
        body: serde_json::json!({
            "status": status,
            "service": "hrm-backend",
            "database": { "backend": backend, "ok": db_ok },
            "redis": {
                "configured": std::env::var("REDIS_URL").ok().filter(|s| !s.is_empty()).is_some(),
                "ok": redis_ok
            },
            "pg_rls": crate::db::tenant_rls::pg_rls_enabled(),
            "version": env!("CARGO_PKG_VERSION"),
        }),
        set_cookie: None,
    }
}

/// GET /api/health — liveness + basic dependency checks for load balancers.
pub async fn health(pool: web::Data<DbPool>) -> HttpResponse {
    match run_db(&pool, |p| {
        let db_ok = p.get().is_ok();
        health_payload(p, db_ok)
    })
    .await
    {
        Ok(block) => block.into_response(),
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}
