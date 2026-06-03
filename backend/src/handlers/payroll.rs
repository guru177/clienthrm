use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool; use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let mut stmt = conn.prepare("SELECT * FROM payslips ORDER BY year DESC, month DESC LIMIT 100").unwrap();
    let items: Vec<crate::models::payslip::Payslip> = stmt.query_map([], crate::models::payslip::Payslip::from_row).unwrap().filter_map(|r| r.ok()).collect();
    HttpResponse::Ok().json(ApiResponse::success(items))
}
pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse { index(pool, req).await }
pub async fn stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let t: i64 = conn.query_row("SELECT COUNT(*) FROM payslips", [], |r| r.get(0)).unwrap_or(0);
    let total_gross: f64 = conn.query_row("SELECT COALESCE(SUM(gross_salary),0) FROM payslips", [], |r| r.get(0)).unwrap_or(0.0);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"total": t, "total_gross": total_gross})))
}
pub async fn employees(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let mut stmt = conn.prepare("SELECT id, name, email, employee_id FROM users WHERE deleted_at IS NULL AND department_id IS NOT NULL ORDER BY name").unwrap();
    let items: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({"id": row.get::<_,i64>(0)?, "name": row.get::<_,String>(1)?, "email": row.get::<_,String>(2)?, "employee_id": row.get::<_,Option<String>>(3)?}))
    }).unwrap().filter_map(|r| r.ok()).collect();
    HttpResponse::Ok().json(ApiResponse::success(items))
}
