use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;

#[derive(Debug, Deserialize)]
pub struct UpsertWebhookRequest {
    pub url: String,
    pub secret: Option<String>,
    pub events: Option<String>,
    pub is_active: Option<bool>,
}

/// GET /api/admin/integrations/webhooks
pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    crate::tenant_webhooks::migrate_tenant_webhooks(&conn);

    let stmt = match conn.prepare(
        "SELECT id, url, events, is_active, created_at, updated_at
         FROM tenant_webhooks WHERE organization_id = ?1 ORDER BY id DESC",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let rows: Vec<serde_json::Value> = stmt.query_map(crate::params![org_id], |row| {
        Ok(serde_json::json!({
            "id": row.get_idx::<i64>(0)?,
            "url": row.get_idx::<String>(1)?,
            "events": row.get_idx::<String>(2)?,
            "is_active": row.get_idx::<i64>(3).unwrap_or(1) == 1,
            "created_at": row.get_idx::<Option<String>>(4)?,
            "updated_at": row.get_idx::<Option<String>>(5)?,
        }))
    });
    HttpResponse::Ok().json(ApiResponse::success(rows))
}

/// POST /api/admin/integrations/webhooks
pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<UpsertWebhookRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    crate::tenant_webhooks::migrate_tenant_webhooks(&conn);

    let url = body.url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return HttpResponse::BadRequest().json(ApiError::new("URL must be http(s)"));
    }
    let secret = body
        .secret
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let events = body
        .events
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "*".to_string());
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let is_active = body.is_active.unwrap_or(true);

    match conn.execute(
        "INSERT INTO tenant_webhooks (organization_id, url, secret, events, is_active, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        crate::params![org_id, url, &secret, events, if is_active { 1 } else { 0 }, &now],
    ) {
        Ok(_) => HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
            "id": conn.last_insert_rowid(),
            "secret": secret,
            "message": "Webhook registered. Store the secret — it is only shown once.",
        }))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}

/// PUT /api/admin/integrations/webhooks/{id}
pub async fn update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<UpsertWebhookRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let webhook_id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let url = body.url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return HttpResponse::BadRequest().json(ApiError::new("URL must be http(s)"));
    }
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let events = body
        .events
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "*".to_string());
    let is_active = body.is_active.unwrap_or(true);

    let updated = if let Some(ref secret) = body.secret {
        if !secret.trim().is_empty() {
            conn.execute(
                "UPDATE tenant_webhooks SET url=?1, secret=?2, events=?3, is_active=?4, updated_at=?5
                 WHERE id=?6 AND organization_id=?7",
                crate::params![
                    url,
                    secret,
                    events,
                    if is_active { 1 } else { 0 },
                    &now,
                    webhook_id,
                    org_id
                ],
            )
        } else {
            conn.execute(
                "UPDATE tenant_webhooks SET url=?1, events=?2, is_active=?3, updated_at=?4
                 WHERE id=?5 AND organization_id=?6",
                crate::params![url, events, if is_active { 1 } else { 0 }, &now, webhook_id, org_id],
            )
        }
    } else {
        conn.execute(
            "UPDATE tenant_webhooks SET url=?1, events=?2, is_active=?3, updated_at=?4
             WHERE id=?5 AND organization_id=?6",
            crate::params![url, events, if is_active { 1 } else { 0 }, &now, webhook_id, org_id],
        )
    };

    match updated {
        Ok(n) if n > 0 => {
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"})))
        }
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Webhook not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}

/// DELETE /api/admin/integrations/webhooks/{id}
pub async fn destroy(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let webhook_id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    match conn.execute(
        "DELETE FROM tenant_webhooks WHERE id=?1 AND organization_id=?2",
        crate::params![webhook_id, org_id],
    ) {
        Ok(n) if n > 0 => {
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"})))
        }
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Webhook not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}

/// GET /api/admin/integrations/webhooks/{id}/deliveries
pub async fn deliveries(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let webhook_id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let exists = conn
        .query_row(
            "SELECT 1 FROM tenant_webhooks WHERE id=?1 AND organization_id=?2",
            crate::params![webhook_id, org_id],
            |_| Ok(()),
        )
        .is_ok();
    if !exists {
        return HttpResponse::NotFound().json(ApiError::new("Webhook not found"));
    }

    let stmt = match conn.prepare(
        "SELECT id, event_type, status_code, success, error, created_at
         FROM tenant_webhook_deliveries
         WHERE webhook_id = ?1 AND organization_id = ?2
         ORDER BY id DESC LIMIT 50",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let rows: Vec<serde_json::Value> =
        stmt.query_map(crate::params![webhook_id, org_id], |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "event_type": row.get_idx::<String>(1)?,
                "status_code": row.get_idx::<Option<i64>>(2)?,
                "success": row.get_idx::<i64>(3).unwrap_or(0) == 1,
                "error": row.get_idx::<Option<String>>(4)?,
                "created_at": row.get_idx::<Option<String>>(5)?,
            }))
        });
    HttpResponse::Ok().json(ApiResponse::success(rows))
}
