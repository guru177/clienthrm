use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::attendance::Attendance;

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let mut stmt = conn.prepare("SELECT * FROM attendance ORDER BY date DESC LIMIT 100").unwrap();
    let items: Vec<Attendance> = stmt.query_map([], Attendance::from_row).unwrap().filter_map(|r| r.ok()).collect();
    HttpResponse::Ok().json(ApiResponse::success(items))
}

pub async fn today(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let claims = get_claims_from_request(&req).unwrap();
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let att = conn.query_row("SELECT * FROM attendance WHERE user_id=?1 AND date=?2",
        rusqlite::params![claims.sub, &today], Attendance::from_row).ok();
    HttpResponse::Ok().json(ApiResponse::success(att))
}

pub async fn clock_in(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<crate::models::attendance::ClockInRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H:%M:%S").to_string();
    let ts = now.format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute("INSERT INTO attendance (user_id,date,clock_in,status,clock_in_lat,clock_in_lng,clock_in_photo,created_at,updated_at) VALUES (?1,?2,?3,'present',?4,?5,?6,?7,?8)",
        rusqlite::params![claims.sub, &date, &time, body.lat, body.lng, body.photo, &ts, &ts]) {
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Clocked in", "time": time}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn clock_out(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H:%M:%S").to_string();
    let ts = now.format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute("UPDATE attendance SET clock_out=?1, updated_at=?2 WHERE user_id=?3 AND date=?4 AND clock_out IS NULL",
        rusqlite::params![&time, &ts, claims.sub, &date]) {
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Clocked out", "time": time}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse { index(pool, req).await }
pub async fn users(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let mut stmt = conn.prepare("SELECT id, name FROM users WHERE deleted_at IS NULL ORDER BY name").unwrap();
    let items: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({"id": row.get::<_,i64>(0)?, "name": row.get::<_,String>(1)?}))
    }).unwrap().filter_map(|r| r.ok()).collect();
    HttpResponse::Ok().json(ApiResponse::success(items))
}

pub async fn stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let present: i64 = conn.query_row("SELECT COUNT(*) FROM attendance WHERE date=?1", [&today], |r| r.get(0)).unwrap_or(0);
    let total: i64 = conn.query_row("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND department_id IS NOT NULL", [], |r| r.get(0)).unwrap_or(0);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"present": present, "total": total, "absent": total - present})))
}
