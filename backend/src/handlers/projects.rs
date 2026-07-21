use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool; use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse}; use crate::models::project::Project;
use crate::tenant::org_id_from_claims;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct ProjectListQuery {
    pub search: Option<String>,
    pub status: Option<String>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

pub async fn index(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<ProjectListQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let mut sql = String::from("SELECT * FROM projects WHERE organization_id = ?1");
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];

    if let Some(ref search) = query.search {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            let idx = params.len() + 1;
            sql.push_str(&format!(
                " AND (name LIKE ?{idx} OR COALESCE(description, '') LIKE ?{})",
                idx + 1
            ));
            let pattern = format!("%{trimmed}%");
            params.push(crate::db::into_param_value(pattern.clone()));
            params.push(crate::db::into_param_value(pattern));
        }
    }
    if let Some(ref status) = query.status {
        let trimmed = status.trim();
        if !trimmed.is_empty() && trimmed != "all" {
            let idx = params.len() + 1;
            sql.push_str(&format!(" AND status = ?{idx}"));
            params.push(crate::db::into_param_value(trimmed));
        }
    }

    let sort_col = match query.sort_by.as_deref() {
        Some("name") => "name",
        Some("status") => "status",
        Some("priority") => "priority",
        Some("updated_at") => "updated_at",
        _ => "created_at",
    };
    let sort_dir = if query.sort_order.as_deref() == Some("asc") {
        "ASC"
    } else {
        "DESC"
    };
    sql.push_str(&format!(" ORDER BY {sort_col} {sort_dir}"));

    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(15).clamp(1, 100);
    let count_sql = {
        let base = sql.split(" ORDER BY ").next().unwrap_or(&sql);
        base.replacen("SELECT *", "SELECT COUNT(*)", 1)
    };
    let total: i64 = conn
        .query_row(&count_sql, &params, |row| row.get_idx::<i64>(0))
        .unwrap_or(0);

    let offset = (page - 1) * per_page;
    sql.push_str(" LIMIT ? OFFSET ?");
    params.push(crate::db::into_param_value(per_page));
    params.push(crate::db::into_param_value(offset));

    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => {
            return HttpResponse::InternalServerError()
                .json(ApiError::new(&format!("Query error: {e}")))
        }
    };
    let items: Vec<Project> = stmt.query_map(&params, Project::from_row);

    let last_page = ((total as f64) / (per_page as f64)).ceil().max(1.0) as i64;
    let from = if total == 0 { 0 } else { (page - 1) * per_page + 1 };
    let to = (page * per_page).min(total);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "data": items,
        "current_page": page,
        "last_page": last_page,
        "total": total,
        "from": from,
        "to": to,
        "per_page": per_page,
    })))
}

pub async fn show(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    match conn.query_row(
        "SELECT * FROM projects WHERE id=?1 AND organization_id=?2",
        crate::params![path.into_inner(), org_id],
        Project::from_row,
    ) {
        Ok(p)=>HttpResponse::Ok().json(ApiResponse::success(p)), Err(_)=>HttpResponse::NotFound().json(ApiError::new("Not found"))
    }
}
pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<crate::models::project::CreateProjectRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "INSERT INTO projects (name,description,status,priority,start_date,end_date,created_by,organization_id,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        crate::params![name, body.description, body.status.as_deref().unwrap_or("planning"), body.priority, body.start_date, body.end_date, claims.sub, org_id, &now, &now],
    ) {
        Ok(_)=>HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"id": conn.last_insert_rowid()}))),
        Err(e)=>HttpResponse::BadRequest().json(ApiError::new(&format!("{}",e)))
    }
}
pub async fn update(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<crate::models::project::CreateProjectRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "UPDATE projects SET name=?1,description=?2,status=?3,priority=?4,start_date=?5,end_date=?6,updated_at=?7 WHERE id=?8 AND organization_id=?9",
        crate::params![name, body.description, body.status, body.priority, body.start_date, body.end_date, &now, path.into_inner(), org_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Not found")),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}
pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    match conn.execute(
        "DELETE FROM projects WHERE id=?1 AND organization_id=?2",
        crate::params![path.into_inner(), org_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Not found")),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}
