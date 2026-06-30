use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::department::{CreateDepartmentRequest, Department};
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;

#[derive(Debug, Deserialize)]
pub struct DepartmentListQuery {
    pub search: Option<String>,
    pub status: Option<String>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

fn department_json(row: &crate::db::Row) -> crate::db::Result<serde_json::Value> {
    let dept = Department::from_row(row)?;
    let users_count: i64 = row.get("users_count").unwrap_or(0);
    Ok(serde_json::json!({
        "id": dept.id,
        "name": dept.name,
        "slug": dept.slug,
        "description": dept.description,
        "is_active": dept.is_active,
        "users_count": users_count,
        "created_at": dept.created_at,
        "updated_at": dept.updated_at,
    }))
}

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let stmt = match conn.prepare(
        "SELECT d.*,
                (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.organization_id = d.organization_id) AS users_count
         FROM departments d
         WHERE d.organization_id = ?1
         ORDER BY d.name",
    ) {
        Ok(s) => s,
        Err(_) => return HttpResponse::Ok().json(ApiResponse::success(Vec::<serde_json::Value>::new())),
    };
    let depts: Vec<serde_json::Value> = stmt.query_map([org_id], department_json);
    HttpResponse::Ok().json(ApiResponse::success(depts))
}

pub async fn show(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    match conn.query_row(
        "SELECT d.*,
                (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.organization_id = d.organization_id) AS users_count
         FROM departments d
         WHERE d.id = ?1 AND d.organization_id = ?2",
        crate::params![path.into_inner(), org_id],
        department_json,
    ) {
        Ok(d) => HttpResponse::Ok().json(ApiResponse::success(d)),
        Err(_) => HttpResponse::NotFound().json(ApiError::new("Department not found")),
    }
}

pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<CreateDepartmentRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let description = crate::validation::normalize_optional(body.description.clone());
    let is_active = if body.is_active.unwrap_or(true) { 1 } else { 0 };
    let slug = name.to_lowercase().replace(' ', "-");
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    match conn.execute(
        "INSERT INTO departments (name, slug, description, is_active, organization_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        crate::params![name, slug, description, is_active, org_id, &now, &now],
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

pub async fn update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<CreateDepartmentRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let description = crate::validation::normalize_optional(body.description.clone());
    let is_active = if body.is_active.unwrap_or(true) { 1 } else { 0 };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let slug = name.to_lowercase().replace(' ', "-");
    let id = path.into_inner();

    match conn.execute(
        "UPDATE departments SET name = ?1, slug = ?2, description = ?3, is_active = ?4, updated_at = ?5
         WHERE id = ?6 AND organization_id = ?7",
        crate::params![name, slug, description, is_active, &now, id, org_id],
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
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

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
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM departments WHERE organization_id = ?1",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let active: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM departments WHERE organization_id = ?1 AND COALESCE(is_active, 1) != 0",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let inactive = total.saturating_sub(active);
    let with_users: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT d.id)
             FROM departments d
             INNER JOIN users u ON u.department_id = d.id AND u.organization_id = d.organization_id
             WHERE d.organization_id = ?1",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "total": total,
        "active": active,
        "inactive": inactive,
        "with_users": with_users,
    })))
}

pub async fn list(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<DepartmentListQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let mut sql = String::from(
        "SELECT d.*,
                (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.organization_id = d.organization_id) AS users_count
         FROM departments d
         WHERE d.organization_id = ?1",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];

    if let Some(ref search) = query.search {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            sql.push_str(" AND (d.name LIKE ?2 OR COALESCE(d.description, '') LIKE ?3)");
            let pattern = format!("%{trimmed}%");
            params.push(crate::db::into_param_value(pattern.clone()));
            params.push(crate::db::into_param_value(pattern));
        }
    }

    if let Some(ref status) = query.status {
        match status.as_str() {
            "active" => sql.push_str(" AND COALESCE(d.is_active, 1) != 0"),
            "inactive" => sql.push_str(" AND COALESCE(d.is_active, 1) = 0"),
            _ => {}
        }
    }

    let sort_col = match query.sort_by.as_deref() {
        Some("id") => "d.id",
        Some("name") => "d.name",
        Some("is_active") => "d.is_active",
        Some("created_at") => "d.created_at",
        Some("updated_at") => "d.updated_at",
        _ => "d.created_at",
    };
    let sort_dir = if query.sort_order.as_deref() == Some("asc") {
        "ASC"
    } else {
        "DESC"
    };
    sql.push_str(&format!(" ORDER BY {sort_col} {sort_dir}"));

    let use_pagination = query.page.is_some() || query.per_page.is_some();
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(10).clamp(1, 100);

    if use_pagination {
        sql.push_str(" LIMIT ? OFFSET ?");
    }

    let count_sql = sql
        .replace(
            "SELECT d.*,\n                (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.organization_id = d.organization_id) AS users_count",
            "SELECT COUNT(*)",
        )
        .split(" ORDER BY ")
        .next()
        .unwrap_or("")
        .to_string();

    let total: i64 = conn
        .query_row(&count_sql, &params, |row| row.get_idx::<i64>(0))
        .unwrap_or(0);

    if use_pagination {
        let offset = (page - 1) * per_page;
        params.push(crate::db::into_param_value(per_page));
        params.push(crate::db::into_param_value(offset));
    }

    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => {
            return HttpResponse::InternalServerError()
                .json(ApiError::new(&format!("Query error: {e}")))
        }
    };

    let items: Vec<serde_json::Value> = stmt.query_map(&params, department_json);

    if use_pagination {
        let last_page = ((total as f64) / (per_page as f64)).ceil().max(1.0) as i64;
        let from = if total == 0 { 0 } else { (page - 1) * per_page + 1 };
        let to = (page * per_page).min(total);
        return HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "data": items,
            "total": total,
            "current_page": page,
            "last_page": last_page,
            "per_page": per_page,
            "from": from,
            "to": to,
        })));
    }

    HttpResponse::Ok().json(ApiResponse::success(items))
}
