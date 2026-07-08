use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::designation::{Designation, CreateDesignationRequest};
use crate::tenant::org_id_from_claims;

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };
    let stmt = conn.prepare("SELECT * FROM designations WHERE organization_id = ?1 ORDER BY name").unwrap();
    let items: Vec<Designation> = stmt.query_map([org_id], Designation::from_row);
    HttpResponse::Ok().json(ApiResponse::success(items))
}

pub async fn show(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };
    match conn.query_row(
        "SELECT * FROM designations WHERE id = ?1 AND organization_id = ?2",
        crate::params![path.into_inner(), org_id],
        Designation::from_row,
    ) {
        Ok(d) => HttpResponse::Ok().json(ApiResponse::success(d)),
        Err(_) => HttpResponse::NotFound().json(ApiError::new("Designation not found")),
    }
}

pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<CreateDesignationRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };
    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let description = crate::validation::normalize_optional(body.description.clone());
    let slug = name.to_lowercase().replace(' ', "-");
    let is_active = if body.is_active.unwrap_or(true) { 1 } else { 0 };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "INSERT INTO designations (name, slug, description, level, is_active, organization_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        crate::params![name, slug, description, body.level, is_active, org_id, &now, &now],
    ) {
        Ok(_) => HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"id": conn.last_insert_rowid()}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {}", e))),
    }
}

pub async fn update(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<CreateDesignationRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };
    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let description = crate::validation::normalize_optional(body.description.clone());
    let is_active = if body.is_active.unwrap_or(true) { 1 } else { 0 };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let slug = name.to_lowercase().replace(' ', "-");
    match conn.execute(
        "UPDATE designations SET name=?1, slug=?2, description=?3, level=?4, is_active=?5, updated_at=?6 WHERE id=?7 AND organization_id=?8",
        crate::params![name, slug, description, body.level, is_active, &now, path.into_inner(), org_id],
    ) {
        Ok(n) if n > 0 => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"}))),
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Designation not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {}", e))),
    }
}

pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };
    match conn.execute(
        "DELETE FROM designations WHERE id = ?1 AND organization_id = ?2",
        crate::params![path.into_inner(), org_id],
    ) {
        Ok(n) if n > 0 => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"}))),
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Designation not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {}", e))),
    }
}

#[derive(Debug, Deserialize)]
pub struct DesignationListQuery {
    pub search: Option<String>,
    pub status: Option<String>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

fn designation_json(row: &crate::db::Row) -> crate::db::Result<serde_json::Value> {
    let desig = Designation::from_row(row)?;
    let users_count: i64 = row.get("users_count").unwrap_or(0);
    Ok(serde_json::json!({
        "id": desig.id,
        "name": desig.name,
        "slug": desig.slug,
        "description": desig.description,
        "level": desig.level,
        "is_active": desig.is_active,
        "users_count": users_count,
        "created_at": desig.created_at,
        "updated_at": desig.updated_at,
    }))
}

pub async fn stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };
    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM designations WHERE organization_id = ?1", [org_id], |r| r.get_idx::<i64>(0))
        .unwrap_or(0);
    let active: i64 = conn
        .query_row("SELECT COUNT(*) FROM designations WHERE organization_id = ?1 AND COALESCE(is_active, 1) != 0", [org_id], |r| r.get_idx::<i64>(0))
        .unwrap_or(0);
    let inactive = total.saturating_sub(active);
    let with_users: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT d.id)
             FROM designations d
             INNER JOIN users u ON u.designation_id = d.id AND u.organization_id = d.organization_id
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
    query: web::Query<DesignationListQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")) };

    let mut sql = String::from(
        "SELECT d.*,
                (SELECT COUNT(*) FROM users u WHERE u.designation_id = d.id AND u.organization_id = d.organization_id) AS users_count
         FROM designations d
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
        _ => "d.name",
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
        let offset = (page - 1) * per_page;
        sql.push_str(&format!(" LIMIT {per_page} OFFSET {offset}"));
    }

    let count_sql = sql
        .replace(
            "SELECT d.*,\n                (SELECT COUNT(*) FROM users u WHERE u.designation_id = d.id AND u.organization_id = d.organization_id) AS users_count",
            "SELECT COUNT(*)",
        )
        .split(" ORDER BY ")
        .next()
        .unwrap_or("")
        .to_string();

    let total: i64 = conn
        .query_row(&count_sql, &params, |row| row.get_idx::<i64>(0))
        .unwrap_or(0);

    let items: Vec<serde_json::Value> = match conn.query_map_result(&sql, &params, designation_json) {
        Ok(rows) => rows,
        Err(e) => {
            log::warn!("designations list row mapping failed: {e}");
            Vec::new()
        }
    };

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