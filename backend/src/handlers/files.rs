use actix_web::{web, HttpRequest, HttpResponse};
use std::path::Path;

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request_or_query;
use crate::models::ApiError;
use crate::storage::{
    can_access_storage_file, default_profile_avatar_svg, is_announcement_banner,
    is_org_notification_banner, is_user_profile_photo, mime_for_path, normalize_relative_path,
    read_stored_bytes,
};
use crate::tenant::verify_tenant_session;

/// GET /api/admin/files/{tail:.*} — authenticated file download (Bearer or ?token=)
pub async fn serve(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<String>,
) -> HttpResponse {
    let claims = match get_claims_from_request_or_query(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let (org_id, _) = match verify_tenant_session(&conn, &claims) {
        Ok(v) => v,
        Err(msg) => return HttpResponse::Forbidden().json(ApiError::new(&msg)),
    };

    let relative = path.into_inner();
    if !can_access_storage_file(&conn, org_id, claims.sub, &relative) {
        return HttpResponse::Forbidden().json(ApiError::new("Not allowed to access this file"));
    }

    let profile_photo = is_user_profile_photo(&relative);
    let Some(rel) = normalize_relative_path(&relative) else {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid path"));
    };

    match read_stored_bytes(&rel) {
        Ok(bytes) => HttpResponse::Ok()
            .content_type(mime_for_path(Path::new(&rel)))
            .body(bytes),
        Err(_) if profile_photo => HttpResponse::Ok()
            .content_type("image/svg+xml")
            .body(default_profile_avatar_svg()),
        Err(e) => HttpResponse::NotFound().json(ApiError::new(&e)),
    }
}

/// GET /api/platform/files/{tail:.*} — platform admin file download (announcement banners)
pub async fn platform_serve(req: HttpRequest, path: web::Path<String>) -> HttpResponse {
    let _claims = match crate::middleware::platform_auth::get_platform_claims_from_request_or_query(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let relative = path.into_inner();
    if !is_announcement_banner(&relative) && !is_org_notification_banner(&relative) {
        return HttpResponse::Forbidden().json(ApiError::new("Not allowed to access this file"));
    }

    let Some(rel) = normalize_relative_path(&relative) else {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid path"));
    };

    match read_stored_bytes(&rel) {
        Ok(bytes) => HttpResponse::Ok()
            .content_type(mime_for_path(Path::new(&rel)))
            .body(bytes),
        Err(e) => HttpResponse::NotFound().json(ApiError::new(&e)),
    }
}
