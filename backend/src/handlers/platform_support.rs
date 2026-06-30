use actix_web::{web, HttpRequest, HttpResponse};

use crate::db::DbPool;
use crate::handlers::platform_audit::audit_from_request;
use crate::middleware::platform_auth::{get_platform_claims_from_request, require_role};
use crate::models::{ApiError, ApiResponse};

// ── Knowledge base ──────────────────────────────────────────────────────────

/// GET /api/platform/kb
pub async fn kb_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let items: Vec<serde_json::Value> = conn.query_map(
        "SELECT id, slug, title, body, audience, status, published_at, created_at, updated_at
         FROM platform_kb_articles ORDER BY id DESC",
        [],
        |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "slug": row.get_idx::<String>(1)?,
                "title": row.get_idx::<String>(2)?,
                "body": row.get_idx::<String>(3)?,
                "audience": row.get_idx::<String>(4)?,
                "status": row.get_idx::<String>(5)?,
                "published_at": row.get_idx::<Option<String>>(6)?,
                "created_at": row.get_idx::<Option<String>>(7)?,
                "updated_at": row.get_idx::<Option<String>>(8)?,
            }))
        },
    );
    HttpResponse::Ok().json(ApiResponse::success(items))
}

#[derive(serde::Deserialize)]
pub struct KbArticleRequest {
    pub slug: String,
    pub title: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub audience: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
}

/// POST /api/platform/kb
pub async fn kb_store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<KbArticleRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let slug = body.slug.trim().to_lowercase().replace(' ', "-");
    let status = body.status.as_deref().unwrap_or("draft");
    let audience = body.audience.as_deref().unwrap_or("all");
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let published_at = if status == "published" {
        Some(now.as_str())
    } else {
        None
    };

    if conn
        .execute(
            "INSERT INTO platform_kb_articles
             (slug, title, body, audience, status, published_at, created_by_admin_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
            crate::params![
                &slug,
                body.title.trim(),
                body.body.trim(),
                audience,
                status,
                published_at,
                claims.sub,
                &now
            ],
        )
        .is_err()
    {
        return HttpResponse::BadRequest().json(ApiError::new("Failed to create article (slug may exist)"));
    }

    let id = conn.last_insert_rowid();
    audit_from_request(
        &conn, &req, claims.sub, &claims.email, "kb.create",
        Some("kb_article"), Some(id), Some(&body.title), None, serde_json::Value::Null,
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "id": id, "slug": slug })))
}

/// PATCH /api/platform/kb/{id}
pub async fn kb_update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<KbArticleRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let id = path.into_inner();
    let status = body.status.as_deref().unwrap_or("draft");
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let published_at = if status == "published" { Some(now.as_str()) } else { None };

    let n = conn
        .execute(
            "UPDATE platform_kb_articles
             SET slug = ?1, title = ?2, body = ?3, audience = ?4, status = ?5,
                 published_at = COALESCE(?6, published_at), updated_at = ?7
             WHERE id = ?8",
            crate::params![
                body.slug.trim().to_lowercase(),
                body.title.trim(),
                body.body.trim(),
                body.audience.as_deref().unwrap_or("all"),
                status,
                published_at,
                &now,
                id
            ],
        )
        .unwrap_or(0);
    if n == 0 {
        return HttpResponse::NotFound().json(ApiError::new("Article not found"));
    }
    audit_from_request(
        &conn, &req, claims.sub, &claims.email, "kb.update",
        Some("kb_article"), Some(id), Some(&body.title), None, serde_json::Value::Null,
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "id": id })))
}

/// DELETE /api/platform/kb/{id}
pub async fn kb_destroy(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let id = path.into_inner();
    if conn.execute("DELETE FROM platform_kb_articles WHERE id = ?1", [id]).unwrap_or(0) == 0 {
        return HttpResponse::NotFound().json(ApiError::new("Article not found"));
    }
    audit_from_request(
        &conn, &req, claims.sub, &claims.email, "kb.delete",
        Some("kb_article"), Some(id), None, None, serde_json::Value::Null,
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "deleted": true })))
}

// ── Support tickets ─────────────────────────────────────────────────────────

/// GET /api/platform/support/tickets/stats — counts by status for inbox tabs
pub async fn tickets_stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let rows: Vec<(String, i64)> = conn.query_map(
        "SELECT status, COUNT(*) FROM platform_support_tickets GROUP BY status",
        [],
        |row| Ok((row.get_idx::<String>(0)?, row.get_idx::<i64>(1)?)),
    );

    let mut counts = serde_json::json!({
        "open": 0,
        "in_progress": 0,
        "resolved": 0,
        "closed": 0,
        "total": 0,
    });
    let mut total = 0i64;
    for (status, n) in rows {
        total += n;
        if let Some(v) = counts.get_mut(&status) {
            *v = serde_json::json!(n);
        }
    }
    if let Some(v) = counts.get_mut("total") {
        *v = serde_json::json!(total);
    }

    HttpResponse::Ok().json(ApiResponse::success(counts))
}

/// GET /api/platform/support/tickets?status=&priority=&q=
pub async fn tickets_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let parsed: Vec<(String, String)> =
        serde_urlencoded::from_str(req.query_string()).unwrap_or_default();
    let mut status_filter: Option<String> = None;
    let mut priority_filter: Option<String> = None;
    let mut search: Option<String> = None;
    for (k, v) in parsed {
        if v.is_empty() {
            continue;
        }
        match k.as_str() {
            "status" => status_filter = Some(v),
            "priority" => priority_filter = Some(v),
            "q" => search = Some(v),
            _ => {}
        }
    }

    let mut sql = String::from(
        "SELECT t.id, t.organization_id, o.name AS org_name, t.user_name, t.user_email,
                t.subject, t.body, t.status, t.priority, t.replies_json, t.created_at, t.updated_at
         FROM platform_support_tickets t
         JOIN organizations o ON o.id = t.organization_id
         WHERE 1 = 1",
    );
    let mut params: Vec<crate::db::ParamValue> = Vec::new();
    if let Some(st) = status_filter.as_ref() {
        sql.push_str(" AND t.status = ?");
        params.push(crate::db::into_param_value(st.clone()));
    }
    if let Some(pr) = priority_filter.as_ref() {
        sql.push_str(" AND t.priority = ?");
        params.push(crate::db::into_param_value(pr.clone()));
    }
    if let Some(q) = search.as_ref() {
        let like = format!("%{}%", q.trim());
        sql.push_str(
            " AND (t.subject LIKE ? OR t.body LIKE ? OR t.user_email LIKE ? OR t.user_name LIKE ? OR o.name LIKE ?)",
        );
        for _ in 0..5 {
            params.push(crate::db::into_param_value(like.clone()));
        }
    }
    sql.push_str(" ORDER BY t.updated_at DESC, t.id DESC LIMIT 200");

    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let items: Vec<serde_json::Value> = stmt.query_map(params.as_slice(), |row| {
        Ok(serde_json::json!({
            "id": row.get_idx::<i64>(0)?,
            "organization_id": row.get_idx::<i64>(1)?,
            "organization_name": row.get_idx::<String>(2)?,
            "user_name": row.get_idx::<Option<String>>(3)?,
            "user_email": row.get_idx::<Option<String>>(4)?,
            "subject": row.get_idx::<String>(5)?,
            "body": row.get_idx::<String>(6)?,
            "status": row.get_idx::<String>(7)?,
            "priority": row.get_idx::<String>(8)?,
            "replies_json": row.get_idx::<Option<String>>(9)?,
            "created_at": row.get_idx::<Option<String>>(10)?,
            "updated_at": row.get_idx::<Option<String>>(11)?,
        }))
    });

    HttpResponse::Ok().json(ApiResponse::success(items))
}

#[derive(serde::Deserialize)]
pub struct TicketUpdateRequest {
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub priority: Option<String>,
    #[serde(default)]
    pub reply: Option<String>,
}

/// PATCH /api/platform/support/tickets/{id}
pub async fn tickets_update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<TicketUpdateRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "support") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let ticket_id = path.into_inner();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let (org_id, subject, replies_json): (i64, String, String) = match conn.query_row(
        "SELECT organization_id, subject, replies_json FROM platform_support_tickets WHERE id = ?1",
        [ticket_id],
        |row| Ok((row.get_idx::<i64>(0)?, row.get_idx::<String>(1)?, row.get_idx::<String>(2)?)),
    ) {
        Ok(v) => v,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Ticket not found")),
    };

    let mut replies: Vec<serde_json::Value> =
        serde_json::from_str(&replies_json).unwrap_or_default();
    if let Some(reply) = body.reply.as_ref().filter(|r| !r.trim().is_empty()) {
        replies.push(serde_json::json!({
            "from": "platform",
            "email": claims.email,
            "body": reply.trim(),
            "at": now,
        }));
    }
    let replies_str = serde_json::to_string(&replies).unwrap_or_else(|_| "[]".to_string());

    let current_status: String = conn
        .query_row(
            "SELECT status FROM platform_support_tickets WHERE id = ?1",
            [ticket_id],
            |row| row.get_idx::<String>(0),
        )
        .unwrap_or_else(|_| "open".to_string());

    let mut status = body
        .status
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| current_status.clone());

    if body.reply.as_ref().is_some_and(|r| !r.trim().is_empty())
        && status == current_status
        && current_status == "open"
    {
        status = "in_progress".to_string();
    }

    let priority = body.priority.as_deref().filter(|p| !p.is_empty());

    let updated = if let Some(pr) = priority {
        conn.execute(
            "UPDATE platform_support_tickets SET status = ?1, priority = ?2, replies_json = ?3, updated_at = ?4 WHERE id = ?5",
            crate::params![&status, pr, &replies_str, &now, ticket_id],
        )
    } else {
        conn.execute(
            "UPDATE platform_support_tickets SET status = ?1, replies_json = ?2, updated_at = ?3 WHERE id = ?4",
            crate::params![&status, &replies_str, &now, ticket_id],
        )
    };

    if updated.is_err()
    {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to update ticket"));
    }

    audit_from_request(
        &conn, &req, claims.sub, &claims.email, "support.ticket_update",
        Some("support_ticket"), Some(ticket_id), Some(&subject), Some(org_id),
        serde_json::json!({ "status": status }),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "id": ticket_id,
        "status": status,
    })))
}
