use actix_web::{web, HttpRequest, HttpResponse};

use crate::db::DbPool;
use crate::handlers::platform_audit::audit_from_request;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};

#[derive(serde::Deserialize)]
pub struct UpgradeRequestBody {
    pub requested_plan: String,
    #[serde(default)]
    pub note: Option<String>,
}

/// POST /api/admin/billing/upgrade-request — tenant admin requests a plan change
pub async fn submit_upgrade_request(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<UpgradeRequestBody>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let org_id = claims.organization_id;
    let requested = body.requested_plan.trim().to_lowercase();
    if requested.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("requested_plan is required"));
    }
    if !crate::plan_limits::plan_slug_exists(&conn, &requested) {
        return HttpResponse::BadRequest().json(ApiError::new("Unknown subscription plan"));
    }

    let (current_plan, org_name): (String, String) = conn
        .query_row(
            "SELECT plan, name FROM organizations WHERE id = ?1",
            [org_id],
            |row| Ok((row.get_idx::<String>(0)?, row.get_idx::<String>(1)?)),
        )
        .unwrap_or_else(|_| ("trial".to_string(), String::new()));

    if current_plan.to_lowercase() == requested {
        return HttpResponse::BadRequest().json(ApiError::new("Already on this plan"));
    }

    let (user_email, user_name): (String, String) = conn
        .query_row(
            "SELECT email, name FROM users WHERE id = ?1",
            [claims.sub],
            |row| Ok((row.get_idx::<String>(0)?, row.get_idx::<String>(1)?)),
        )
        .unwrap_or((claims.email.clone(), "User".to_string()));

    let pending: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM platform_plan_change_requests
             WHERE organization_id = ?1 AND status = 'pending'",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    if pending > 0 {
        return HttpResponse::Conflict()
            .json(ApiError::new("A plan change request is already pending for your organization"));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if conn
        .execute(
            "INSERT INTO platform_plan_change_requests
             (organization_id, requested_plan, current_plan, status, note,
              requested_by_user_id, requested_by_email, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'pending', ?4, ?5, ?6, ?7, ?7)",
            crate::params![
                org_id,
                &requested,
                &current_plan,
                body.note.as_deref(),
                claims.sub,
                &user_email,
                &now
            ],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError()
            .json(ApiError::new("Failed to submit upgrade request"));
    }

    let id = conn.last_insert_rowid();
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "id": id,
        "organization_id": org_id,
        "organization_name": org_name,
        "requested_plan": requested,
        "current_plan": current_plan,
        "status": "pending",
        "requested_by": user_name,
    })))
}

/// GET /api/admin/billing/plans — active subscription plans for upgrade UI
pub async fn available_plans(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let items: Vec<serde_json::Value> = conn.query_map(
        "SELECT slug, name, price_label, billing_period, max_users, features
         FROM subscription_plans
         WHERE is_active = 1
         ORDER BY sort_order ASC, id ASC",
        [],
        |row| {
            let features_raw: String = row.get_idx::<Option<String>>(5)?.unwrap_or_else(|| "[]".to_string());
            let features: Vec<String> = serde_json::from_str(&features_raw).unwrap_or_default();
            Ok(serde_json::json!({
                "slug": row.get_idx::<String>(0)?,
                "name": row.get_idx::<String>(1)?,
                "price_label": row.get_idx::<String>(2)?,
                "billing_period": row.get_idx::<String>(3)?,
                "max_users": row.get_idx::<i64>(4)?,
                "features": features,
            }))
        },
    );

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// GET /api/admin/billing/upgrade-request — tenant sees their latest request
pub async fn my_upgrade_request(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let row = conn.query_row(
        "SELECT id, requested_plan, current_plan, status, note, review_note, created_at, updated_at
         FROM platform_plan_change_requests
         WHERE organization_id = ?1
         ORDER BY id DESC LIMIT 1",
        [claims.organization_id],
        |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "requested_plan": row.get_idx::<String>(1)?,
                "current_plan": row.get_idx::<String>(2)?,
                "status": row.get_idx::<String>(3)?,
                "note": row.get_idx::<Option<String>>(4)?,
                "review_note": row.get_idx::<Option<String>>(5)?,
                "created_at": row.get_idx::<Option<String>>(6)?,
                "updated_at": row.get_idx::<Option<String>>(7)?,
            }))
        },
    );

    match row {
        Ok(v) => HttpResponse::Ok().json(ApiResponse::success(v)),
        Err(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::Value::Null)),
    }
}

/// GET /api/admin/kb — published knowledge base articles for tenants
pub async fn tenant_kb_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let items: Vec<serde_json::Value> = conn.query_map(
        "SELECT slug, title, body, audience, published_at
         FROM platform_kb_articles
         WHERE status = 'published'
         ORDER BY published_at DESC, id DESC",
        [],
        |row| {
            Ok(serde_json::json!({
                "slug": row.get_idx::<String>(0)?,
                "title": row.get_idx::<String>(1)?,
                "body": row.get_idx::<String>(2)?,
                "audience": row.get_idx::<String>(3)?,
                "published_at": row.get_idx::<Option<String>>(4)?,
            }))
        },
    );

    HttpResponse::Ok().json(ApiResponse::success(items))
}

#[derive(serde::Deserialize)]
pub struct CreateTicketBody {
    pub subject: String,
    pub body: String,
    #[serde(default)]
    pub priority: Option<String>,
}

/// POST /api/admin/support/tickets — tenant submits a support ticket
pub async fn tenant_ticket_store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<CreateTicketBody>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    if body.subject.trim().is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Subject is required"));
    }
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let (email, name): (String, String) = conn
        .query_row(
            "SELECT email, name FROM users WHERE id = ?1",
            [claims.sub],
            |row| Ok((row.get_idx::<String>(0)?, row.get_idx::<String>(1)?)),
        )
        .unwrap_or((claims.email.clone(), "User".to_string()));

    let priority = body.priority.as_deref().unwrap_or("normal");
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if conn
        .execute(
            "INSERT INTO platform_support_tickets
             (organization_id, user_id, user_email, user_name, subject, body, status, priority, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7, ?8, ?8)",
            crate::params![
                claims.organization_id,
                claims.sub,
                &email,
                &name,
                body.subject.trim(),
                body.body.trim(),
                priority,
                &now
            ],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to create ticket"));
    }

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "id": conn.last_insert_rowid(),
        "status": "open",
    })))
}

/// GET /api/admin/support/tickets — tenant's own tickets
pub async fn tenant_tickets_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let items: Vec<serde_json::Value> = conn.query_map(
        "SELECT id, subject, body, status, priority, replies_json, created_at, updated_at
         FROM platform_support_tickets
         WHERE organization_id = ?1 AND user_id = ?2
         ORDER BY id DESC LIMIT 50",
        crate::params![claims.organization_id, claims.sub],
        |row| ticket_row_json(row),
    );

    HttpResponse::Ok().json(ApiResponse::success(items))
}

fn ticket_row_json(row: &crate::db::Row) -> crate::db::Result<serde_json::Value> {
    Ok(serde_json::json!({
        "id": row.get_idx::<i64>(0)?,
        "subject": row.get_idx::<String>(1)?,
        "body": row.get_idx::<String>(2)?,
        "status": row.get_idx::<String>(3)?,
        "priority": row.get_idx::<String>(4)?,
        "replies_json": row.get_idx::<Option<String>>(5)?,
        "created_at": row.get_idx::<Option<String>>(6)?,
        "updated_at": row.get_idx::<Option<String>>(7)?,
    }))
}
