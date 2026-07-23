//! Advanced payroll APIs: variable pay, reimbursements, runs, compliance, disbursement, pay groups.

use actix_web::{web, HttpRequest, HttpResponse};
use chrono::Datelike;
use serde::Deserialize;

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;

fn now_str() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn audit_log(
    conn: &crate::db::Connection,
    org_id: i64,
    run_id: Option<i64>,
    actor: i64,
    action: &str,
    detail: &str,
) {
    let _ = conn.execute(
        "INSERT INTO payroll_audit_log (organization_id, payroll_run_id, actor_user_id, action, detail, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        crate::params![org_id, run_id, actor, action, detail, now_str()],
    );
}

// ─── Variable pay ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct VariablePayRequest {
    pub user_id: i64,
    pub month: i32,
    pub year: i32,
    pub item_type: String,
    pub label: String,
    pub amount: f64,
    pub notes: Option<String>,
}

/// Query params arrive as strings via `serde_json::Value`; accept both string and number.
fn query_i32(q: &serde_json::Value, key: &str, default: i32) -> i32 {
    match q.get(key) {
        Some(serde_json::Value::Number(n)) => n.as_i64().unwrap_or(default as i64) as i32,
        Some(serde_json::Value::String(s)) => s.parse().unwrap_or(default),
        _ => default,
    }
}

fn query_i64_opt(q: &serde_json::Value, key: &str) -> Option<i64> {
    match q.get(key) {
        Some(serde_json::Value::Number(n)) => n.as_i64(),
        Some(serde_json::Value::String(s)) => s.parse().ok(),
        _ => None,
    }
}

pub async fn variable_pay_list(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<serde_json::Value>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let month = query_i32(&query, "month", 0);
    let year = query_i32(&query, "year", 0);
    let filter_user_id = query_i64_opt(&query, "user_id");
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    let mut sql = String::from(
        "SELECT v.id, v.user_id, u.name, v.item_type, v.label, v.amount, v.status, v.notes
         FROM payroll_variable_items v
         JOIN users u ON u.id = v.user_id AND u.organization_id = ?1
         WHERE v.organization_id = ?1 AND v.month = ?2 AND v.year = ?3",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![
        crate::db::into_param_value(org_id),
        crate::db::into_param_value(month),
        crate::db::into_param_value(year),
    ];
    if let Some(uid) = filter_user_id {
        params.push(crate::db::into_param_value(uid));
        let n = params.len();
        sql.push_str(&format!(" AND v.user_id = ?{n}"));
    }
    crate::branch_scope::append_users_branch_filter(&mut sql, &mut params, &scope, "u");
    sql.push_str(" ORDER BY v.id DESC");
    let rows: Vec<serde_json::Value> = match conn.prepare(&sql) {
        Ok(stmt) => stmt.query_map(&params, |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "user_id": row.get_idx::<i64>(1)?,
                "user_name": row.get_idx::<String>(2)?,
                "item_type": row.get_idx::<String>(3)?,
                "label": row.get_idx::<String>(4)?,
                "amount": row.get_idx::<f64>(5)?,
                "status": row.get_idx::<String>(6)?,
                "notes": row.get_idx::<Option<String>>(7)?,
            }))
        }),
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    HttpResponse::Ok().json(ApiResponse::success(rows))
}

pub async fn variable_pay_store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<VariablePayRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let actor = claims.sub;
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Err(resp) =
        crate::branch_scope::require_user_in_scope(&conn, body.user_id, org_id, &scope)
    {
        return resp;
    }
    let now = now_str();
    if conn
        .execute(
            "INSERT INTO payroll_variable_items
             (organization_id, user_id, month, year, item_type, label, amount, status, notes, created_by, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'approved', ?8, ?9, ?10, ?10)",
            crate::params![
                org_id,
                body.user_id,
                body.month,
                body.year,
                &body.item_type,
                &body.label,
                body.amount,
                body.notes.as_deref().unwrap_or(""),
                actor,
                &now,
            ],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to add variable pay"));
    }
    let id = conn.last_insert_rowid();
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "id": id,
        "message": "Bonus added for this payroll month",
    })))
}

pub async fn variable_pay_destroy(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let owner_id: Option<i64> = conn
        .query_row(
            "SELECT user_id FROM payroll_variable_items WHERE id = ?1 AND organization_id = ?2",
            crate::params![id, org_id],
            |r| r.get_idx::<i64>(0),
        )
        .ok();
    let Some(owner_id) = owner_id else {
        return HttpResponse::NotFound().json(ApiError::new("Variable pay item not found"));
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Err(resp) =
        crate::branch_scope::require_user_in_scope(&conn, owner_id, org_id, &scope)
    {
        return resp;
    }
    let _ = conn.execute(
        "DELETE FROM payroll_variable_items WHERE id = ?1 AND organization_id = ?2",
        crate::params![id, org_id],
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "deleted": true })))
}

// ─── Reimbursement claims ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ReimbursementClaimRequest {
    pub title: String,
    pub amount: f64,
    pub claim_month: i32,
    pub claim_year: i32,
    pub salary_component_id: Option<i64>,
    pub receipt_url: Option<String>,
}

pub async fn reimbursement_list(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<serde_json::Value>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let status = query.get("status").and_then(|v| v.as_str()).unwrap_or("");
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    let mut sql = String::from(
        "SELECT r.id, r.user_id, u.name, r.title, r.amount, r.status, r.claim_month, r.claim_year, r.created_at
         FROM reimbursement_claims r JOIN users u ON u.id = r.user_id
         WHERE r.organization_id = ?1",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    if !status.is_empty() {
        sql.push_str(" AND r.status = ?2");
        params.push(crate::db::into_param_value(status.to_string()));
    }
    crate::branch_scope::append_users_branch_filter(&mut sql, &mut params, &scope, "u");
    sql.push_str(" ORDER BY r.id DESC LIMIT 200");
    let rows: Vec<serde_json::Value> = conn
        .prepare(&sql)
        .map(|stmt| {
            stmt.query_map(&params, |row| {
                Ok(serde_json::json!({
                    "id": row.get_idx::<i64>(0)?,
                    "user_id": row.get_idx::<i64>(1)?,
                    "user_name": row.get_idx::<String>(2)?,
                    "title": row.get_idx::<String>(3)?,
                    "amount": row.get_idx::<f64>(4)?,
                    "status": row.get_idx::<String>(5)?,
                    "claim_month": row.get_idx::<i32>(6)?,
                    "claim_year": row.get_idx::<i32>(7)?,
                    "created_at": row.get_idx::<String>(8)?,
                }))
            })
        })
        .unwrap_or_default();
    HttpResponse::Ok().json(ApiResponse::success(rows))
}

pub async fn reimbursement_store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<ReimbursementClaimRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = claims.sub;
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let now = now_str();
    if conn
        .execute(
            "INSERT INTO reimbursement_claims
             (organization_id, user_id, salary_component_id, claim_month, claim_year, title, amount, receipt_url, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9, ?9)",
            crate::params![
                org_id,
                user_id,
                body.salary_component_id,
                body.claim_month,
                body.claim_year,
                &body.title,
                body.amount,
                body.receipt_url.as_deref().unwrap_or(""),
                &now,
            ],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to submit claim"));
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "id": conn.last_insert_rowid() })))
}

#[derive(Debug, Deserialize)]
pub struct ReimbursementReviewRequest {
    pub status: String,
    pub review_notes: Option<String>,
    pub payroll_month: Option<i32>,
    pub payroll_year: Option<i32>,
}

pub async fn reimbursement_review(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<ReimbursementReviewRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let reviewer = claims.sub;
    let id = path.into_inner();
    if !matches!(body.status.as_str(), "approved" | "rejected") {
        return HttpResponse::BadRequest().json(ApiError::new("status must be approved or rejected"));
    }
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let claim_user_id: Option<i64> = conn
        .query_row(
            "SELECT user_id FROM reimbursement_claims WHERE id = ?1 AND organization_id = ?2",
            crate::params![id, org_id],
            |r| r.get_idx::<i64>(0),
        )
        .ok();
    let Some(claim_user_id) = claim_user_id else {
        return HttpResponse::NotFound().json(ApiError::new("Claim not found"));
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Err(resp) =
        crate::branch_scope::require_user_in_scope(&conn, claim_user_id, org_id, &scope)
    {
        return resp;
    }
    let now = now_str();
    let updated = conn.execute(
        "UPDATE reimbursement_claims SET status=?1, reviewed_by=?2, reviewed_at=?3, review_notes=?4,
         payroll_month=?5, payroll_year=?6, updated_at=?3
         WHERE id=?7 AND organization_id=?8",
        crate::params![
            &body.status,
            reviewer,
            &now,
            body.review_notes.as_deref().unwrap_or(""),
            body.payroll_month,
            body.payroll_year,
            id,
            org_id,
        ],
    );
    if updated.unwrap_or(0) == 0 {
        return HttpResponse::NotFound().json(ApiError::new("Claim not found"));
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "updated": true })))
}

// ─── Payroll runs & approval ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PayrollRunRequest {
    pub month: i32,
    pub year: i32,
    pub run_type: Option<String>,
    pub pay_group_id: Option<i64>,
    pub notes: Option<String>,
}

pub async fn payroll_runs_list(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<serde_json::Value>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let month = query.get("month").and_then(|v| v.as_i64());
    let year = query.get("year").and_then(|v| v.as_i64());
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let rows: Vec<serde_json::Value> = if let (Some(m), Some(y)) = (month, year) {
        let stmt = conn.prepare(
            "SELECT id, run_type, month, year, status, pay_group_id, notes, created_at FROM payroll_runs
             WHERE organization_id = ?1 AND month = ?2 AND year = ?3 ORDER BY id DESC",
        ).ok();
        stmt.map(|s| {
            s.query_map(crate::params![org_id, m as i32, y as i32], |row| {
                Ok(serde_json::json!({
                    "id": row.get_idx::<i64>(0)?,
                    "run_type": row.get_idx::<String>(1)?,
                    "month": row.get_idx::<i32>(2)?,
                    "year": row.get_idx::<i32>(3)?,
                    "status": row.get_idx::<String>(4)?,
                    "pay_group_id": row.get_idx::<Option<i64>>(5)?,
                    "notes": row.get_idx::<Option<String>>(6)?,
                    "created_at": row.get_idx::<String>(7)?,
                }))
            })
        }).unwrap_or_default()
    } else {
        let stmt = conn.prepare(
            "SELECT id, run_type, month, year, status, pay_group_id, notes, created_at FROM payroll_runs
             WHERE organization_id = ?1 ORDER BY id DESC LIMIT 24",
        ).ok();
        stmt.map(|s| {
            s.query_map([org_id], |row| {
                Ok(serde_json::json!({
                    "id": row.get_idx::<i64>(0)?,
                    "run_type": row.get_idx::<String>(1)?,
                    "month": row.get_idx::<i32>(2)?,
                    "year": row.get_idx::<i32>(3)?,
                    "status": row.get_idx::<String>(4)?,
                    "pay_group_id": row.get_idx::<Option<i64>>(5)?,
                    "notes": row.get_idx::<Option<String>>(6)?,
                    "created_at": row.get_idx::<String>(7)?,
                }))
            })
        }).unwrap_or_default()
    };
    HttpResponse::Ok().json(ApiResponse::success(rows))
}

pub async fn payroll_run_store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<PayrollRunRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let actor = claims.sub;
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let now = now_str();
    let run_type = body.run_type.as_deref().unwrap_or("monthly");
    conn.execute(
        "INSERT INTO payroll_runs (organization_id, run_type, month, year, pay_group_id, status, prepared_by, prepared_at, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'draft', ?6, ?7, ?8, ?7, ?7)",
        crate::params![org_id, run_type, body.month, body.year, body.pay_group_id, actor, &now, body.notes.as_deref().unwrap_or("")],
    ).ok();
    let id = conn.last_insert_rowid();
    audit_log(&conn, org_id, Some(id), actor, "run_created", &format!("{run_type} {}/{}", body.month, body.year));
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "id": id })))
}

#[derive(Debug, Deserialize)]
pub struct PayrollRunActionRequest {
    pub action: String,
    pub notes: Option<String>,
}

pub async fn payroll_run_action(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<PayrollRunActionRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let actor = claims.sub;
    let run_id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let now = now_str();
    let (col, status) = match body.action.as_str() {
        "review" => ("reviewed", "reviewed"),
        "approve" => ("approved", "approved"),
        "release" => ("released", "released"),
        _ => return HttpResponse::BadRequest().json(ApiError::new("action must be review, approve, or release")),
    };
    if body.action.as_str() == "approve" {
        let is_sa = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
        let perms = crate::middleware::rbac::load_user_permissions(&conn, claims.sub, is_sa);
        let can_approve = crate::middleware::rbac::has_permission(&perms, "approve-payroll")
            || crate::middleware::rbac::has_permission(&perms, "manage-payroll");
        if !can_approve {
            return HttpResponse::Forbidden().json(ApiError::new(
                "approve-payroll or manage-payroll permission required",
            ));
        }
    }
    let sql = format!(
        "UPDATE payroll_runs SET status = ?1, {col}_by = ?2, {col}_at = ?3, updated_at = ?3 WHERE id = ?4 AND organization_id = ?5"
    );
    let updated = conn.execute(&sql, crate::params![status, actor, &now, run_id, org_id]);
    if updated.unwrap_or(0) == 0 {
        return HttpResponse::NotFound().json(ApiError::new("Run not found"));
    }
    audit_log(&conn, org_id, Some(run_id), actor, &body.action, body.notes.as_deref().unwrap_or(""));
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "status": status })))
}

pub async fn payroll_checklist(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<serde_json::Value>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let month = query.get("month").and_then(|v| v.as_i64()).unwrap_or(1) as i32;
    let year = query.get("year").and_then(|v| v.as_i64()).unwrap_or(2026) as i32;
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);

    let mut leave_sql = String::from(
        "SELECT COUNT(*) FROM leave_requests lr JOIN users u ON u.id = lr.user_id
         WHERE u.organization_id = ?1 AND lr.status = 'pending' AND lr.deleted_at IS NULL",
    );
    let mut leave_params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    crate::branch_scope::append_users_branch_filter(&mut leave_sql, &mut leave_params, &scope, "u");
    let pending_leave: i64 = conn
        .query_row(&leave_sql, &leave_params, |r| r.get_idx::<i64>(0))
        .unwrap_or(0);

    let mut no_salary_sql = String::from(
        "SELECT COUNT(*) FROM users u WHERE u.organization_id = ?1 AND u.deleted_at IS NULL AND u.is_super_admin = 0
         AND NOT EXISTS (
           SELECT 1 FROM employee_salary_profiles esp WHERE esp.user_id = u.id
         ) AND NOT EXISTS (
           SELECT 1 FROM salary_structure_items ssi WHERE ssi.user_id = u.id
         )",
    );
    let mut no_salary_params: Vec<crate::db::ParamValue> =
        vec![crate::db::into_param_value(org_id)];
    crate::branch_scope::append_users_branch_filter(
        &mut no_salary_sql,
        &mut no_salary_params,
        &scope,
        "u",
    );
    let no_salary: i64 = conn
        .query_row(&no_salary_sql, &no_salary_params, |r| r.get_idx::<i64>(0))
        .unwrap_or(0);

    let mut reimb_sql = String::from(
        "SELECT COUNT(*) FROM reimbursement_claims r JOIN users u ON u.id = r.user_id
         WHERE r.organization_id = ?1 AND r.status = 'pending'",
    );
    let mut reimb_params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    crate::branch_scope::append_users_branch_filter(&mut reimb_sql, &mut reimb_params, &scope, "u");
    let pending_reimb: i64 = conn
        .query_row(&reimb_sql, &reimb_params, |r| r.get_idx::<i64>(0))
        .unwrap_or(0);

    let mut gen_sql = String::from(
        "SELECT COUNT(*) FROM payslips p JOIN users u ON u.id = p.user_id
         WHERE u.organization_id = ?1 AND p.month = ?2 AND p.year = ?3 AND p.status = 'generated'",
    );
    let mut gen_params: Vec<crate::db::ParamValue> = vec![
        crate::db::into_param_value(org_id),
        crate::db::into_param_value(month),
        crate::db::into_param_value(year),
    ];
    crate::branch_scope::append_users_branch_filter(&mut gen_sql, &mut gen_params, &scope, "u");
    let generated: i64 = conn
        .query_row(&gen_sql, &gen_params, |r| r.get_idx::<i64>(0))
        .unwrap_or(0);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "pending_leave_requests": pending_leave,
        "employees_without_salary": no_salary,
        "pending_reimbursements": pending_reimb,
        "generated_payslips": generated,
        "ready": pending_leave == 0 && no_salary == 0,
    })))
}

// ─── Salary hold ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PayrollHoldRequest {
    pub hold: bool,
    pub reason: Option<String>,
    pub until: Option<String>,
}

pub async fn set_payroll_hold(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<PayrollHoldRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Err(resp) =
        crate::branch_scope::require_user_in_scope(&conn, user_id, org_id, &scope)
    {
        return resp;
    }
    let updated = conn.execute(
        "UPDATE users SET payroll_hold=?1, payroll_hold_reason=?2, payroll_hold_until=?3, updated_at=?4
         WHERE id=?5 AND organization_id=?6",
        crate::params![
            if body.hold { 1 } else { 0 },
            body.reason.as_deref().unwrap_or(""),
            body.until.as_deref().unwrap_or(""),
            now_str(),
            user_id,
            org_id,
        ],
    );
    if updated.unwrap_or(0) == 0 {
        return HttpResponse::NotFound().json(ApiError::new("User not found"));
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "updated": true })))
}

// ─── Tax declarations ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct TaxDeclarationRequest {
    pub financial_year: String,
    pub regime: Option<String>,
    pub section_80c: Option<f64>,
    pub section_80d: Option<f64>,
    pub other_exemptions: Option<f64>,
    pub hra_rent_paid: Option<f64>,
    pub hra_metro: Option<bool>,
}

pub async fn tax_declaration_save(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<TaxDeclarationRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let user_id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Err(resp) =
        crate::branch_scope::require_user_in_scope(&conn, user_id, org_id, &scope)
    {
        return resp;
    }
    let decl = serde_json::json!({
        "section_80c": body.section_80c.unwrap_or(0.0),
        "section_80d": body.section_80d.unwrap_or(0.0),
        "other_exemptions": body.other_exemptions.unwrap_or(0.0),
    });
    let regime = body.regime.as_deref().unwrap_or("new");
    let now = now_str();
    conn.execute(
        "INSERT INTO employee_tax_declarations (organization_id, user_id, financial_year, regime, declarations_json, hra_rent_paid, hra_metro, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
         ON CONFLICT(user_id, financial_year) DO UPDATE SET
           regime=excluded.regime, declarations_json=excluded.declarations_json,
           hra_rent_paid=excluded.hra_rent_paid, hra_metro=excluded.hra_metro, updated_at=excluded.updated_at",
        crate::params![
            org_id,
            user_id,
            &body.financial_year,
            regime,
            decl.to_string(),
            body.hra_rent_paid.unwrap_or(0.0),
            if body.hra_metro.unwrap_or(false) { 1 } else { 0 },
            &now,
        ],
    ).ok();
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "saved": true })))
}

pub async fn tax_declaration_get(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<(i64, String)>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let (user_id, fy) = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Err(resp) =
        crate::branch_scope::require_user_in_scope(&conn, user_id, org_id, &scope)
    {
        return resp;
    }
    let row = conn.query_row(
        "SELECT regime, declarations_json, hra_rent_paid, hra_metro FROM employee_tax_declarations
         WHERE user_id = ?1 AND financial_year = ?2 AND organization_id = ?3",
        crate::params![user_id, &fy, org_id],
        |r| {
            Ok(serde_json::json!({
                "regime": r.get_idx::<String>(0)?,
                "declarations": r.get_idx::<String>(1)?,
                "hra_rent_paid": r.get_idx::<f64>(2)?,
                "hra_metro": r.get_idx::<i64>(3)? != 0,
            }))
        },
    );
    match row {
        Ok(v) => HttpResponse::Ok().json(ApiResponse::success(v)),
        Err(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({}))),
    }
}

// ─── Pay groups ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PayGroupRequest {
    pub name: String,
    pub frequency: Option<String>,
}

pub async fn pay_groups_list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let stmt = conn.prepare(
        "SELECT id, name, frequency, is_active FROM pay_groups WHERE organization_id = ?1 ORDER BY name",
    ).ok();
    let rows: Vec<serde_json::Value> = stmt
        .map(|s| {
            s.query_map([org_id], |row| {
                Ok(serde_json::json!({
                    "id": row.get_idx::<i64>(0)?,
                    "name": row.get_idx::<String>(1)?,
                    "frequency": row.get_idx::<String>(2)?,
                    "is_active": row.get_idx::<i64>(3)? != 0,
                }))
            })
        })
        .unwrap_or_default();
    HttpResponse::Ok().json(ApiResponse::success(rows))
}

pub async fn pay_group_store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<PayGroupRequest>,
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
    let now = now_str();
    let freq = body.frequency.as_deref().unwrap_or("monthly");
    conn.execute(
        "INSERT INTO pay_groups (organization_id, name, frequency, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        crate::params![org_id, &body.name, freq, &now],
    ).ok();
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "id": conn.last_insert_rowid() })))
}

// ─── Compliance exports ──────────────────────────────────────────────────────

pub async fn compliance_export(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<serde_json::Value>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let export_type = query.get("type").and_then(|v| v.as_str()).unwrap_or("pf_ecr");
    let month = query.get("month").and_then(|v| v.as_i64()).unwrap_or(1) as i32;
    let year = query.get("year").and_then(|v| v.as_i64()).unwrap_or(2026) as i32;
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    let mut sql = String::from(
        "SELECT u.name, u.email, p.gross_salary, p.pf_deduction, p.esi_deduction, p.net_salary, p.basic_salary
         FROM payslips p JOIN users u ON u.id = p.user_id
         WHERE u.organization_id = ?1 AND p.month = ?2 AND p.year = ?3 AND p.status = 'generated'",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![
        crate::db::into_param_value(org_id),
        crate::db::into_param_value(month),
        crate::db::into_param_value(year),
    ];
    crate::branch_scope::append_users_branch_filter(&mut sql, &mut params, &scope, "u");

    let rows: Vec<(String, String, f64, f64, f64, f64, f64)> = conn
        .prepare(&sql)
        .map(|s| {
            s.query_map(&params, |row| {
                Ok((
                    row.get_idx::<String>(0)?,
                    row.get_idx::<String>(1)?,
                    row.get_idx::<f64>(2)?,
                    row.get_idx::<f64>(3)?,
                    row.get_idx::<f64>(4)?,
                    row.get_idx::<f64>(5)?,
                    row.get_idx::<f64>(6)?,
                ))
            })
        })
        .unwrap_or_default();

    let content = match export_type {
        "pf_ecr" => {
            let mut csv = String::from("UAN,Name,Gross Wages,EPF Wages,EE Share,ER Share\n");
            for (name, _email, gross, pf, _esi, _net, basic) in &rows {
                let er = pf;
                csv.push_str(&format!(",{name},{gross},{basic},{pf},{er}\n"));
            }
            csv
        }
        "esi" => {
            let mut csv = String::from("IP Number,Name,Days Worked,Wages,EE Contrib,ER Contrib\n");
            for (name, _email, gross, _pf, esi, _net, _basic) in &rows {
                let er = esi * 4.33;
                csv.push_str(&format!(",{name},26,{gross},{esi},{er}\n"));
            }
            csv
        }
        "pt_return" => {
            let mut csv = String::from("Employee,State,Gross,PT Amount\n");
            for (name, _email, gross, _pf, _esi, _net, _basic) in &rows {
                csv.push_str(&format!("{name},,{},200\n", gross));
            }
            csv
        }
        "form16" => {
            let mut lines = vec![serde_json::json!({ "type": "form16_part_b", "financial_year": crate::tds_logic::financial_year_for(month, year) })];
            for (name, email, gross, pf, esi, net, basic) in rows {
                lines.push(serde_json::json!({
                    "name": name, "email": email, "gross": gross, "basic": basic,
                    "pf": pf, "esi": esi, "net": net,
                }));
            }
            return HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "format": "json", "data": lines })));
        }
        _ => return HttpResponse::BadRequest().json(ApiError::new("Unknown export type")),
    };

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "format": "csv",
        "filename": format!("{export_type}_{year}_{month:02}.csv"),
        "content": content,
    })))
}

// ─── Bank file & accounting ──────────────────────────────────────────────────

pub async fn bank_payment_file(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<serde_json::Value>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let month = query.get("month").and_then(|v| v.as_i64()).unwrap_or(1) as i32;
    let year = query.get("year").and_then(|v| v.as_i64()).unwrap_or(2026) as i32;
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    let mut sql = String::from(
        "SELECT u.name, u.bank_account, u.bank_ifsc, u.bank_account_holder, p.net_salary, p.id
         FROM payslips p JOIN users u ON u.id = p.user_id
         WHERE u.organization_id = ?1 AND p.month = ?2 AND p.year = ?3 AND p.status = 'generated'
           AND COALESCE(p.payment_status, 'pending') = 'pending'",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![
        crate::db::into_param_value(org_id),
        crate::db::into_param_value(month),
        crate::db::into_param_value(year),
    ];
    crate::branch_scope::append_users_branch_filter(&mut sql, &mut params, &scope, "u");
    let stmt = conn.prepare(&sql).ok();
    let mut csv = String::from("Beneficiary Name,Account Number,IFSC,Amount,Narration\n");
    let mut ids: Vec<i64> = vec![];
    if let Some(s) = stmt {
        for row in s.query_map(&params, |row| {
            Ok((
                row.get_idx::<String>(0)?,
                row.get_idx::<Option<String>>(1)?,
                row.get_idx::<Option<String>>(2)?,
                row.get_idx::<Option<String>>(3)?,
                row.get_idx::<f64>(4)?,
                row.get_idx::<i64>(5)?,
            ))
        }) {
            let (name, acct, ifsc, holder, net, id) = row;
            let acct = acct.unwrap_or_default();
            if acct.is_empty() || net <= 0.0 {
                continue;
            }
            let bene = holder.unwrap_or(name);
            let ifsc = ifsc.unwrap_or_default();
            csv.push_str(&format!(
                "{},{},{},{:.2},Salary {}-{:02}\n",
                bene, acct, ifsc, net, year, month
            ));
            ids.push(id);
        }
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "format": "csv",
        "filename": format!("neft_salary_{year}_{month:02}.csv"),
        "content": csv,
        "payslip_ids": ids,
    })))
}

#[derive(Debug, Deserialize)]
pub struct MarkPaidRequest {
    pub payslip_ids: Vec<i64>,
}

pub async fn mark_payslips_paid(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<MarkPaidRequest>,
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
    let mut updated = 0i64;
    for id in &body.payslip_ids {
        let owner_id: Option<i64> = conn
            .query_row(
                "SELECT p.user_id FROM payslips p
                 JOIN users u ON u.id = p.user_id
                 WHERE p.id = ?1 AND u.organization_id = ?2 AND p.status = 'generated'",
                crate::params![id, org_id],
                |r| r.get_idx::<i64>(0),
            )
            .ok();
        let Some(owner_id) = owner_id else {
            continue;
        };
        if !crate::branch_scope::user_in_branch_scope(&conn, owner_id, org_id, &scope) {
            continue;
        }
        let n = conn.execute(
            "UPDATE payslips SET payment_status = 'paid', updated_at = ?1
             WHERE id = ?2 AND status = 'generated'
               AND user_id IN (SELECT id FROM users WHERE organization_id = ?3)",
            crate::params![now_str(), id, org_id],
        ).unwrap_or(0);
        updated += n as i64;
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "updated": updated })))
}

pub async fn accounting_journal_export(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<serde_json::Value>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let month = query.get("month").and_then(|v| v.as_i64()).unwrap_or(1) as i32;
    let year = query.get("year").and_then(|v| v.as_i64()).unwrap_or(2026) as i32;
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    let mut sql = String::from(
        "SELECT COALESCE(SUM(p.gross_salary),0), COALESCE(SUM(p.net_salary),0),
                COALESCE(SUM(p.pf_deduction + p.esi_deduction + p.prof_tax),0),
                COALESCE(SUM(p.total_deductions),0)
         FROM payslips p JOIN users u ON u.id = p.user_id
         WHERE u.organization_id = ?1 AND p.month = ?2 AND p.year = ?3 AND p.status = 'generated'",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![
        crate::db::into_param_value(org_id),
        crate::db::into_param_value(month),
        crate::db::into_param_value(year),
    ];
    crate::branch_scope::append_users_branch_filter(&mut sql, &mut params, &scope, "u");
    let totals: (f64, f64, f64, f64) = conn
        .query_row(&sql, &params, |r| {
            Ok((
                r.get_idx::<f64>(0)?,
                r.get_idx::<f64>(1)?,
                r.get_idx::<f64>(2)?,
                r.get_idx::<f64>(3)?,
            ))
        })
        .unwrap_or((0.0, 0.0, 0.0, 0.0));
    let (gross, net, statutory, _ded) = totals;
    let csv = format!(
        "Date,Account,Debit,Credit,Narration\n\
         {year}-{month:02}-28,Salary Expense,{gross:.2},0,Monthly payroll\n\
         {year}-{month:02}-28,Salary Payable,0,{net:.2},Net salaries\n\
         {year}-{month:02}-28,Statutory Payable,0,{statutory:.2},PF ESI PT\n"
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "format": "csv",
        "filename": format!("journal_{year}_{month:02}.csv"),
        "content": csv,
    })))
}

pub async fn payroll_reminder_status(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let today = chrono::Utc::now();
    let month = today.month() as i32;
    let year = today.year();
    let reminder_day: i64 = conn
        .query_row(
            "SELECT value FROM app_settings WHERE organization_id = ?1 AND key = 'payroll_reminder_day'",
            [org_id],
            |r| {
                let s: String = r.get_idx(0)?;
                Ok(s.parse::<i64>().unwrap_or(25))
            },
        )
        .unwrap_or(25);
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    let mut gen_sql = String::from(
        "SELECT COUNT(*) FROM payslips p JOIN users u ON u.id = p.user_id
         WHERE u.organization_id = ?1 AND p.month = ?2 AND p.year = ?3 AND p.status = 'generated'",
    );
    let mut gen_params: Vec<crate::db::ParamValue> = vec![
        crate::db::into_param_value(org_id),
        crate::db::into_param_value(month),
        crate::db::into_param_value(year),
    ];
    crate::branch_scope::append_users_branch_filter(&mut gen_sql, &mut gen_params, &scope, "u");
    let generated: i64 = conn
        .query_row(&gen_sql, &gen_params, |r| r.get_idx::<i64>(0))
        .unwrap_or(0);
    let due = today.day() as i64 >= reminder_day && generated == 0;
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "reminder_due": due,
        "reminder_day": reminder_day,
        "month": month,
        "year": year,
        "generated_count": generated,
    })))
}
