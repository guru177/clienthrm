use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let mut stmt = conn.prepare("SELECT * FROM leave_requests WHERE user_id=?1 ORDER BY created_at DESC").unwrap();
    let items: Vec<crate::models::leave_request::LeaveRequest> = stmt.query_map([claims.sub], crate::models::leave_request::LeaveRequest::from_row).unwrap().filter_map(|r| r.ok()).collect();
    HttpResponse::Ok().json(ApiResponse::success(items))
}
pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse { index(pool, req).await }
pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<crate::models::leave_request::CreateLeaveRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute("INSERT INTO leave_requests (user_id,leave_type,start_date,end_date,reason,status,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,'pending',?6,?7)",
        rusqlite::params![claims.sub, body.leave_type, body.start_date, body.end_date, body.reason, &now, &now]) {
        Ok(_) => HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"id": conn.last_insert_rowid()}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}
pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let _ = conn.execute("DELETE FROM leave_requests WHERE id=?1", [path.into_inner()]);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"})))
}
pub async fn stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let pending: i64 = conn.query_row("SELECT COUNT(*) FROM leave_requests WHERE user_id=?1 AND status='pending'", [claims.sub], |r| r.get(0)).unwrap_or(0);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"pending": pending})))
}
pub async fn manage(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let mut stmt = conn.prepare("SELECT * FROM leave_requests ORDER BY created_at DESC").unwrap();
    let items: Vec<crate::models::leave_request::LeaveRequest> = stmt.query_map([], crate::models::leave_request::LeaveRequest::from_row).unwrap().filter_map(|r| r.ok()).collect();
    HttpResponse::Ok().json(ApiResponse::success(items))
}
pub async fn list_all(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse { manage(pool, req).await }
pub async fn admin_stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let p: i64 = conn.query_row("SELECT COUNT(*) FROM leave_requests WHERE status='pending'", [], |r| r.get(0)).unwrap_or(0);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"pending": p})))
}
pub async fn approve(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute("UPDATE leave_requests SET status='approved',approved_by=?1,updated_at=?2 WHERE id=?3", rusqlite::params![claims.sub, &now, path.into_inner()]);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Approved"})))
}
pub async fn reject(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute("UPDATE leave_requests SET status='rejected',approved_by=?1,updated_at=?2 WHERE id=?3", rusqlite::params![claims.sub, &now, path.into_inner()]);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Rejected"})))
}
