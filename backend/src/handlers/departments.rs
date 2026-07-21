use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;

use crate::branch_scope::{append_center_id_filter, resolve_branch_scope, BranchScope};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::department::{CreateDepartmentRequest, Department};
use crate::models::{ApiError, ApiResponse};
use crate::tenant::{center_in_organization, org_id_from_claims};

fn actor_scope(conn: &crate::db::Connection, claims: &crate::models::user::JwtClaims) -> BranchScope {
    let org_id = org_id_from_claims(claims);
    let is_sa = crate::tenant::user_is_super_admin(conn, claims.sub, org_id);
    let (permissions, _) = crate::plan_limits::resolve_effective_permissions(
        conn,
        org_id,
        crate::middleware::rbac::load_user_permissions(conn, claims.sub, is_sa),
    );
    resolve_branch_scope(conn, claims.sub, org_id, &permissions, is_sa)
}

const DEPT_SELECT: &str = "SELECT d.*,
                c.name AS center_name,
                (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.organization_id = d.organization_id) AS users_count
         FROM departments d
         LEFT JOIN centers c ON c.id = d.center_id AND c.organization_id = d.organization_id";

#[derive(Debug, Deserialize)]
pub struct DepartmentListQuery {
    pub search: Option<String>,
    pub status: Option<String>,
    pub center_id: Option<i64>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    /// Dropdowns only need id/name/center_id — skip COUNT(*) and fat columns.
    #[serde(default)]
    pub compact: Option<u8>,
}

#[derive(Debug, Deserialize)]
pub struct DepartmentStatsQuery {
    pub center_id: Option<i64>,
}

fn unique_department_slug(
    conn: &crate::db::Connection,
    org_id: i64,
    center_id: i64,
    name: &str,
    exclude_id: Option<i64>,
) -> String {
    let base = name.to_lowercase().replace(' ', "-");
    let mut slug = base.clone();
    let mut n = 0u32;
    loop {
        let exists = if let Some(ex_id) = exclude_id {
            conn.query_row(
                "SELECT 1 FROM departments WHERE organization_id = ?1 AND center_id = ?2 AND slug = ?3 AND id != ?4 LIMIT 1",
                crate::params![org_id, center_id, &slug, ex_id],
                |_| Ok(()),
            )
            .is_ok()
        } else {
            conn.query_row(
                "SELECT 1 FROM departments WHERE organization_id = ?1 AND center_id = ?2 AND slug = ?3 LIMIT 1",
                crate::params![org_id, center_id, &slug],
                |_| Ok(()),
            )
            .is_ok()
        };
        if !exists {
            return slug;
        }
        n += 1;
        slug = format!("{base}-{n}");
    }
}

fn department_json(row: &crate::db::Row) -> crate::db::Result<serde_json::Value> {
    let dept = Department::from_row(row)?;
    let users_count: i64 = row.get("users_count").unwrap_or(0);
    let center_name: Option<String> = row.get("center_name").ok().flatten();
    Ok(serde_json::json!({
        "id": dept.id,
        "name": dept.name,
        "slug": dept.slug,
        "description": dept.description,
        "center_id": dept.center_id,
        "center": dept.center_id.map(|id| serde_json::json!({
            "id": id,
            "name": center_name,
        })),
        "is_active": dept.is_active,
        "users_count": users_count,
        "created_at": dept.created_at,
        "updated_at": dept.updated_at,
    }))
}

fn append_center_filter(
    sql: &mut String,
    params: &mut Vec<crate::db::ParamValue>,
    center_id: Option<i64>,
) {
    if let Some(cid) = center_id {
        let idx = params.len() + 1;
        sql.push_str(&format!(" AND d.center_id = ?{idx}"));
        params.push(crate::db::into_param_value(cid));
    }
}

pub async fn index(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<DepartmentStatsQuery>,
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

    let mut sql = format!("{DEPT_SELECT} WHERE d.organization_id = ?1");
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    append_center_filter(&mut sql, &mut params, query.center_id);
    sql.push_str(" ORDER BY COALESCE(d.created_at, '') DESC, d.id DESC");

    let depts: Vec<serde_json::Value> = conn.query_map(&sql, &params, department_json);
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

    let sql = format!("{DEPT_SELECT} WHERE d.id = ?1 AND d.organization_id = ?2");
    match conn.query_row(
        &sql,
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

    if body.center_id <= 0 || !center_in_organization(&conn, body.center_id, org_id) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid branch"));
    }
    if let Err(resp) = crate::branch_scope::ensure_center_allowed(&actor_scope(&conn, &claims), Some(body.center_id)) {
        return resp;
    }

    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let description = crate::validation::normalize_optional(body.description.clone());
    let is_active = if body.is_active.unwrap_or(true) { 1 } else { 0 };
    let slug = unique_department_slug(&conn, org_id, body.center_id, &name, None);
    let now = chrono::Utc::now().naive_utc();

    match conn.execute(
        "INSERT INTO departments (name, slug, description, is_active, organization_id, center_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        crate::params![name, slug, description, is_active, org_id, body.center_id, now, now],
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

    if body.center_id <= 0 || !center_in_organization(&conn, body.center_id, org_id) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid branch"));
    }
    if let Err(resp) = crate::branch_scope::ensure_center_allowed(&actor_scope(&conn, &claims), Some(body.center_id)) {
        return resp;
    }

    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let description = crate::validation::normalize_optional(body.description.clone());
    let is_active = if body.is_active.unwrap_or(true) { 1 } else { 0 };
    let now = chrono::Utc::now().naive_utc();
    let id = path.into_inner();
    let slug = unique_department_slug(&conn, org_id, body.center_id, &name, Some(id));

    match conn.execute(
        "UPDATE departments SET name = ?1, slug = ?2, description = ?3, is_active = ?4, center_id = ?5, updated_at = ?6
         WHERE id = ?7 AND organization_id = ?8",
        crate::params![name, slug, description, is_active, body.center_id, now, id, org_id],
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

pub async fn stats(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<DepartmentStatsQuery>,
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

    let mut where_sql = String::from("organization_id = ?1");
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    if let Some(cid) = query.center_id {
        where_sql.push_str(" AND center_id = ?2");
        params.push(crate::db::into_param_value(cid));
    }

    let count_sql = format!("SELECT COUNT(*) FROM departments WHERE {where_sql}");
    let total: i64 = conn
        .query_row(&count_sql, &params, |r| r.get_idx::<i64>(0))
        .unwrap_or(0);

    let active_sql = format!(
        "SELECT COUNT(*) FROM departments WHERE {where_sql} AND COALESCE(is_active, 1) != 0"
    );
    let active: i64 = conn
        .query_row(&active_sql, &params, |r| r.get_idx::<i64>(0))
        .unwrap_or(0);

    let inactive = total.saturating_sub(active);

    let with_users_sql = format!(
        "SELECT COUNT(DISTINCT d.id)
         FROM departments d
         INNER JOIN users u ON u.department_id = d.id AND u.organization_id = d.organization_id
         WHERE d.organization_id = ?1{}",
        if query.center_id.is_some() { " AND d.center_id = ?2" } else { "" }
    );
    let with_users: i64 = conn
        .query_row(&with_users_sql, &params, |r| r.get_idx::<i64>(0))
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
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    if query.compact.unwrap_or(0) != 0 {
        let scope = actor_scope(&conn, &claims);
        let mut sql = String::from(
            "SELECT id, name, center_id FROM departments
             WHERE organization_id = ?1 AND COALESCE(is_active, 1) != 0",
        );
        let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
        append_center_id_filter(&mut sql, &mut params, &scope, "center_id");
        sql.push_str(" ORDER BY id DESC");
        let items: Vec<serde_json::Value> = conn
            .query_map(&sql, &params, |row| {
                Ok(serde_json::json!({
                    "id": row.get_idx::<i64>(0)?,
                    "name": row.get_idx::<String>(1)?,
                    "center_id": row.get_idx::<Option<i64>>(2)?,
                }))
            });
        return HttpResponse::Ok().json(ApiResponse::success(items));
    }

    let mut sql = format!("{DEPT_SELECT} WHERE d.organization_id = ?1");
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];

    if let Some(ref search) = query.search {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            let p1 = params.len() + 1;
            let p2 = params.len() + 2;
            sql.push_str(&format!(
                " AND (d.name LIKE ?{p1} OR COALESCE(d.description, '') LIKE ?{p2})"
            ));
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

    append_center_filter(&mut sql, &mut params, query.center_id);

    let scope = actor_scope(&conn, &claims);
    append_center_id_filter(&mut sql, &mut params, &scope, "d.center_id");

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
        let offset = (page - 1) * per_page;
        sql.push_str(&format!(" LIMIT {per_page} OFFSET {offset}"));
    }

    let count_sql = sql
        .replace(
            "SELECT d.*,\n                c.name AS center_name,\n                (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.organization_id = d.organization_id) AS users_count",
            "SELECT COUNT(*)",
        )
        .split(" ORDER BY ")
        .next()
        .unwrap_or("")
        .to_string();

    let total: i64 = conn
        .query_row(&count_sql, &params, |row| row.get_idx::<i64>(0))
        .unwrap_or(0);

    let items: Vec<serde_json::Value> = match conn.query_map_result(&sql, &params, department_json) {
        Ok(rows) => rows,
        Err(e) => {
            log::warn!("departments list row mapping failed: {e}");
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
