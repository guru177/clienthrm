use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::department::{Department, CreateDepartmentRequest};
use crate::tenant::org_id_from_claims;

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };

    let mut stmt = conn.prepare("SELECT * FROM departments WHERE organization_id = ?1 ORDER BY name").unwrap();
    let depts: Vec<Department> = stmt.query_map([org_id], Department::from_row);
    HttpResponse::Ok().json(ApiResponse::success(depts))
}

pub async fn show(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };

    match conn.query_row(
        "SELECT * FROM departments WHERE id = ?1 AND organization_id = ?2",
        crate::params![path.into_inner(), org_id],
        Department::from_row,
    ) {
        Ok(d) => HttpResponse::Ok().json(ApiResponse::success(d)),
        Err(_) => HttpResponse::NotFound().json(ApiError::new("Department not found")),
    }
}

pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<CreateDepartmentRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };

    let slug = body.name.to_lowercase().replace(' ', "-");
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    match conn.execute(
        "INSERT INTO departments (name, slug, description, organization_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        crate::params![body.name, slug, body.description, org_id, &now, &now],
    ) {
        Ok(_) => {
            let dept_id = conn.last_insert_rowid();
            let actor_id = claims.sub;
            let _ = crate::chat_department_channels::ensure_department_channel(
                &conn, org_id, dept_id, actor_id,
            );
            HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"id": dept_id, "message": "Department created"})))
        }
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {}", e))),
    }
}

pub async fn update(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<CreateDepartmentRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let slug = body.name.to_lowercase().replace(' ', "-");
    let id = path.into_inner();

    match conn.execute(
        "UPDATE departments SET name = ?1, slug = ?2, description = ?3, updated_at = ?4 WHERE id = ?5 AND organization_id = ?6",
        crate::params![body.name, slug, body.description, &now, id, org_id],
    ) {
        Ok(n) if n > 0 => {
            let _ = crate::chat_department_channels::ensure_department_channel(
                &conn, org_id, id, claims.sub,
            );
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Department updated"})))
        }
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Department not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {}", e))),
    }
}

pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };

    let dept_id = path.into_inner();
    match conn.execute(
        "DELETE FROM departments WHERE id = ?1 AND organization_id = ?2",
        crate::params![dept_id, org_id],
    ) {
        Ok(n) if n > 0 => {
            crate::chat_department_channels::delete_department_channel(&conn, org_id, dept_id);
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Department deleted"})))
        }
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Department not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {}", e))),
    }
}

pub async fn stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };

    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM departments WHERE organization_id = ?1",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"total": total})))
}

pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };

    let mut stmt = conn.prepare("SELECT id, name FROM departments WHERE organization_id = ?1 ORDER BY name").unwrap();
    let items: Vec<serde_json::Value> = stmt
        .query_map([org_id], |row| {
            Ok(serde_json::json!({"id": row.get_idx::<i64>(0)?, "name": row.get_idx::<String>(1)?}))
        });
    HttpResponse::Ok().json(ApiResponse::success(items))
}
