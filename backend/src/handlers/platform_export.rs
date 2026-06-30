use actix_web::{web, HttpRequest, HttpResponse};

use crate::db::DbPool;
use crate::handlers::platform_audit::audit_from_request;
use crate::middleware::platform_auth::require_role;
use crate::models::{ApiError, ApiResponse};

/// GET /api/platform/organizations/{id}/export — JSON backup of tenant data
pub async fn organization_export(
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
    let org_id = path.into_inner();

    let org = conn.query_row(
        "SELECT id, name, slug, status, plan, plan_started_at, plan_expires_at, created_at
         FROM organizations WHERE id = ?1 AND status != 'deleted'",
        [org_id],
        |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
                "slug": row.get_idx::<String>(2)?,
                "status": row.get_idx::<String>(3)?,
                "plan": row.get_idx::<String>(4)?,
                "plan_started_at": row.get_idx::<Option<String>>(5)?,
                "plan_expires_at": row.get_idx::<Option<String>>(6)?,
                "created_at": row.get_idx::<Option<String>>(7)?,
            }))
        },
    );
    let Ok(org) = org else {
        return HttpResponse::NotFound().json(ApiError::new("Organization not found"));
    };

    let users: Vec<serde_json::Value> = conn.query_map(
        "SELECT id, name, email, employee_id, status, is_super_admin, created_at
         FROM users WHERE organization_id = ?1 AND deleted_at IS NULL",
        [org_id],
        |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
                "email": row.get_idx::<String>(2)?,
                "employee_id": row.get_idx::<Option<String>>(3)?,
                "status": row.get_idx::<Option<String>>(4)?,
                "is_super_admin": row.get_idx::<Option<bool>>(5)?.unwrap_or(false),
                "created_at": row.get_idx::<Option<String>>(6)?,
            }))
        },
    );

    let settings: Vec<serde_json::Value> = conn.query_map(
        "SELECT key, value, type FROM app_settings WHERE organization_id = ?1",
        [org_id],
        |row| {
            Ok(serde_json::json!({
                "key": row.get_idx::<String>(0)?,
                "value": row.get_idx::<Option<String>>(1)?,
                "type": row.get_idx::<Option<String>>(2)?,
            }))
        },
    );

    let devices: Vec<serde_json::Value> = conn.query_map(
        "SELECT id, serial_number, name, model, location, is_active, last_heartbeat
         FROM biometric_devices WHERE organization_id = ?1",
        [org_id],
        |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "serial_number": row.get_idx::<String>(1)?,
                "name": row.get_idx::<Option<String>>(2)?,
                "model": row.get_idx::<Option<String>>(3)?,
                "location": row.get_idx::<Option<String>>(4)?,
                "is_active": row.get_idx::<Option<bool>>(5)?.unwrap_or(false),
                "last_heartbeat": row.get_idx::<Option<String>>(6)?,
            }))
        },
    );

    let notes: Vec<serde_json::Value> = conn.query_map(
        "SELECT id, author_email, body, pinned, created_at FROM platform_org_notes WHERE organization_id = ?1",
        [org_id],
        |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "author_email": row.get_idx::<Option<String>>(1)?,
                "body": row.get_idx::<String>(2)?,
                "pinned": row.get_idx::<Option<i64>>(3)?.unwrap_or(0) != 0,
                "created_at": row.get_idx::<Option<String>>(4)?,
            }))
        },
    );

    let exported_at = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let org_name = org["name"].as_str().unwrap_or("org").to_string();

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "organization.export",
        Some("organization"),
        Some(org_id),
        Some(&org_name),
        Some(org_id),
        serde_json::json!({
            "users": users.len(),
            "settings": settings.len(),
            "devices": devices.len(),
        }),
    );

    let payload = serde_json::json!({
        "exported_at": exported_at,
        "organization": org,
        "users": users,
        "settings": settings,
        "devices": devices,
        "platform_notes": notes,
    });

    HttpResponse::Ok()
        .insert_header((
            "Content-Disposition",
            format!("attachment; filename=\"{org_name}-export.json\""),
        ))
        .json(ApiResponse::success(payload))
}
