use actix_web::{web, HttpRequest, HttpResponse};

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request_or_query;
use crate::models::ApiError;
use crate::storage::{
    can_access_storage_file, default_profile_avatar_svg, is_announcement_banner,
    is_user_profile_photo, mime_for_path, resolve_storage_file,
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

    let file_path = match resolve_storage_file(&relative) {
        Ok(p) => p,
        Err(_) if profile_photo => {
            return HttpResponse::Ok()
                .content_type("image/svg+xml")
                .body(default_profile_avatar_svg());
        }
        Err(e) => return HttpResponse::NotFound().json(ApiError::new(&e)),
    };

    let bytes = match std::fs::read(&file_path) {
        Ok(b) => b,
        Err(_) if profile_photo => {
            return HttpResponse::Ok()
                .content_type("image/svg+xml")
                .body(default_profile_avatar_svg());
        }
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("File not found")),
    };

    HttpResponse::Ok()
        .content_type(mime_for_path(&file_path))
        .body(bytes)
}

/// GET /api/platform/files/{tail:.*} — platform admin file download (announcement banners)
pub async fn platform_serve(req: HttpRequest, path: web::Path<String>) -> HttpResponse {
    let _claims = match crate::middleware::platform_auth::get_platform_claims_from_request_or_query(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let relative = path.into_inner();
    if !is_announcement_banner(&relative) {
        return HttpResponse::Forbidden().json(ApiError::new("Not allowed to access this file"));
    }

    let file_path = match resolve_storage_file(&relative) {
        Ok(p) => p,
        Err(e) => return HttpResponse::NotFound().json(ApiError::new(&e)),
    };

    let bytes = match std::fs::read(&file_path) {
        Ok(b) => b,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("File not found")),
    };

    HttpResponse::Ok()
        .content_type(mime_for_path(&file_path))
        .body(bytes)
}
