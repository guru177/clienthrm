use actix_multipart::Multipart;
use actix_web::{web, HttpRequest, HttpResponse};
use futures_util::StreamExt;

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::{org_id_from_claims, user_is_super_admin};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct CreateOrgNotificationRequest {
    pub title: String,
    pub body: String,
    pub severity: Option<String>,
    pub audience: String,
    pub target_id: Option<i64>,
    pub image_url: Option<String>,
}

fn normalize_optional_image_url(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .and_then(|s| {
            if s.starts_with("http://") || s.starts_with("https://") || s.contains("..") {
                return None;
            }
            crate::storage::normalize_relative_path(&s).filter(|p| {
                p.starts_with("org-notifications/") || p.starts_with("announcements/")
            })
        })
}

fn audience_sql(user_id: i64) -> String {
    format!(
        "(n.audience = 'all'
          OR (n.audience = 'department' AND n.target_id = (SELECT department_id FROM users WHERE id = {user_id} AND deleted_at IS NULL))
          OR (n.audience = 'designation' AND n.target_id = (SELECT designation_id FROM users WHERE id = {user_id} AND deleted_at IS NULL)))"
    )
}

fn row_to_json(row: &crate::db::Row) -> crate::db::Result<serde_json::Value> {
    Ok(serde_json::json!({
        "id": row.get::<i64>("id")?,
        "title": row.get::<String>("title")?,
        "body": row.get::<String>("body")?,
        "severity": row.get::<Option<String>>("severity")?.unwrap_or_else(|| "info".to_string()),
        "audience": row.get::<String>("audience")?,
        "target_id": row.get::<Option<i64>>("target_id")?,
        "target_name": row.get::<Option<String>>("target_name")?,
        "image_url": row.get::<Option<String>>("image_url")?,
        "created_by": row.get::<Option<i64>>("created_by")?,
        "created_by_name": row.get::<Option<String>>("created_by_name")?,
        "created_at": row.get::<Option<String>>("created_at")?,
        "read_at": row.get::<Option<String>>("read_at")?,
        "is_read": row.get::<Option<String>>("read_at")?.is_some(),
    }))
}

fn can_send(conn: &crate::db::Connection, user_id: i64, org_id: i64) -> bool {
    user_is_super_admin(conn, user_id, org_id)
        || crate::middleware::rbac::has_permission(
            &crate::middleware::rbac::load_user_permissions(conn, user_id, false),
            "manage-org-notifications",
        )
}

fn validate_audience(
    conn: &crate::db::Connection,
    org_id: i64,
    audience: &str,
    target_id: Option<i64>,
) -> Result<(), HttpResponse> {
    match audience {
        "all" => Ok(()),
        "department" => {
            let Some(id) = target_id else {
                return Err(HttpResponse::BadRequest().json(ApiError::new(
                    "Department is required for department audience",
                )));
            };
            let ok = conn
                .query_row(
                    "SELECT 1 FROM departments WHERE id = ?1 AND organization_id = ?2",
                    crate::params![id, org_id],
                    |_| Ok(()),
                )
                .is_ok();
            if ok {
                Ok(())
            } else {
                Err(HttpResponse::BadRequest().json(ApiError::new("Department not found")))
            }
        }
        "designation" => {
            let Some(id) = target_id else {
                return Err(HttpResponse::BadRequest().json(ApiError::new(
                    "Designation is required for designation audience",
                )));
            };
            let ok = conn
                .query_row(
                    "SELECT 1 FROM designations WHERE id = ?1 AND organization_id = ?2",
                    crate::params![id, org_id],
                    |_| Ok(()),
                )
                .is_ok();
            if ok {
                Ok(())
            } else {
                Err(HttpResponse::BadRequest().json(ApiError::new("Designation not found")))
            }
        }
        _ => Err(HttpResponse::BadRequest().json(ApiError::new(
            "Audience must be all, department, or designation",
        ))),
    }
}

/// GET /api/admin/org-notifications — inbox for current user
pub async fn inbox(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let aud = audience_sql(claims.sub);
    let sql = format!(
        "SELECT n.id, n.title, n.body, n.severity, n.audience, n.target_id, n.image_url,
                COALESCE(d.name, dg.name) AS target_name,
                n.created_by, u.name AS created_by_name, n.created_at,
                r.read_at
         FROM org_notifications n
         LEFT JOIN org_notification_reads r ON r.notification_id = n.id AND r.user_id = ?1
         LEFT JOIN users u ON u.id = n.created_by
         LEFT JOIN departments d ON n.audience = 'department' AND d.id = n.target_id
         LEFT JOIN designations dg ON n.audience = 'designation' AND dg.id = n.target_id
         WHERE n.organization_id = ?2
           AND {aud}
           AND (r.dismissed_at IS NULL)
         ORDER BY n.created_at DESC
         LIMIT 50"
    );

    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => {
            return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}")))
        }
    };
    let items: Vec<serde_json::Value> = stmt.query_map(crate::params![claims.sub, org_id], row_to_json);

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// GET /api/admin/org-notifications/unread-count
pub async fn unread_count(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let aud = audience_sql(claims.sub);
    let sql = format!(
        "SELECT COUNT(*) FROM org_notifications n
         LEFT JOIN org_notification_reads r ON r.notification_id = n.id AND r.user_id = ?1
         WHERE n.organization_id = ?2
           AND {aud}
           AND (r.read_at IS NULL)
           AND (r.dismissed_at IS NULL)"
    );

    let count: i64 = conn
        .query_row(&sql, crate::params![claims.sub, org_id], |r| r.get_idx(0))
        .unwrap_or(0);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "count": count })))
}

/// GET /api/admin/org-notifications/sent — admin view of sent notifications
pub async fn sent_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    if !can_send(&conn, claims.sub, org_id) {
        return HttpResponse::Forbidden().json(ApiError::new("Not allowed to view sent notifications"));
    }

    let stmt = match conn.prepare(
        "SELECT n.id, n.title, n.body, n.severity, n.audience, n.target_id, n.image_url,
                COALESCE(d.name, dg.name) AS target_name,
                n.created_by, u.name AS created_by_name, n.created_at,
                NULL AS read_at
         FROM org_notifications n
         LEFT JOIN users u ON u.id = n.created_by
         LEFT JOIN departments d ON n.audience = 'department' AND d.id = n.target_id
         LEFT JOIN designations dg ON n.audience = 'designation' AND dg.id = n.target_id
         WHERE n.organization_id = ?1
         ORDER BY n.created_at DESC
         LIMIT 100",
    ) {
        Ok(s) => s,
        Err(e) => {
            return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}")))
        }
    };

    let items: Vec<serde_json::Value> = stmt.query_map([org_id], row_to_json);

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/admin/org-notifications/upload-banner — multipart image upload
pub async fn upload_banner(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    mut payload: Multipart,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    if !can_send(&conn, claims.sub, org_id) {
        return HttpResponse::Forbidden().json(ApiError::new("Not allowed to upload banners"));
    }

    let mut file_data: Option<(Vec<u8>, Option<String>, Option<String>)> = None;
    while let Some(item) = payload.next().await {
        let mut field = match item {
            Ok(f) => f,
            Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&format!("Upload error: {e}"))),
        };
        let field_name = field.name().unwrap_or("").to_string();
        let filename = field
            .content_disposition()
            .and_then(|d| d.get_filename().map(|s| s.to_string()));
        let mime = field.content_type().map(|m| m.to_string());
        let mut bytes = Vec::new();
        while let Some(chunk) = field.next().await {
            match chunk {
                Ok(c) => bytes.extend_from_slice(&c),
                Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&format!("Upload error: {e}"))),
            }
        }
        if bytes.is_empty() {
            continue;
        }
        let candidate = (bytes, mime, filename);
        if field_name == "banner" || field_name == "file" {
            file_data = Some(candidate);
            break;
        }
        if file_data.is_none() {
            file_data = Some(candidate);
        }
    }

    let Some((data, mime, filename)) = file_data else {
        return HttpResponse::BadRequest().json(ApiError::new("No image uploaded"));
    };

    let relative = match crate::storage::save_org_notification_banner(&data, mime.as_deref(), filename.as_deref()) {
        Ok(p) => p,
        Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&e)),
    };

    HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
        "path": relative,
        "file_url": relative,
    })))
}

/// POST /api/admin/org-notifications — company admin sends notification
pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<CreateOrgNotificationRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    if !can_send(&conn, claims.sub, org_id) {
        return HttpResponse::Forbidden().json(ApiError::new("Not allowed to send notifications"));
    }

    let title = body.title.trim();
    let message = body.body.trim();
    if title.is_empty() || message.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Title and message are required"));
    }

    let audience = body.audience.trim().to_lowercase();
    if let Err(resp) = validate_audience(&conn, org_id, &audience, body.target_id) {
        return resp;
    }

    let severity = body
        .severity
        .as_deref()
        .unwrap_or("info")
        .trim()
        .to_lowercase();
    let allowed = ["info", "warning", "success", "critical"];
    if !allowed.contains(&severity.as_str()) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid severity"));
    }

    let image_url = normalize_optional_image_url(&body.image_url);
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let target_id = if audience == "all" {
        None
    } else {
        body.target_id
    };

    if conn
        .execute(
            "INSERT INTO org_notifications (organization_id, title, body, severity, audience, target_id, image_url, created_by, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            crate::params![org_id, title, message, severity, audience, target_id, image_url, claims.sub, &now],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to create notification"));
    }

    let id = conn.last_insert_rowid();
    HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
        "id": id,
        "message": "Notification sent",
    })))
}

/// POST /api/admin/org-notifications/{id}/read
pub async fn mark_read(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let notification_id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    if !notification_applies_to_user(&conn, org_id, notification_id, claims.sub) {
        return HttpResponse::NotFound().json(ApiError::new("Notification not found"));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "INSERT INTO org_notification_reads (notification_id, user_id, read_at, dismissed_at)
         VALUES (?1, ?2, ?3, NULL)
         ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = excluded.read_at
         WHERE org_notification_reads.read_at IS NULL",
        crate::params![notification_id, claims.sub, &now],
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "ok": true })))
}

/// POST /api/admin/org-notifications/{id}/dismiss
pub async fn dismiss(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let notification_id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    if !notification_applies_to_user(&conn, org_id, notification_id, claims.sub) {
        return HttpResponse::NotFound().json(ApiError::new("Notification not found"));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "INSERT INTO org_notification_reads (notification_id, user_id, read_at, dismissed_at)
         VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = COALESCE(org_notification_reads.read_at, excluded.read_at), dismissed_at = excluded.dismissed_at",
        crate::params![notification_id, claims.sub, &now],
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "ok": true })))
}

fn notification_applies_to_user(
    conn: &crate::db::Connection,
    org_id: i64,
    notification_id: i64,
    user_id: i64,
) -> bool {
    let aud = audience_sql(user_id);
    let sql = format!(
        "SELECT 1 FROM org_notifications n
         WHERE n.id = ?1 AND n.organization_id = ?2 AND {aud}"
    );
    conn.query_row(&sql, crate::params![notification_id, org_id], |_| Ok(()))
        .is_ok()
}
