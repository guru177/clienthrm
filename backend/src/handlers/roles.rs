use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::role::Role;

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let mut stmt = conn.prepare("SELECT * FROM roles ORDER BY name").unwrap();
    let items: Vec<Role> = stmt.query_map([], Role::from_row).unwrap().filter_map(|r| r.ok()).collect();
    HttpResponse::Ok().json(ApiResponse::success(items))
}

pub async fn show(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    match conn.query_row("SELECT * FROM roles WHERE id=?1", [path.into_inner()], Role::from_row) {
        Ok(r) => HttpResponse::Ok().json(ApiResponse::success(r)),
        Err(_) => HttpResponse::NotFound().json(ApiError::new("Not found")),
    }
}

pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<crate::models::role::CreateRoleRequest>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute("INSERT INTO roles (name,slug,description,created_at,updated_at) VALUES (?1,?2,?3,?4,?5)",
        rusqlite::params![body.name, body.slug, body.description, &now, &now]) {
        Ok(_) => {
            let role_id = conn.last_insert_rowid();
            if let Some(ref pids) = body.permission_ids {
                for pid in pids {
                    let _ = conn.execute("INSERT OR IGNORE INTO permission_role (permission_id,role_id,created_at,updated_at) VALUES (?1,?2,?3,?4)",
                        rusqlite::params![pid, role_id, &now, &now]);
                }
            }
            HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"id": role_id})))
        }
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn update(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<crate::models::role::CreateRoleRequest>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let id = path.into_inner();
    let _ = conn.execute("UPDATE roles SET name=?1,slug=?2,description=?3,updated_at=?4 WHERE id=?5",
        rusqlite::params![body.name, body.slug, body.description, &now, id]);
    if let Some(ref pids) = body.permission_ids {
        let _ = conn.execute("DELETE FROM permission_role WHERE role_id=?1", [id]);
        for pid in pids {
            let _ = conn.execute("INSERT INTO permission_role (permission_id,role_id,created_at,updated_at) VALUES (?1,?2,?3,?4)",
                rusqlite::params![pid, id, &now, &now]);
        }
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"})))
}

pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let _ = conn.execute("DELETE FROM roles WHERE id=?1", [path.into_inner()]);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"})))
}

pub async fn stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let t: i64 = conn.query_row("SELECT COUNT(*) FROM roles", [], |r| r.get(0)).unwrap_or(0);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"total": t})))
}

pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let mut stmt = conn.prepare("SELECT id, name, slug FROM roles ORDER BY name").unwrap();
    let items: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({"id": row.get::<_,i64>(0)?, "name": row.get::<_,String>(1)?, "slug": row.get::<_,String>(2)?}))
    }).unwrap().filter_map(|r| r.ok()).collect();
    HttpResponse::Ok().json(ApiResponse::success(items))
}
