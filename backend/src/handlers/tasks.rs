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
    assigned_to: Option<i64>,
    project_id: Option<i64>,
) -> Result<(), String> {
    if let Some(uid) = assigned_to {
        if !user_in_organization(conn, uid, org_id) {
            return Err("Assigned user does not belong to this organization".into());
        }
    }
    if let Some(pid) = project_id {
        if !project_in_organization(conn, pid, org_id) {
            return Err("Project does not belong to this organization".into());
        }
    }
    Ok(())
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

    let mut sql = String::from("SELECT * FROM tasks WHERE organization_id = ?1");
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];

    if let Some(ref search) = query.search {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            let idx = params.len() + 1;
            sql.push_str(&format!(
                " AND (title LIKE ?{idx} OR COALESCE(description, '') LIKE ?{})",
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
    if let Some(ref priority) = query.priority {
        let trimmed = priority.trim();
        if !trimmed.is_empty() && trimmed != "all" {
            let idx = params.len() + 1;
            sql.push_str(&format!(" AND priority = ?{idx}"));
            params.push(crate::db::into_param_value(trimmed));
        }
    }

    let sort_col = match query.sort_by.as_deref() {
        Some("title") => "title",
        Some("status") => "status",
        Some("priority") => "priority",
        Some("due_date") => "due_date",
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
    // Frontend always sends page/per_page — always paginate.
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
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    match conn.query_row(
        "SELECT * FROM tasks WHERE id=?1 AND organization_id=?2",
        crate::params![path.into_inner(), org_id],
        Task::from_row,
    ) {
        Ok(t)=>HttpResponse::Ok().json(ApiResponse::success(t)), Err(_)=>HttpResponse::NotFound().json(ApiError::new("Not found"))
    }
}
pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<TaskStoreBody>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let title = match crate::validation::require_non_empty(&body.title, "Title") {
        Ok(t) => t,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let assigned_to = parse_optional_task_id(&body.assigned_to);
    let project_id = parse_optional_task_id(&body.project_id);
    if let Err(msg) = validate_task_refs(&conn, org_id, assigned_to, project_id) {
        return HttpResponse::BadRequest().json(ApiError::new(&msg));
    }
    let priority = body
        .priority
        .as_deref()
        .filter(|p| !p.is_empty())
        .unwrap_or("medium");
    match conn.execute(
        "INSERT INTO tasks (title,description,status,priority,assigned_to,project_id,due_date,\"type\",created_by,organization_id,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        crate::params![title, body.description, body.status.as_deref().unwrap_or("todo"), priority, assigned_to, project_id, body.due_date, body.development_type, claims.sub, org_id, &now, &now],
    ) {
        Ok(_)=>HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"id": conn.last_insert_rowid()}))),
        Err(e)=>HttpResponse::BadRequest().json(ApiError::new(&format!("{}",e)))
    }
}
pub async fn update(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<crate::models::task::CreateTaskRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let title = match crate::validation::require_non_empty(&body.title, "Title") {
        Ok(t) => t,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let assigned_to = body.assigned_to;
    let project_id = body.project_id;
    if let Err(msg) = validate_task_refs(&conn, org_id, assigned_to, project_id) {
        return HttpResponse::BadRequest().json(ApiError::new(&msg));
    }
    match conn.execute(
        "UPDATE tasks SET title=?1,description=?2,status=?3,priority=?4,assigned_to=?5,project_id=?6,due_date=?7,\"type\"=?8,updated_at=?9 WHERE id=?10 AND organization_id=?11",
        crate::params![title, body.description, body.status, body.priority, assigned_to, project_id, body.due_date, body.development_type, &now, path.into_inner(), org_id],
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
        "DELETE FROM tasks WHERE id=?1 AND organization_id=?2",
        crate::params![path.into_inner(), org_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Not found")),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}
pub async fn update_status(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<crate::models::task::UpdateTaskStatusRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "UPDATE tasks SET status=?1,updated_at=?2 WHERE id=?3 AND organization_id=?4",
        crate::params![body.status, &now, path.into_inner(), org_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Not found")),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Status updated"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}
