use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool; use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::task::{parse_optional_task_id, Task, TaskStoreBody};
use crate::tenant::{org_id_from_claims, project_in_organization, user_in_organization};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct TaskListQuery {
    pub search: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

fn validate_task_refs(
    conn: &crate::db::Connection,
    org_id: i64,
    claims: &crate::models::user::JwtClaims,
    assigned_to: Option<i64>,
    project_id: Option<i64>,
) -> Result<(), HttpResponse> {
    if let Some(uid) = assigned_to {
        if !user_in_organization(conn, uid, org_id) {
            return Err(HttpResponse::BadRequest().json(ApiError::new(
                "Assigned user does not belong to this organization",
            )));
        }
        let scope = crate::branch_scope::actor_branch_scope_from_claims(conn, claims);
        if let Err(resp) =
            crate::branch_scope::require_user_in_scope(conn, uid, org_id, &scope)
        {
            return Err(resp);
        }
    }
    if let Some(pid) = project_id {
        if !project_in_organization(conn, pid, org_id) {
            return Err(HttpResponse::BadRequest().json(ApiError::new(
                "Project does not belong to this organization",
            )));
        }
        let created_by: Option<i64> = conn
            .query_row(
                "SELECT created_by FROM projects WHERE id = ?1 AND organization_id = ?2",
                crate::params![pid, org_id],
                |r| r.get_idx::<Option<i64>>(0),
            )
            .ok()
            .flatten();
        if let Some(created_by) = created_by {
            let scope = crate::branch_scope::actor_branch_scope_from_claims(conn, claims);
            if let Err(resp) =
                crate::branch_scope::require_user_in_scope(conn, created_by, org_id, &scope)
            {
                return Err(resp);
            }
        }
    }
    Ok(())
}

fn require_task_in_scope(
    conn: &crate::db::Connection,
    claims: &crate::models::user::JwtClaims,
    org_id: i64,
    task_id: i64,
) -> Result<(Option<i64>, i64), HttpResponse> {
    let row: Option<(Option<i64>, Option<i64>)> = conn
        .query_row(
            "SELECT assigned_to, created_by FROM tasks WHERE id = ?1 AND organization_id = ?2",
            crate::params![task_id, org_id],
            |r| Ok((r.get_idx::<Option<i64>>(0)?, r.get_idx::<Option<i64>>(1)?)),
        )
        .ok();
    let Some((assigned_to, created_by)) = row else {
        return Err(HttpResponse::NotFound().json(ApiError::new("Not found")));
    };
    let scope_user = assigned_to.or(created_by).unwrap_or(claims.sub);
    let scope = crate::branch_scope::actor_branch_scope_from_claims(conn, claims);
    if let Err(resp) =
        crate::branch_scope::require_user_in_scope(conn, scope_user, org_id, &scope)
    {
        return Err(resp);
    }
    Ok((assigned_to, created_by.unwrap_or(claims.sub)))
}

pub async fn index(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<TaskListQuery>,
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
        "SELECT t.* FROM tasks t
         LEFT JOIN users u ON u.id = COALESCE(t.assigned_to, t.created_by)
         WHERE t.organization_id = ?",
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
            sql.push_str(" AND (t.title LIKE ? OR COALESCE(t.description, '') LIKE ?)");
            let pattern = format!("%{trimmed}%");
            params.push(crate::db::into_param_value(pattern.clone()));
            params.push(crate::db::into_param_value(pattern));
        }
    }
    if let Some(ref status) = query.status {
        let trimmed = status.trim();
        if !trimmed.is_empty() && trimmed != "all" {
            sql.push_str(" AND t.status = ?");
            params.push(crate::db::into_param_value(trimmed));
        }
    }
    if let Some(ref priority) = query.priority {
        let trimmed = priority.trim();
        if !trimmed.is_empty() && trimmed != "all" {
            sql.push_str(" AND t.priority = ?");
            params.push(crate::db::into_param_value(trimmed));
        }
    }

    let sort_col = match query.sort_by.as_deref() {
        Some("title") => "t.title",
        Some("status") => "t.status",
        Some("priority") => "t.priority",
        Some("due_date") => "t.due_date",
        Some("updated_at") => "t.updated_at",
        _ => "t.created_at",
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
        base.replacen("SELECT t.*", "SELECT COUNT(*)", 1)
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
    let items: Vec<Task> = stmt.query_map(&params, Task::from_row);

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
    let task_id = path.into_inner();
    if let Err(resp) = require_task_in_scope(&conn, &claims, org_id, task_id) {
        return resp;
    }
    match conn.query_row(
        "SELECT * FROM tasks WHERE id=?1 AND organization_id=?2",
        crate::params![task_id, org_id],
        Task::from_row,
    ) {
        Ok(t) => HttpResponse::Ok().json(ApiResponse::success(t)),
        Err(_) => HttpResponse::NotFound().json(ApiError::new("Not found")),
    }
}

pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<TaskStoreBody>,
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
    let title = match crate::validation::require_non_empty(&body.title, "Title") {
        Ok(t) => t,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let assigned_to = parse_optional_task_id(&body.assigned_to);
    let project_id = parse_optional_task_id(&body.project_id);
    if let Err(resp) = validate_task_refs(&conn, org_id, &claims, assigned_to, project_id) {
        return resp;
    }
    let priority = body
        .priority
        .as_deref()
        .filter(|p| !p.is_empty())
        .unwrap_or("medium");
    match conn.execute(
        "INSERT INTO tasks (title,description,status,priority,assigned_to,project_id,due_date,\"type\",created_by,organization_id,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        crate::params![
            title,
            body.description,
            body.status.as_deref().unwrap_or("todo"),
            priority,
            assigned_to,
            project_id,
            body.due_date,
            body.development_type,
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
    body: web::Json<crate::models::task::CreateTaskRequest>,
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
    let task_id = path.into_inner();
    if let Err(resp) = require_task_in_scope(&conn, &claims, org_id, task_id) {
        return resp;
    }
    let title = match crate::validation::require_non_empty(&body.title, "Title") {
        Ok(t) => t,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let assigned_to = body.assigned_to;
    let project_id = body.project_id;
    if let Err(resp) = validate_task_refs(&conn, org_id, &claims, assigned_to, project_id) {
        return resp;
    }
    match conn.execute(
        "UPDATE tasks SET title=?1,description=?2,status=?3,priority=?4,assigned_to=?5,project_id=?6,due_date=?7,\"type\"=?8,updated_at=?9 WHERE id=?10 AND organization_id=?11",
        crate::params![
            title,
            body.description,
            body.status,
            body.priority,
            assigned_to,
            project_id,
            body.due_date,
            body.development_type,
            &now,
            task_id,
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
    let task_id = path.into_inner();
    if let Err(resp) = require_task_in_scope(&conn, &claims, org_id, task_id) {
        return resp;
    }
    match conn.execute(
        "DELETE FROM tasks WHERE id=?1 AND organization_id=?2",
        crate::params![task_id, org_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Not found")),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn update_status(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<crate::models::task::UpdateTaskStatusRequest>,
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
    let task_id = path.into_inner();
    if let Err(resp) = require_task_in_scope(&conn, &claims, org_id, task_id) {
        return resp;
    }
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "UPDATE tasks SET status=?1,updated_at=?2 WHERE id=?3 AND organization_id=?4",
        crate::params![body.status, &now, task_id, org_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Not found")),
        Ok(_) => {
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Status updated"})))
        }
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}
