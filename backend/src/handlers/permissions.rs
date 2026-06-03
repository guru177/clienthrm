use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::permission::Permission;

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let mut stmt = conn.prepare("SELECT * FROM permissions ORDER BY \"group\", name").unwrap();
    let items: Vec<Permission> = stmt.query_map([], Permission::from_row).unwrap().filter_map(|r| r.ok()).collect();
    HttpResponse::Ok().json(ApiResponse::success(items))
}

pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    index(pool, req).await
}

pub async fn show(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    match conn.query_row("SELECT * FROM permissions WHERE id=?1", [path.into_inner()], Permission::from_row) {
        Ok(p) => HttpResponse::Ok().json(ApiResponse::success(p)),
        Err(_) => HttpResponse::NotFound().json(ApiError::new("Not found")),
    }
}

pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<crate::models::permission::CreatePermissionRequest>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute("INSERT INTO permissions (name,slug,description,\"group\",created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6)",
        rusqlite::params![body.name, body.slug, body.description, body.group, &now, &now]) {
        Ok(_) => HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"id": conn.last_insert_rowid()}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn update(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<crate::models::permission::CreatePermissionRequest>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute("UPDATE permissions SET name=?1,slug=?2,description=?3,\"group\"=?4,updated_at=?5 WHERE id=?6",
        rusqlite::params![body.name, body.slug, body.description, body.group, &now, path.into_inner()]);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"})))
}

pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let _ = conn.execute("DELETE FROM permissions WHERE id=?1", [path.into_inner()]);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"})))
}
