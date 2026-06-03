use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool; use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse}; use crate::models::career::Career;

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let mut stmt = conn.prepare("SELECT * FROM careers ORDER BY created_at DESC").unwrap();
    let items: Vec<Career> = stmt.query_map([], Career::from_row).unwrap().filter_map(|r| r.ok()).collect();
    HttpResponse::Ok().json(ApiResponse::success(items))
}
pub async fn show(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    match conn.query_row("SELECT * FROM careers WHERE id=?1", [path.into_inner()], Career::from_row) {
        Ok(c)=>HttpResponse::Ok().json(ApiResponse::success(c)), Err(_)=>HttpResponse::NotFound().json(ApiError::new("Not found"))
    }
}
pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<crate::models::career::CreateCareerRequest>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute("INSERT INTO careers (title,department,location,employment_type,description,requirements,salary_range,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,1,?8,?9)",
        rusqlite::params![body.title, body.department, body.location, body.employment_type, body.description, body.requirements, body.salary_range, &now, &now]) {
        Ok(_)=>HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"id": conn.last_insert_rowid()}))),
        Err(e)=>HttpResponse::BadRequest().json(ApiError::new(&format!("{}",e)))
    }
}
pub async fn update(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<crate::models::career::CreateCareerRequest>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute("UPDATE careers SET title=?1,department=?2,location=?3,employment_type=?4,description=?5,requirements=?6,salary_range=?7,updated_at=?8 WHERE id=?9",
        rusqlite::params![body.title, body.department, body.location, body.employment_type, body.description, body.requirements, body.salary_range, &now, path.into_inner()]);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"})))
}
pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let _ = conn.execute("DELETE FROM careers WHERE id=?1", [path.into_inner()]);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"})))
}
pub async fn stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let t: i64 = conn.query_row("SELECT COUNT(*) FROM careers", [], |r| r.get(0)).unwrap_or(0);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"total": t})))
}
pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse { index(pool, req).await }
