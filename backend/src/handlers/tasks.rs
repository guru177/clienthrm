use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool; use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::task::{parse_optional_task_id, Task, TaskStoreBody};
use crate::tenant::{org_id_from_claims, project_in_organization, user_in_organization};

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

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let stmt = conn.prepare("SELECT * FROM tasks WHERE organization_id = ?1 ORDER BY created_at DESC").unwrap();
    let items: Vec<Task> = stmt.query_map([org_id], Task::from_row);
    HttpResponse::Ok().json(ApiResponse::success(items))
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
