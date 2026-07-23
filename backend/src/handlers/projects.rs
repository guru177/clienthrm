use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::project::Project;
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

fn require_project_in_scope(
    conn: &crate::db::Connection,
    claims: &crate::models::user::JwtClaims,
    org_id: i64,
    project_id: i64,
) -> Result<i64, HttpResponse> {
    let created_by: Option<i64> = conn
        .query_row(
            "SELECT created_by FROM projects WHERE id = ?1 AND organization_id = ?2",
            crate::params![project_id, org_id],
            |r| r.get_idx::<Option<i64>>(0),
        )
        .ok()
        .flatten();
    let Some(created_by) = created_by else {
        return Err(HttpResponse::NotFound().json(ApiError::new("Not found")));
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(conn, claims);
    if let Err(resp) =
        crate::branch_scope::require_user_in_scope(conn, created_by, org_id, &scope)
    {
        return Err(resp);
    }
    Ok(created_by)
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

    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    let mut sql = String::from(
        "SELECT p.* FROM projects p
         LEFT JOIN users u ON u.id = p.created_by
         WHERE p.organization_id = ?",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    let mut conditions = Vec::new();
    crate::branch_scope::push_users_branch_condition_qmark(
        &mut conditions,
        &mut params,
        &scope,
        "u",
    );
    for c in &conditions {
        sql.push_str(" AND ");
        sql.push_str(c);
    }

    if let Some(ref search) = query.search {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            sql.push_str(" AND (p.name LIKE ? OR COALESCE(p.description, '') LIKE ?)");
            let pattern = format!("%{trimmed}%");
            params.push(crate::db::into_param_value(pattern.clone()));
            params.push(crate::db::into_param_value(pattern));
        }
    }
    if let Some(ref status) = query.status {
        let trimmed = status.trim();
        if !trimmed.is_empty() && trimmed != "all" {
            sql.push_str(" AND p.status = ?");
            params.push(crate::db::into_param_value(trimmed));
        }
    }

    let sort_col = match query.sort_by.as_deref() {
        Some("name") => "p.name",
        Some("status") => "p.status",
        Some("priority") => "p.priority",
        Some("updated_at") => "p.updated_at",
        _ => "p.created_at",
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
        base.replacen("SELECT p.*", "SELECT COUNT(*)", 1)
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
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let project_id = path.into_inner();
    if let Err(resp) = require_project_in_scope(&conn, &claims, org_id, project_id) {
        return resp;
    }
    match conn.query_row(
        "SELECT * FROM projects WHERE id=?1 AND organization_id=?2",
        crate::params![project_id, org_id],
        Project::from_row,
    ) {
        Ok(p) => HttpResponse::Ok().json(ApiResponse::success(p)),
        Err(_) => HttpResponse::NotFound().json(ApiError::new("Not found")),
    }
}

pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<crate::models::project::CreateProjectRequest>,
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
    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "INSERT INTO projects (name,description,status,priority,start_date,end_date,created_by,organization_id,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        crate::params![
            name,
            body.description,
            body.status.as_deref().unwrap_or("planning"),
            body.priority,
            body.start_date,
            body.end_date,
            claims.sub,
            org_id,
            &now,
            &now
        ],
    ) {
        Ok(_) => HttpResponse::Created()
            .json(ApiResponse::success(serde_json::json!({"id": conn.last_insert_rowid()}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<crate::models::project::CreateProjectRequest>,
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
    let project_id = path.into_inner();
    if let Err(resp) = require_project_in_scope(&conn, &claims, org_id, project_id) {
        return resp;
    }
    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "UPDATE projects SET name=?1,description=?2,status=?3,priority=?4,start_date=?5,end_date=?6,updated_at=?7 WHERE id=?8 AND organization_id=?9",
        crate::params![
            name,
            body.description,
            body.status,
            body.priority,
            body.start_date,
            body.end_date,
            &now,
            project_id,
            org_id
        ],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Not found")),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn destroy(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
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
    let project_id = path.into_inner();
    if let Err(resp) = require_project_in_scope(&conn, &claims, org_id, project_id) {
        return resp;
    }
    match conn.execute(
        "DELETE FROM projects WHERE id=?1 AND organization_id=?2",
        crate::params![project_id, org_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Not found")),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}
