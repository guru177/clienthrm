use actix_multipart::Multipart;
use actix_web::{web, HttpRequest, HttpResponse};
use futures_util::StreamExt;

use crate::db::DbPool;
use crate::handlers::platform_audit::audit_from_request;
use crate::middleware::platform_auth::{get_platform_claims_from_request, require_role};
use crate::models::platform::{
    PlatformAnnouncementRequest, PlatformOrgNoteRequest, PlatformReleaseRequest,
    TenantFeatureOverrideRequest,
};
use crate::models::{ApiError, ApiResponse};

const VALID_SEVERITY: [&str; 4] = ["info", "warning", "critical", "success"];
const VALID_AUDIENCE: [&str; 3] = ["all", "admins", "employees"];
const VALID_RELEASE_STATUS: [&str; 2] = ["draft", "published"];

fn normalize_optional_datetime(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn normalize_optional_url(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .and_then(|s| {
            if s.starts_with("http://") || s.starts_with("https://") || s.contains("..") {
                return None;
            }
            crate::storage::normalize_relative_path(&s).filter(|p| p.starts_with("announcements/"))
        })
}

fn parse_stored_utc(value: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let normalized = if trimmed.contains('T') {
        trimmed.to_string()
    } else {
        format!("{}Z", trimmed.replace(' ', "T"))
    };
    chrono::DateTime::parse_from_rfc3339(&normalized)
        .ok()
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .or_else(|| {
            chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S")
                .ok()
                .map(|naive| naive.and_utc())
        })
}

fn announcement_is_live_now(starts_at: &Option<String>, ends_at: &Option<String>) -> bool {
    let now = chrono::Utc::now();
    if let Some(start) = starts_at.as_ref().and_then(|s| parse_stored_utc(s)) {
        if start > now {
            return false;
        }
    }
    if let Some(end) = ends_at.as_ref().and_then(|s| parse_stored_utc(s)) {
        if end < now {
            return false;
        }
    }
    true
}

// ─────────── Org notes ───────────

/// GET /api/platform/organizations/{id}/notes
pub async fn org_notes_index(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let stmt = match conn.prepare(
        "SELECT id, organization_id, author_admin_id, author_email, body, pinned, created_at, updated_at
         FROM platform_org_notes WHERE organization_id = ?1
         ORDER BY pinned DESC, id DESC",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let items: Vec<serde_json::Value> = stmt.query_map(crate::params![org_id], |row| {
        Ok(serde_json::json!({
            "id": row.get_idx::<i64>(0)?,
            "organization_id": row.get_idx::<i64>(1)?,
            "author_admin_id": row.get_idx::<Option<i64>>(2)?,
            "author_email": row.get_idx::<Option<String>>(3)?,
            "body": row.get_idx::<String>(4)?,
            "pinned": row.get_idx::<i64>(5)? != 0,
            "created_at": row.get_idx::<Option<String>>(6)?,
            "updated_at": row.get_idx::<Option<String>>(7)?,
        }))
    });
    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/platform/organizations/{id}/notes
pub async fn org_notes_store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<PlatformOrgNoteRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "support") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let org_id = path.into_inner();
    let body_text = body.body.trim().to_string();
    if body_text.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Note body required"));
    }
    let pinned = body.pinned.unwrap_or(false);

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    if conn
        .query_row(
            "SELECT 1 FROM organizations WHERE id = ?1",
            crate::params![org_id],
            |_| Ok(()),
        )
        .is_err()
    {
        return HttpResponse::NotFound().json(ApiError::new("Organization not found"));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "INSERT INTO platform_org_notes (organization_id, author_admin_id, author_email, body, pinned, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        crate::params![org_id, claims.sub, &claims.email, &body_text, if pinned { 1i64 } else { 0i64 }, &now],
    );
    let new_id = conn.last_insert_rowid();

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_org_note.create",
        Some("platform_org_note"),
        Some(new_id),
        Some(&body_text[..body_text.len().min(80)]),
        Some(org_id),
        serde_json::json!({"pinned": pinned}),
    );

    HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
        "id": new_id,
        "organization_id": org_id,
        "body": body_text,
        "pinned": pinned,
        "author_email": claims.email,
        "created_at": now,
    })))
}

/// DELETE /api/platform/organizations/{org_id}/notes/{note_id}
pub async fn org_notes_destroy(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<(i64, i64)>,
) -> HttpResponse {
    let claims = match require_role(&req, "support") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let (org_id, note_id) = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let ok = conn
        .execute(
            "DELETE FROM platform_org_notes WHERE id = ?1 AND organization_id = ?2",
            crate::params![note_id, org_id],
        )
        .unwrap_or(0)
        > 0;

    if ok {
        audit_from_request(
            &conn,
            &req,
            claims.sub,
            &claims.email,
            "platform_org_note.delete",
            Some("platform_org_note"),
            Some(note_id),
            None,
            Some(org_id),
            serde_json::json!({}),
        );
        HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"deleted": true})))
    } else {
        HttpResponse::NotFound().json(ApiError::new("Note not found"))
    }
}

// ─────────── Announcements ───────────

fn announcement_to_value(row: &crate::db::Row) -> crate::db::Result<serde_json::Value> {
    Ok(serde_json::json!({
        "id": row.get::<i64>("id")?,
        "organization_id": row.get::<Option<i64>>("organization_id")?,
        "title": row.get::<String>("title")?,
        "body": row.get::<String>("body")?,
        "severity": row.get::<String>("severity")?,
        "audience": row.get::<String>("audience")?,
        "published": row.get::<i64>("published")? != 0,
        "starts_at": row.get::<Option<String>>("starts_at")?,
        "ends_at": row.get::<Option<String>>("ends_at")?,
        "image_url": row.get::<Option<String>>("image_url").unwrap_or(None),
        "created_at": row.get::<Option<String>>("created_at")?,
    }))
}

/// GET /api/platform/announcements
pub async fn announcements_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let stmt = match conn.prepare(
        "SELECT id, organization_id, title, body, severity, audience, published, starts_at, ends_at, image_url, created_at
         FROM platform_announcements ORDER BY id DESC LIMIT 200",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let items: Vec<serde_json::Value> = stmt.query_map([], announcement_to_value);
    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/platform/announcements
pub async fn announcements_store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<PlatformAnnouncementRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let title = body.title.trim().to_string();
    if title.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Title is required"));
    }
    let body_text = body.body.clone().unwrap_or_default();
    let severity = body
        .severity
        .clone()
        .unwrap_or_else(|| "info".to_string());
    if !VALID_SEVERITY.contains(&severity.as_str()) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid severity"));
    }
    let audience = body
        .audience
        .clone()
        .unwrap_or_else(|| "all".to_string());
    if !VALID_AUDIENCE.contains(&audience.as_str()) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid audience"));
    }
    let published = body.published.unwrap_or(true);

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let starts_at = normalize_optional_datetime(&body.starts_at);
    let ends_at = normalize_optional_datetime(&body.ends_at);
    let image_url = normalize_optional_url(&body.image_url);
    let _ = conn.execute(
        "INSERT INTO platform_announcements
         (organization_id, title, body, severity, audience, published, starts_at, ends_at, image_url, created_by_admin_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
        crate::params![
            body.organization_id,
            &title,
            &body_text,
            &severity,
            &audience,
            if published { 1i64 } else { 0i64 },
            starts_at,
            ends_at,
            image_url,
            claims.sub,
            &now,
        ],
    );
    let new_id = conn.last_insert_rowid();

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_announcement.create",
        Some("platform_announcement"),
        Some(new_id),
        Some(&title),
        body.organization_id,
        serde_json::json!({"severity": severity, "audience": audience}),
    );

    HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
        "id": new_id,
        "title": title,
        "published": published,
    })))
}

/// PATCH /api/platform/announcements/{id}
pub async fn announcements_update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<PlatformAnnouncementRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let id = path.into_inner();
    let title = body.title.trim().to_string();
    if title.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Title is required"));
    }
    let body_text = body.body.clone().unwrap_or_default();
    let severity = body
        .severity
        .clone()
        .unwrap_or_else(|| "info".to_string());
    if !VALID_SEVERITY.contains(&severity.as_str()) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid severity"));
    }
    let audience = body
        .audience
        .clone()
        .unwrap_or_else(|| "all".to_string());
    if !VALID_AUDIENCE.contains(&audience.as_str()) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid audience"));
    }
    let published = body.published.unwrap_or(true);

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let starts_at = normalize_optional_datetime(&body.starts_at);
    let ends_at = normalize_optional_datetime(&body.ends_at);
    let image_url = normalize_optional_url(&body.image_url);
    let updated = conn
        .execute(
            "UPDATE platform_announcements
             SET organization_id = ?1, title = ?2, body = ?3, severity = ?4, audience = ?5,
                 published = ?6, starts_at = ?7, ends_at = ?8, image_url = ?9, updated_at = ?10
             WHERE id = ?11",
            crate::params![
                body.organization_id,
                &title,
                &body_text,
                &severity,
                &audience,
                if published { 1i64 } else { 0i64 },
                starts_at,
                ends_at,
                image_url,
                &now,
                id,
            ],
        )
        .unwrap_or(0)
        > 0;

    if !updated {
        return HttpResponse::NotFound().json(ApiError::new("Announcement not found"));
    }

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_announcement.update",
        Some("platform_announcement"),
        Some(id),
        Some(&title),
        body.organization_id,
        serde_json::json!({"severity": severity, "published": published}),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"updated": true})))
}

/// DELETE /api/platform/announcements/{id}
pub async fn announcements_destroy(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let ok = conn
        .execute("DELETE FROM platform_announcements WHERE id = ?1", crate::params![id])
        .unwrap_or(0)
        > 0;
    if !ok {
        return HttpResponse::NotFound().json(ApiError::new("Announcement not found"));
    }
    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_announcement.delete",
        Some("platform_announcement"),
        Some(id),
        None,
        None,
        serde_json::json!({}),
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"deleted": true})))
}

/// POST /api/platform/announcements/upload-banner — multipart image upload
pub async fn announcements_upload_banner(
    req: HttpRequest,
    mut payload: Multipart,
) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

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

    let relative = match crate::storage::save_announcement_banner(&data, mime.as_deref(), filename.as_deref()) {
        Ok(p) => p,
        Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&e)),
    };

    HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
        "path": relative,
        "file_url": relative,
    })))
}

// ─────────── Public announcements (tenant) ───────────

/// GET /api/admin/announcements — currently active announcements for this tenant
pub async fn tenant_announcements_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match crate::middleware::auth::get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let stmt = match conn.prepare(
        "SELECT id, organization_id, title, body, severity, audience, published, starts_at, ends_at, image_url, created_at
         FROM platform_announcements
         WHERE published = 1
           AND (organization_id IS NULL OR organization_id = ?1)
         ORDER BY id DESC LIMIT 50",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let is_admin =
        crate::tenant::user_is_super_admin(&conn, claims.sub, claims.organization_id);
    let items: Vec<serde_json::Value> = stmt
        .query_map(crate::params![claims.organization_id], announcement_to_value)
        .into_iter()
        .filter(|v| {
            let starts = v
                .get("starts_at")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string());
            let ends = v
                .get("ends_at")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string());
            if !announcement_is_live_now(&starts, &ends) {
                return false;
            }
            let aud = v.get("audience").and_then(|a| a.as_str()).unwrap_or("all");
            match aud {
                "admins" => is_admin,
                "employees" => !is_admin,
                _ => true,
            }
        })
        .take(20)
        .collect();

    HttpResponse::Ok().json(ApiResponse::success(items))
}

// ─────────── Releases ───────────

fn release_to_value(row: &crate::db::Row) -> crate::db::Result<serde_json::Value> {
    Ok(serde_json::json!({
        "id": row.get::<i64>("id")?,
        "version": row.get::<String>("version")?,
        "title": row.get::<String>("title")?,
        "body": row.get::<String>("body")?,
        "audience": row.get::<String>("audience")?,
        "severity": row.get::<String>("severity")?,
        "status": row.get::<String>("status")?,
        "desktop_installer": row.get::<Option<String>>("desktop_installer").unwrap_or(None),
        "published_at": row.get::<Option<String>>("published_at")?,
        "created_at": row.get::<Option<String>>("created_at")?,
        "updated_at": row.get::<Option<String>>("updated_at")?,
    }))
}

/// GET /api/platform/releases
pub async fn releases_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let stmt = match conn.prepare(
        "SELECT id, version, title, body, audience, severity, status, desktop_installer, published_at, created_at, updated_at
         FROM platform_releases ORDER BY id DESC LIMIT 200",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let items: Vec<serde_json::Value> = stmt.query_map([], release_to_value);
    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/platform/releases
pub async fn releases_store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<PlatformReleaseRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let version = body.version.trim().to_string();
    let title = body.title.trim().to_string();
    if version.is_empty() || title.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Version and title required"));
    }
    let body_text = body.body.clone().unwrap_or_default();
    let audience = body.audience.clone().unwrap_or_else(|| "all".to_string());
    if !VALID_AUDIENCE.contains(&audience.as_str()) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid audience"));
    }
    let severity = body.severity.clone().unwrap_or_else(|| "info".to_string());
    if !VALID_SEVERITY.contains(&severity.as_str()) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid severity"));
    }
    let status = body
        .status
        .clone()
        .unwrap_or_else(|| "draft".to_string());
    if !VALID_RELEASE_STATUS.contains(&status.as_str()) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid status"));
    }
    let published_at = if status == "published" {
        Some(chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string())
    } else {
        None
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "INSERT INTO platform_releases
         (version, title, body, audience, severity, status, published_at, created_by_admin_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        crate::params![
            &version,
            &title,
            &body_text,
            &audience,
            &severity,
            &status,
            published_at.clone(),
            claims.sub,
            &now,
        ],
    );
    let new_id = conn.last_insert_rowid();
    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_release.create",
        Some("platform_release"),
        Some(new_id),
        Some(&format!("{version} — {title}")),
        None,
        serde_json::json!({"status": status}),
    );
    HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
        "id": new_id, "status": status,
    })))
}

/// PATCH /api/platform/releases/{id}
pub async fn releases_update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<PlatformReleaseRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let id = path.into_inner();
    let version = body.version.trim().to_string();
    let title = body.title.trim().to_string();
    if version.is_empty() || title.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Version and title required"));
    }
    let body_text = body.body.clone().unwrap_or_default();
    let audience = body.audience.clone().unwrap_or_else(|| "all".to_string());
    let severity = body.severity.clone().unwrap_or_else(|| "info".to_string());
    let status = body.status.clone().unwrap_or_else(|| "draft".to_string());
    if !VALID_AUDIENCE.contains(&audience.as_str())
        || !VALID_SEVERITY.contains(&severity.as_str())
        || !VALID_RELEASE_STATUS.contains(&status.as_str())
    {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid audience/severity/status"));
    }

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let current_status: String = conn
        .query_row(
            "SELECT status FROM platform_releases WHERE id = ?1",
            crate::params![id],
            |r| r.get_idx::<String>(0),
        )
        .unwrap_or_default();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let published_at: Option<String> = if status == "published" && current_status != "published" {
        Some(now.clone())
    } else if status == "draft" {
        None
    } else {
        conn.query_row(
            "SELECT published_at FROM platform_releases WHERE id = ?1",
            crate::params![id],
            |r| r.get_idx::<Option<String>>(0),
        )
        .unwrap_or(None)
    };

    let updated = conn
        .execute(
            "UPDATE platform_releases
             SET version = ?1, title = ?2, body = ?3, audience = ?4, severity = ?5, status = ?6,
                 published_at = ?7, updated_at = ?8
             WHERE id = ?9",
            crate::params![
                &version,
                &title,
                &body_text,
                &audience,
                &severity,
                &status,
                published_at.clone(),
                &now,
                id,
            ],
        )
        .unwrap_or(0)
        > 0;
    if !updated {
        return HttpResponse::NotFound().json(ApiError::new("Release not found"));
    }
    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_release.update",
        Some("platform_release"),
        Some(id),
        Some(&format!("{version} — {title}")),
        None,
        serde_json::json!({"status": status}),
    );
    if status == "published" {
        if let Err(e) = crate::handlers::desktop_updates::sync_desktop_feed_for_release(
            &conn, id, &version, &status,
        ) {
            log::warn!("Desktop update feed sync failed for release {id}: {e}");
        }
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"updated": true})))
}

/// DELETE /api/platform/releases/{id}
pub async fn releases_destroy(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let ok = conn
        .execute("DELETE FROM platform_releases WHERE id = ?1", crate::params![id])
        .unwrap_or(0)
        > 0;
    if !ok {
        return HttpResponse::NotFound().json(ApiError::new("Release not found"));
    }
    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_release.delete",
        Some("platform_release"),
        Some(id),
        None,
        None,
        serde_json::json!({}),
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"deleted": true})))
}

/// GET /api/admin/releases — published releases visible to current user
pub async fn tenant_releases_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match crate::middleware::auth::get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let stmt = match conn.prepare(
        "SELECT id, version, title, body, audience, severity, status, desktop_installer, published_at, created_at, updated_at
         FROM platform_releases WHERE status = 'published'
         ORDER BY published_at DESC, id DESC LIMIT 50",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let is_admin =
        crate::tenant::user_is_super_admin(&conn, claims.sub, claims.organization_id);
    let items: Vec<serde_json::Value> = stmt
        .query_map([], release_to_value)
        .into_iter()
        .filter(|v| {
            let aud = v.get("audience").and_then(|a| a.as_str()).unwrap_or("all");
            match aud {
                "admins" => is_admin,
                "employees" => !is_admin,
                _ => true,
            }
        })
        .collect();
    HttpResponse::Ok().json(ApiResponse::success(items))
}

// ─────────── Feature overrides ───────────

/// GET /api/platform/organizations/{id}/feature-overrides
pub async fn feature_overrides_index(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let _claims = match require_role(&req, "support") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let org_id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let stmt = match conn.prepare(
        "SELECT id, module_slug, enabled, reason, updated_at
         FROM tenant_feature_overrides WHERE organization_id = ?1 ORDER BY module_slug ASC",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let items: Vec<serde_json::Value> = stmt.query_map(crate::params![org_id], |row| {
        Ok(serde_json::json!({
            "id": row.get_idx::<i64>(0)?,
            "module_slug": row.get_idx::<String>(1)?,
            "enabled": row.get_idx::<i64>(2)? != 0,
            "reason": row.get_idx::<Option<String>>(3)?,
            "updated_at": row.get_idx::<Option<String>>(4)?,
        }))
    });
    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// PUT /api/platform/organizations/{id}/feature-overrides — upsert one
pub async fn feature_overrides_upsert(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<TenantFeatureOverrideRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let org_id = path.into_inner();
    let module = body.module_slug.trim().to_string();
    if module.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("module_slug required"));
    }

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    if conn
        .query_row(
            "SELECT 1 FROM organizations WHERE id = ?1",
            crate::params![org_id],
            |_| Ok(()),
        )
        .is_err()
    {
        return HttpResponse::NotFound().json(ApiError::new("Organization not found"));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let reason = body.reason.clone();
    let updated = conn
        .execute(
            "UPDATE tenant_feature_overrides SET enabled = ?1, reason = ?2, updated_at = ?3
             WHERE organization_id = ?4 AND module_slug = ?5",
            crate::params![
                if body.enabled { 1i64 } else { 0i64 },
                reason.clone(),
                &now,
                org_id,
                &module,
            ],
        )
        .unwrap_or(0)
        > 0;

    if !updated {
        let _ = conn.execute(
            "INSERT INTO tenant_feature_overrides
             (organization_id, module_slug, enabled, reason, created_by_admin_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            crate::params![
                org_id,
                &module,
                if body.enabled { 1i64 } else { 0i64 },
                reason,
                claims.sub,
                &now,
            ],
        );
    }

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "tenant_feature_override.upsert",
        Some("tenant_feature_override"),
        None,
        Some(&module),
        Some(org_id),
        serde_json::json!({"enabled": body.enabled}),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"saved": true})))
}

/// DELETE /api/platform/organizations/{org_id}/feature-overrides/{module}
pub async fn feature_overrides_delete(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<(i64, String)>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let (org_id, module) = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let ok = conn
        .execute(
            "DELETE FROM tenant_feature_overrides WHERE organization_id = ?1 AND module_slug = ?2",
            crate::params![org_id, &module],
        )
        .unwrap_or(0)
        > 0;
    if !ok {
        return HttpResponse::NotFound().json(ApiError::new("Override not found"));
    }
    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "tenant_feature_override.delete",
        Some("tenant_feature_override"),
        None,
        Some(&module),
        Some(org_id),
        serde_json::json!({}),
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"deleted": true})))
}
