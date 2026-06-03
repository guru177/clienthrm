use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::department::{Department, CreateDepartmentRequest};

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };

    let mut stmt = conn.prepare("SELECT * FROM departments ORDER BY name").unwrap();
    let depts: Vec<Department> = stmt.query_map([], Department::from_row).unwrap().filter_map(|r| r.ok()).collect();
    HttpResponse::Ok().json(ApiResponse::success(depts))
}

pub async fn show(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let _claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };

    match conn.query_row("SELECT * FROM departments WHERE id = ?1", [path.into_inner()], Department::from_row) {
        Ok(d) => HttpResponse::Ok().json(ApiResponse::success(d)),
        Err(_) => HttpResponse::NotFound().json(ApiError::new("Department not found")),
    }
}

pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<CreateDepartmentRequest>) -> HttpResponse {
    let _claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };

    let slug = body.name.to_lowercase().replace(' ', "-");
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    match conn.execute(
        "INSERT INTO departments (name, slug, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![body.name, slug, body.description, &now, &now],
    ) {
        Ok(_) => HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"id": conn.last_insert_rowid(), "message": "Department created"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {}", e))),
    }
}

pub async fn update(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<CreateDepartmentRequest>) -> HttpResponse {
    let _claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let slug = body.name.to_lowercase().replace(' ', "-");

    match conn.execute(
        "UPDATE departments SET name = ?1, slug = ?2, description = ?3, updated_at = ?4 WHERE id = ?5",
        rusqlite::params![body.name, slug, body.description, &now, path.into_inner()],
    ) {
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Department updated"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {}", e))),
    }
}

pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let _claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };

    match conn.execute("DELETE FROM departments WHERE id = ?1", [path.into_inner()]) {
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Department deleted"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {}", e))),
    }
}

pub async fn stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };

    let total: i64 = conn.query_row("SELECT COUNT(*) FROM departments", [], |r| r.get(0)).unwrap_or(0);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"total": total})))
}

pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };

    let mut stmt = conn.prepare("SELECT id, name FROM departments ORDER BY name").unwrap();
    let items: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({"id": row.get::<_, i64>(0)?, "name": row.get::<_, String>(1)?}))
    }).unwrap().filter_map(|r| r.ok()).collect();
    HttpResponse::Ok().json(ApiResponse::success(items))
}
