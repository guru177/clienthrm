use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::workflow::Workflow;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;
use crate::workflow_logic::{normalize_workflow_actions, validate_workflow_actions, validate_workflow_trigger};

#[derive(Debug, Deserialize)]
pub struct WorkflowListQuery {
    pub search: Option<String>,
    pub status: Option<String>,
    pub trigger_type: Option<String>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

fn actions_json(actions: Option<&serde_json::Value>) -> String {
    let raw = actions.cloned().unwrap_or_else(|| serde_json::json!([]));
    normalize_workflow_actions(&raw).to_string()
}

pub async fn index(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<WorkflowListQuery>,
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

    let mut sql = String::from(
        "SELECT w.*,
                (SELECT MAX(we.created_at) FROM workflow_executions we WHERE we.workflow_id = w.id) AS last_executed_at
         FROM workflows w WHERE w.organization_id = ?1",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];

    if let Some(ref search) = query.search {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            sql.push_str(" AND (w.name LIKE ?2 OR COALESCE(w.description, '') LIKE ?3)");
            let pattern = format!("%{}%", trimmed);
            params.push(crate::db::into_param_value(pattern.clone()));
            params.push(crate::db::into_param_value(pattern));
        }
    }

    if let Some(ref status) = query.status {
        match status.as_str() {
            "active" => sql.push_str(" AND w.is_active = 1"),
            "inactive" => sql.push_str(" AND w.is_active = 0"),
            _ => {}
        }
    }

    if let Some(ref trigger) = query.trigger_type {
        let trimmed = trigger.trim();
        if !trimmed.is_empty() && trimmed != "all" {
            let idx = params.len() + 1;
            sql.push_str(&format!(" AND w.trigger_type = ?{idx}"));
            params.push(crate::db::into_param_value(trimmed));
        }
    }

    let sort_col = match query.sort_by.as_deref() {
        Some("name") => "w.name",
        Some("trigger_type") => "w.trigger_type",
        Some("execution_count") => "w.execution_count",
        Some("created_at") => "w.created_at",
        Some("updated_at") => "w.updated_at",
        _ => "w.created_at",
    };
    let sort_dir = if query.sort_order.as_deref() == Some("asc") {
        "ASC"
    } else {
        "DESC"
    };
    sql.push_str(&format!(" ORDER BY {sort_col} {sort_dir}"));

    let use_pagination = query.page.is_some() || query.per_page.is_some();
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(15).clamp(1, 100);

    if use_pagination {
        sql.push_str(" LIMIT ? OFFSET ?");
    }

    let count_sql = sql
        .replace(
            "SELECT w.*,\n                (SELECT MAX(we.created_at) FROM workflow_executions we WHERE we.workflow_id = w.id) AS last_executed_at",
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
                .json(ApiError::new(&format!("Query error: {}", e)))
        }
    };

    let items: Vec<serde_json::Value> = stmt.query_map(&params, |row| {
            let w = Workflow::from_row(row)?;
            let last_executed_at: Option<String> = row.get("last_executed_at").ok();
            Ok(serde_json::json!({
                "id": w.id,
                "name": w.name,
                "description": w.description,
                "trigger_type": w.trigger_type,
                "trigger_conditions": w.trigger_conditions,
                "actions": w.actions,
                "is_active": w.is_active,
                "execution_count": w.execution_count,
                "created_at": w.created_at,
                "updated_at": w.updated_at,
                "last_executed_at": last_executed_at,
            }))
        });

    if use_pagination {
        let last_page = ((total as f64) / (per_page as f64)).ceil().max(1.0) as i64;
        let from = if total == 0 { 0 } else { (page - 1) * per_page + 1 };
        let to = (page * per_page).min(total);
        return HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "data": items,
            "current_page": page,
            "last_page": last_page,
            "per_page": per_page,
            "total": total,
            "from": from,
            "to": to,
        })));
    }

    HttpResponse::Ok().json(ApiResponse::success(items))
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
    let id = path.into_inner();
    match conn.query_row(
        "SELECT w.*,
                (SELECT MAX(we.created_at) FROM workflow_executions we WHERE we.workflow_id = w.id) AS last_executed_at,
                u.id AS creator_id, u.name AS creator_name
         FROM workflows w
         LEFT JOIN users u ON u.id = w.created_by
         WHERE w.id = ?1 AND w.organization_id = ?2",
        crate::params![id, org_id],
        |row| {
            let w = Workflow::from_row(row)?;
            let last_executed_at: Option<String> = row.get("last_executed_at").ok();
            let creator_id: Option<i64> = row.get("creator_id").ok();
            let creator_name: Option<String> = row.get("creator_name").ok();
            Ok(serde_json::json!({
                "id": w.id,
                "name": w.name,
                "description": w.description,
                "trigger_type": w.trigger_type,
                "trigger_conditions": w.trigger_conditions,
                "actions": w.actions,
                "is_active": w.is_active,
                "execution_count": w.execution_count,
                "created_at": w.created_at,
                "updated_at": w.updated_at,
                "last_executed_at": last_executed_at,
                "created_by": creator_id.map(|id| serde_json::json!({
                    "id": id,
                    "name": creator_name.unwrap_or_else(|| "Unknown".to_string()),
                })),
            }))
        },
    ) {
        Ok(w) => HttpResponse::Ok().json(ApiResponse::success(w)),
        Err(_) => HttpResponse::NotFound().json(ApiError::new("Not found")),
    }
}

pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<crate::models::workflow::CreateWorkflowRequest>,
) -> HttpResponse {
    let c = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&c);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    if let Err(msg) = validate_workflow_trigger(body.trigger_type.as_deref().unwrap_or("")) {
        return HttpResponse::BadRequest().json(ApiError::new(&msg));
    }
    let actions = match &body.actions {
        Some(a) => a,
        None => {
            return HttpResponse::BadRequest()
                .json(ApiError::new("At least one workflow action is required"));
        }
    };
    if let Err(msg) = validate_workflow_actions(actions) {
        return HttpResponse::BadRequest().json(ApiError::new(&msg));
    }
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let actions_str = actions_json(body.actions.as_ref());
    let trigger_conditions_str = body.trigger_conditions.as_ref().map(|v| v.to_string());
    let is_active = body.is_active.unwrap_or(true);
    let user_id = c.sub;
    match conn.execute(
        "INSERT INTO workflows (name,description,trigger_type,trigger_conditions,actions,is_active,execution_count,created_by,organization_id,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,0,?7,?8,?9,?10)",
        crate::params![
            name,
            body.description,
            body.trigger_type,
            trigger_conditions_str,
            actions_str,
            is_active,
            user_id,
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
    body: web::Json<crate::models::workflow::CreateWorkflowRequest>,
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
    if let Err(msg) = validate_workflow_trigger(body.trigger_type.as_deref().unwrap_or("")) {
        return HttpResponse::BadRequest().json(ApiError::new(&msg));
    }
    let actions = match &body.actions {
        Some(a) => a,
        None => {
            return HttpResponse::BadRequest()
                .json(ApiError::new("At least one workflow action is required"));
        }
    };
    if let Err(msg) = validate_workflow_actions(actions) {
        return HttpResponse::BadRequest().json(ApiError::new(&msg));
    }
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let actions_str = actions_json(body.actions.as_ref());
    let trigger_conditions_str = body.trigger_conditions.as_ref().map(|v| v.to_string());
    let is_active = body.is_active.unwrap_or(true);
    match conn.execute(
        "UPDATE workflows SET name=?1,description=?2,trigger_type=?3,trigger_conditions=?4,actions=?5,is_active=?6,updated_at=?7 WHERE id=?8 AND organization_id=?9",
        crate::params![
            name,
            body.description,
            body.trigger_type,
            trigger_conditions_str,
            actions_str,
            is_active,
            &now,
            path.into_inner(),
            org_id
        ],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Not found")),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
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
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    match conn.execute(
        "DELETE FROM workflows WHERE id=?1 AND organization_id=?2",
        crate::params![path.into_inner(), org_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Not found")),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn toggle(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    match conn.execute(
        "UPDATE workflows SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id=?1 AND organization_id=?2",
        crate::params![path.into_inner(), org_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Not found")),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Toggled"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn duplicate(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let c = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&c);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let id = path.into_inner();
    let source = match conn.query_row(
        "SELECT * FROM workflows WHERE id=?1 AND organization_id=?2",
        crate::params![id, org_id],
        Workflow::from_row,
    ) {
        Ok(w) => w,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Not found")),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let name = format!("{} (Copy)", source.name);
    let actions_str = actions_json(source.actions.as_ref());
    let trigger_conditions_str = source.trigger_conditions.as_ref().map(|v| v.to_string());
    let is_active = source.is_active;
    match conn.execute(
        "INSERT INTO workflows (name,description,trigger_type,trigger_conditions,actions,is_active,execution_count,created_by,organization_id,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,0,?7,?8,?9,?10)",
        crate::params![
            name,
            source.description,
            source.trigger_type,
            trigger_conditions_str,
            actions_str,
            is_active,
            c.sub,
            org_id,
            &now,
            &now,
        ],
    ) {
        Ok(_) => HttpResponse::Created()
            .json(ApiResponse::success(serde_json::json!({"id": conn.last_insert_rowid()}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

/// GET /api/admin/workflows/{id}/executions — audit trail for a workflow.
pub async fn executions(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let workflow_id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM workflows WHERE id = ?1 AND organization_id = ?2",
            crate::params![workflow_id, org_id],
            |_| Ok(()),
        )
        .is_ok();
    if !exists {
        return HttpResponse::NotFound().json(ApiError::new("Workflow not found"));
    }
    let stmt = match conn.prepare(
        "SELECT id, status, trigger_type, created_at, updated_at
         FROM workflow_executions
         WHERE workflow_id = ?1
         ORDER BY id DESC
         LIMIT 100",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let rows: Vec<serde_json::Value> = stmt
        .query_map(crate::params![workflow_id], |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "status": row.get_idx::<String>(1)?,
                "trigger_type": row.get_idx::<Option<String>>(2)?,
                "created_at": row.get_idx::<Option<String>>(3)?,
                "updated_at": row.get_idx::<Option<String>>(4)?,
            }))
        });
    HttpResponse::Ok().json(ApiResponse::success(rows))
}
