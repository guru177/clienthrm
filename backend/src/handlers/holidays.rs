use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::holiday::Holiday;
use crate::tenant::org_id_from_claims;

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let stmt = match conn.prepare("SELECT * FROM holidays WHERE organization_id = ?1 ORDER BY date") {
        Ok(s) => s,
        Err(_) => return HttpResponse::Ok().json(ApiResponse::success(Vec::<Holiday>::new())),
    };
    let items: Vec<Holiday> = stmt.query_map([org_id], Holiday::from_row);
    HttpResponse::Ok().json(ApiResponse::success(items))
}
pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse { index(pool, req).await }
pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<crate::models::holiday::CreateHolidayRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let date = match crate::validation::validate_date_yyyy_mm_dd(&body.date, "Date") {
        Ok(d) => d,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let description = crate::validation::normalize_optional(body.description.clone());
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let is_paid = body.is_paid.unwrap_or(true);
    match conn.execute(
        "INSERT INTO holidays (name,date,description,is_paid,organization_id,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        crate::params![name, date, description, if is_paid { 1 } else { 0 }, org_id, &now, &now],
    ) {
        Ok(_) => HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"id": conn.last_insert_rowid()}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}
pub async fn update(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<crate::models::holiday::CreateHolidayRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let date = match crate::validation::validate_date_yyyy_mm_dd(&body.date, "Date") {
        Ok(d) => d,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let description = crate::validation::normalize_optional(body.description.clone());
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "UPDATE holidays SET name=?1,date=?2,description=?3,updated_at=?4 WHERE id=?5 AND organization_id=?6",
        crate::params![name, date, description, &now, path.into_inner(), org_id],
    ) {
        Ok(n) if n > 0 => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"}))),
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Holiday not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}
pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    match conn.execute(
        "DELETE FROM holidays WHERE id=?1 AND organization_id=?2",
        crate::params![path.into_inner(), org_id],
    ) {
        Ok(n) if n > 0 => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"}))),
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Holiday not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}
