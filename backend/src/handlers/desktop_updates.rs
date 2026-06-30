use actix_multipart::Multipart;
use actix_web::{web, HttpRequest, HttpResponse};
use futures_util::StreamExt;
use std::path::Path;

use crate::db::DbPool;
use crate::handlers::platform_audit::audit_from_request;
use crate::middleware::platform_auth::require_role;
use crate::models::{ApiError, ApiResponse};
use crate::storage::{mime_for_path, resolve_storage_file};

fn allowed_desktop_update_name(name: &str) -> bool {
    if name.is_empty() || name.contains("..") || name.contains('/') || name.contains('\\') {
        return false;
    }
    let lower = name.to_ascii_lowercase();
    lower == "latest.yml"
        || lower == "latest-mac.yml"
        || lower == "latest-linux.yml"
        || lower.ends_with(".exe")
        || lower.ends_with(".blockmap")
        || lower.ends_with(".dmg")
        || lower.ends_with(".zip")
        || lower.ends_with(".appimage")
}

/// GET /api/public/desktop/updates/{tail:.*} — electron-updater generic feed (no auth).
pub async fn serve(path: web::Path<String>) -> HttpResponse {
    let tail = path.into_inner();
    if !allowed_desktop_update_name(&tail) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid update artifact name"));
    }

    let relative = format!("desktop-updates/{tail}");
    let file_path = match resolve_storage_file(&relative) {
        Ok(p) => p,
        Err(e) => return HttpResponse::NotFound().json(ApiError::new(&e)),
    };

    if !file_path.is_file() {
        return HttpResponse::NotFound().json(ApiError::new("Update file not found"));
    }

    let bytes = match std::fs::read(&file_path) {
        Ok(b) => b,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Update file not readable")),
    };

    let mut response = HttpResponse::Ok();
    response.content_type(mime_for_path(Path::new(&tail)));
    if tail.ends_with(".yml") || tail.ends_with(".yaml") {
        response.insert_header(("Cache-Control", "no-cache"));
    }
    response.body(bytes)
}

/// POST /api/platform/releases/{id}/desktop-installer — upload .exe and publish update feed.
pub async fn platform_upload_installer(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    mut payload: Multipart,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let release_id = path.into_inner();

    let mut file_data: Option<(Vec<u8>, Option<String>)> = None;
    let mut form_version: Option<String> = None;

    while let Some(item) = payload.next().await {
        let mut field = match item {
            Ok(f) => f,
            Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&format!("Upload error: {e}"))),
        };
        let field_name = field.name().unwrap_or("").to_string();
        let filename = field
            .content_disposition()
            .and_then(|d| d.get_filename().map(|s| s.to_string()));
        let mut bytes = Vec::new();
        while let Some(chunk) = field.next().await {
            match chunk {
                Ok(c) => bytes.extend_from_slice(&c),
                Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&format!("Upload error: {e}"))),
            }
        }
        if field_name == "version" {
            form_version = Some(String::from_utf8_lossy(&bytes).trim().to_string());
            continue;
        }
        if (field_name == "installer" || field_name == "file") && !bytes.is_empty() {
            file_data = Some((bytes, filename));
        }
    }

    let Some((data, filename)) = file_data else {
        return HttpResponse::BadRequest().json(ApiError::new("No installer uploaded (.exe required)"));
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let release_row: Option<(String, String)> = conn
        .query_row(
            "SELECT version, status FROM platform_releases WHERE id = ?1",
            crate::params![release_id],
            |r| Ok((r.get_idx::<String>(0)?, r.get_idx::<String>(1)?)),
        )
        .ok();

    let Some((db_version, status)) = release_row else {
        return HttpResponse::NotFound().json(ApiError::new("Release not found"));
    };

    let version = form_version
        .filter(|v| !v.is_empty())
        .unwrap_or(db_version);

    let installer_name = match crate::desktop_update_feed::save_desktop_installer(
        &version,
        &data,
        filename.as_deref(),
    ) {
        Ok(name) => name,
        Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&e)),
    };

    if status == "published" {
        if let Err(e) =
            crate::desktop_update_feed::refresh_latest_yml_from_installer(&version, &installer_name)
        {
            return HttpResponse::BadRequest().json(ApiError::new(&e));
        }
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "UPDATE platform_releases SET desktop_installer = ?1, updated_at = ?2 WHERE id = ?3",
        crate::params![&installer_name, &now, release_id],
    );

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_release.desktop_installer",
        Some("platform_release"),
        Some(release_id),
        Some(&installer_name),
        None,
        serde_json::json!({"version": version, "status": status}),
    );

    HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
        "installer": installer_name,
        "version": version,
        "feed_url": "/api/public/desktop/updates/latest.yml",
        "published_to_feed": status == "published",
    })))
}

/// Refresh latest.yml when a published release has an installer on disk.
pub fn sync_desktop_feed_for_release(
    conn: &crate::db::Connection,
    release_id: i64,
    version: &str,
    status: &str,
) -> Result<Option<String>, String> {
    if status != "published" {
        return Ok(None);
    }
    let installer: Option<String> = conn
        .query_row(
            "SELECT desktop_installer FROM platform_releases WHERE id = ?1",
            crate::params![release_id],
            |r| r.get_idx::<Option<String>>(0),
        )
        .unwrap_or(None);
    let Some(name) = installer.filter(|n| !n.is_empty()) else {
        return Ok(None);
    };
    crate::desktop_update_feed::refresh_latest_yml_from_installer(version, &name)?;
    Ok(Some(name))
}

/// GET /api/platform/desktop-update/status — live Electron feed + latest published release note.
pub async fn platform_feed_status(
    pool: web::Data<DbPool>,
    req: HttpRequest,
) -> HttpResponse {
    let _claims = match require_role(&req, "support") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let feed = crate::desktop_update_feed::read_live_desktop_feed();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let latest_release: Option<serde_json::Value> = conn
        .query_row(
            "SELECT id, version, title, desktop_installer, published_at
             FROM platform_releases
             WHERE status = 'published'
             ORDER BY published_at DESC, id DESC
             LIMIT 1",
            [],
            |row| {
                Ok(serde_json::json!({
                    "id": row.get_idx::<i64>(0)?,
                    "version": row.get_idx::<String>(1)?,
                    "title": row.get_idx::<String>(2)?,
                    "desktop_installer": row.get_idx::<Option<String>>(3).ok().flatten(),
                    "published_at": row.get_idx::<Option<String>>(4).ok().flatten(),
                }))
            },
        )
        .ok();
    let latest_desktop_release: Option<serde_json::Value> = conn
        .query_row(
            "SELECT id, version, title, desktop_installer, published_at
             FROM platform_releases
             WHERE status = 'published' AND desktop_installer IS NOT NULL AND desktop_installer != ''
             ORDER BY published_at DESC, id DESC
             LIMIT 1",
            [],
            |row| {
                Ok(serde_json::json!({
                    "id": row.get_idx::<i64>(0)?,
                    "version": row.get_idx::<String>(1)?,
                    "title": row.get_idx::<String>(2)?,
                    "desktop_installer": row.get_idx::<String>(3)?,
                    "published_at": row.get_idx::<Option<String>>(4).ok().flatten(),
                }))
            },
        )
        .ok();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "backend_version": env!("CARGO_PKG_VERSION"),
        "live_desktop_feed": feed,
        "feed_url": "/api/public/desktop/updates/latest.yml",
        "latest_published_release": latest_release,
        "latest_desktop_release": latest_desktop_release,
    })))
}
