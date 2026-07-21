use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::middleware::rbac::{has_permission, load_user_permissions};
use crate::models::grocery_benefit::{
    CreateGroceryBenefitRequest, CreateGroceryClaimRequest, GroceryBenefit, GroceryClaim,
    ReviewGroceryClaimRequest, UpdateGroceryBenefitRequest,
};
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub status: Option<String>,
    pub user_id: Option<i64>,
}

/// GET /api/admin/grocery-benefits — list all benefit enrollments (admin)
pub async fn index(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<ListQuery>,
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

    let is_super = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    let perms = load_user_permissions(&conn, claims.sub, is_super);
    if !has_permission(&perms, "view-grocery-benefits") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: view-grocery-benefits"));
    }

    let mut sql = String::from(
        "SELECT gb.*, u.name AS user_name
         FROM grocery_benefits gb
         LEFT JOIN users u ON u.id = gb.user_id
         WHERE gb.organization_id = ?1",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];

    if let Some(ref status) = query.status {
        sql.push_str(" AND gb.status = ?");
        params.push(crate::db::into_param_value(status.clone()));
    }
    if let Some(uid) = query.user_id {
        sql.push_str(" AND gb.user_id = ?");
        params.push(crate::db::into_param_value(uid));
    }

    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    let mut conditions = Vec::new();
    crate::branch_scope::push_users_branch_condition_qmark(&mut conditions, &mut params, &scope, "u");
    for c in &conditions {
        sql.push_str(" AND ");
        sql.push_str(c);
    }

    sql.push_str(" ORDER BY gb.created_at DESC");

    let items: Vec<GroceryBenefit> = conn
        .prepare(&sql)
        .map(|stmt| stmt.query_map(&params, GroceryBenefit::from_row))
        .unwrap_or_default();

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/admin/grocery-benefits — enroll an employee
pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<CreateGroceryBenefitRequest>,
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

    let is_super = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    let perms = load_user_permissions(&conn, claims.sub, is_super);
    if !has_permission(&perms, "manage-grocery-benefits") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: manage-grocery-benefits"));
    }

    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Err(resp) =
        crate::branch_scope::require_user_in_scope(&conn, body.user_id, org_id, &scope)
    {
        return resp;
    }

    let start_date = match crate::validation::validate_date_yyyy_mm_dd(&body.start_date, "Start date") {
        Ok(d) => d,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let subsidy_pct = body.subsidy_percentage.unwrap_or(50);
    let allowance = body.monthly_allowance.unwrap_or(5000.0);
    // created_at/updated_at are TEXT in Postgres schema — bind as strings.
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    match conn.execute(
        "INSERT INTO grocery_benefits (organization_id, user_id, start_date, subsidy_percentage, monthly_allowance, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?7)",
        crate::params![org_id, body.user_id, start_date, subsidy_pct, allowance, now, now],
    ) {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            if let Some(email) = crate::tenant_email::user_email(&conn, body.user_id) {
                let (text, html) = crate::grocery_email::render_enrolled_email(
                    subsidy_pct,
                    allowance,
                    &start_date,
                );
                crate::tenant_email::send_tenant_email(
                    &conn,
                    org_id,
                    &email,
                    "Grocery Benefit Enrolled",
                    text,
                    html,
                );
            }
            HttpResponse::Created().json(ApiResponse::success(
                serde_json::json!({"id": id, "message": "Employee enrolled in grocery benefit"}),
            ))
        }
        Err(e) => {
            let msg = format!("{e}");
            if msg.contains("UNIQUE") || msg.contains("unique") || msg.contains("duplicate") {
                HttpResponse::Conflict().json(ApiError::new("Employee already enrolled in grocery benefit"))
            } else {
                HttpResponse::BadRequest().json(ApiError::new(&msg))
            }
        }
    }
}

/// PUT /api/admin/grocery-benefits/{id} — update enrollment
pub async fn update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<UpdateGroceryBenefitRequest>,
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

    let is_super = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    let perms = load_user_permissions(&conn, claims.sub, is_super);
    if !has_permission(&perms, "manage-grocery-benefits") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: manage-grocery-benefits"));
    }

    let id = path.into_inner();
    let now = chrono::Utc::now().naive_utc();

    let mut set_parts: Vec<String> = vec!["updated_at = ?".to_string()];
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(now)];

    if let Some(pct) = body.subsidy_percentage {
        set_parts.push("subsidy_percentage = ?".to_string());
        params.push(crate::db::into_param_value(pct));
    }
    if let Some(allowance) = body.monthly_allowance {
        set_parts.push("monthly_allowance = ?".to_string());
        params.push(crate::db::into_param_value(allowance));
    }
    if let Some(ref status) = body.status {
        set_parts.push("status = ?".to_string());
        params.push(crate::db::into_param_value(status.clone()));
    }

    params.push(crate::db::into_param_value(id));
    params.push(crate::db::into_param_value(org_id));

    let sql = format!(
        "UPDATE grocery_benefits SET {} WHERE id = ? AND organization_id = ?",
        set_parts.join(", ")
    );

    match conn.execute(&sql, &params) {
        Ok(n) if n > 0 => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"}))),
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Grocery benefit not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}

/// DELETE /api/admin/grocery-benefits/{id}
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

    let is_super = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    let perms = load_user_permissions(&conn, claims.sub, is_super);
    if !has_permission(&perms, "manage-grocery-benefits") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: manage-grocery-benefits"));
    }

    match conn.execute(
        "DELETE FROM grocery_benefits WHERE id = ?1 AND organization_id = ?2",
        crate::params![path.into_inner(), org_id],
    ) {
        Ok(n) if n > 0 => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"}))),
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Grocery benefit not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}

/// GET /api/admin/grocery-benefits/my-status — employee self-service
pub async fn my_status(
    pool: web::Data<DbPool>,
    req: HttpRequest,
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

    let is_super = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    let perms = load_user_permissions(&conn, claims.sub, is_super);
    if !has_permission(&perms, "view-my-grocery-benefits") && !has_permission(&perms, "view-grocery-benefits") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission"));
    }

    // Get benefit enrollment
    let benefit: Option<GroceryBenefit> = conn
        .prepare("SELECT gb.*, u.name AS user_name FROM grocery_benefits gb LEFT JOIN users u ON u.id = gb.user_id WHERE gb.organization_id = ?1 AND gb.user_id = ?2 AND gb.status = 'active'")
        .ok()
        .and_then(|stmt| {
            stmt.query_map(
                &[crate::db::into_param_value(org_id), crate::db::into_param_value(claims.sub)][..],
                GroceryBenefit::from_row,
            )
            .into_iter()
            .next()
        });

    // Determine if this is the free month
    let now = chrono::Utc::now().naive_utc().date();
    let is_free_month = benefit.as_ref().map(|b| {
        if let Ok(start) = chrono::NaiveDate::parse_from_str(&b.start_date, "%Y-%m-%d") {
            start.format("%Y-%m").to_string() == now.format("%Y-%m").to_string()
        } else {
            false
        }
    }).unwrap_or(false);

    // Get claims for current month
    let current_month = now.format("%m").to_string().parse::<i64>().unwrap_or(1);
    let current_year = now.format("%Y").to_string().parse::<i64>().unwrap_or(2026);

    let claims_list: Vec<GroceryClaim> = conn
        .prepare(
            "SELECT gc.*, u.name AS user_name, r.name AS reviewer_name
             FROM grocery_claims gc
             LEFT JOIN users u ON u.id = gc.user_id
             LEFT JOIN users r ON r.id = gc.reviewed_by
             WHERE gc.organization_id = ?1 AND gc.user_id = ?2
             ORDER BY gc.claim_year DESC, gc.claim_month DESC, gc.id DESC",
        )
        .map(|stmt| {
            stmt.query_map(
                &[crate::db::into_param_value(org_id), crate::db::into_param_value(claims.sub)][..],
                GroceryClaim::from_row,
            )
        })
        .unwrap_or_default();

    // Calculate used amount this month
    let used_this_month: f64 = claims_list
        .iter()
        .filter(|c| c.claim_month == current_month && c.claim_year == current_year && c.status != "rejected")
        .map(|c| c.amount)
        .sum();

    let remaining = benefit
        .as_ref()
        .map(|b| (b.monthly_allowance - used_this_month).max(0.0))
        .unwrap_or(0.0);

    let subsidy_pct = if is_free_month {
        100
    } else {
        benefit.as_ref().map(|b| b.subsidy_percentage).unwrap_or(0)
    };

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "benefit": benefit,
        "is_free_month": is_free_month,
        "effective_subsidy_percentage": subsidy_pct,
        "used_this_month": used_this_month,
        "remaining_allowance": remaining,
        "current_month": current_month,
        "current_year": current_year,
        "claims": claims_list,
    })))
}

/// GET /api/admin/grocery-claims — list all claims (admin)
pub async fn claims_index(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<ListQuery>,
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

    let is_super = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    let perms = load_user_permissions(&conn, claims.sub, is_super);
    if !has_permission(&perms, "view-grocery-benefits") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: view-grocery-benefits"));
    }

    let mut sql = String::from(
        "SELECT gc.*, u.name AS user_name, r.name AS reviewer_name
         FROM grocery_claims gc
         LEFT JOIN users u ON u.id = gc.user_id
         LEFT JOIN users r ON r.id = gc.reviewed_by
         WHERE gc.organization_id = ?1",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];

    if let Some(ref status) = query.status {
        sql.push_str(" AND gc.status = ?");
        params.push(crate::db::into_param_value(status.clone()));
    }
    if let Some(uid) = query.user_id {
        sql.push_str(" AND gc.user_id = ?");
        params.push(crate::db::into_param_value(uid));
    }

    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    let mut conditions = Vec::new();
    crate::branch_scope::push_users_branch_condition_qmark(&mut conditions, &mut params, &scope, "u");
    for c in &conditions {
        sql.push_str(" AND ");
        sql.push_str(c);
    }

    sql.push_str(" ORDER BY gc.created_at DESC");

    let items: Vec<GroceryClaim> = conn
        .prepare(&sql)
        .map(|stmt| stmt.query_map(&params, GroceryClaim::from_row))
        .unwrap_or_default();

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/admin/grocery-claims — employee submits a grocery claim
pub async fn claims_store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<CreateGroceryClaimRequest>,
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

    let is_super = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    let perms = load_user_permissions(&conn, claims.sub, is_super);
    if !has_permission(&perms, "view-my-grocery-benefits") && !has_permission(&perms, "view-grocery-benefits") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission"));
    }

    if body.amount <= 0.0 {
        return HttpResponse::BadRequest().json(ApiError::new("Amount must be positive"));
    }

    // Find the employee's active benefit
    let benefit: Option<GroceryBenefit> = conn
        .prepare("SELECT gb.*, u.name AS user_name FROM grocery_benefits gb LEFT JOIN users u ON u.id = gb.user_id WHERE gb.organization_id = ?1 AND gb.user_id = ?2 AND gb.status = 'active'")
        .ok()
        .and_then(|stmt| {
            stmt.query_map(
                &[crate::db::into_param_value(org_id), crate::db::into_param_value(claims.sub)][..],
                GroceryBenefit::from_row,
            )
            .into_iter()
            .next()
        });

    let benefit = match benefit {
        Some(b) => b,
        None => return HttpResponse::BadRequest().json(ApiError::new("No active grocery benefit found. Contact HR.")),
    };

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let today = chrono::Utc::now().date_naive();
    let claim_month = body.claim_month.unwrap_or_else(|| today.format("%m").to_string().parse().unwrap_or(1));
    let claim_year = body.claim_year.unwrap_or_else(|| today.format("%Y").to_string().parse().unwrap_or(2026));

    // Check allowance limit for this month
    let used: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM grocery_claims WHERE organization_id = ?1 AND user_id = ?2 AND claim_month = ?3 AND claim_year = ?4 AND status != 'rejected'",
            crate::params![org_id, claims.sub, claim_month, claim_year],
            |row| row.get_idx::<f64>(0),
        )
        .unwrap_or(0.0);

    if used + body.amount > benefit.monthly_allowance {
        return HttpResponse::BadRequest().json(ApiError::new(&format!(
            "Exceeds monthly allowance. Remaining: {:.2}",
            (benefit.monthly_allowance - used).max(0.0)
        )));
    }

    // Determine if this is the free month
    let is_free_month = if let Ok(start) = chrono::NaiveDate::parse_from_str(&benefit.start_date, "%Y-%m-%d") {
        start.format("%Y-%m").to_string()
            == format!("{:04}-{:02}", claim_year, claim_month)
    } else {
        false
    };

    let (company_share, employee_share) = if is_free_month {
        (body.amount, 0.0) // 100% free
    } else {
        let company = body.amount * (benefit.subsidy_percentage as f64) / 100.0;
        let employee = body.amount - company;
        (company, employee)
    };

    let description = crate::validation::normalize_optional(body.description.clone());

    match conn.execute(
        "INSERT INTO grocery_claims (organization_id, user_id, benefit_id, claim_month, claim_year, amount, company_share, employee_share, is_free_month, description, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'pending', ?11, ?12)",
        crate::params![
            org_id, claims.sub, benefit.id, claim_month, claim_year,
            body.amount, company_share, employee_share,
            if is_free_month { 1 } else { 0 },
            description, now, now
        ],
    ) {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            let employee_name = crate::tenant_email::user_name(&conn, claims.sub)
                .unwrap_or_else(|| "Employee".to_string());
            let admin_emails = crate::tenant_email::emails_with_permission(
                &conn,
                org_id,
                "manage-grocery-benefits",
            );
            if !admin_emails.is_empty() {
                let (text, html) = crate::grocery_email::render_claim_logged_email(
                    &employee_name,
                    body.amount,
                    claim_month,
                    claim_year,
                );
                crate::tenant_email::send_tenant_email_bulk(
                    &conn,
                    org_id,
                    &admin_emails,
                    &format!("Grocery Claim: {employee_name}"),
                    text,
                    html,
                );
            }
            crate::workflow_logic::trigger(
                &conn,
                org_id,
                "grocery_claim_submitted",
                &serde_json::json!({
                    "claim_id": id,
                    "user_id": claims.sub,
                    "benefit_id": benefit.id,
                    "amount": body.amount,
                    "company_share": company_share,
                    "employee_share": employee_share,
                    "claim_month": claim_month,
                    "claim_year": claim_year,
                    "is_free_month": is_free_month,
                    "organization_id": org_id,
                    "created_by": claims.sub,
                }),
            );
            HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
                "id": id,
                "company_share": company_share,
                "employee_share": employee_share,
                "is_free_month": is_free_month,
                "message": "Grocery claim submitted"
            })))
        }
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}

/// POST /api/admin/grocery-claims/{id}/review — approve/reject a claim
pub async fn claims_review(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<ReviewGroceryClaimRequest>,
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

    let is_super = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    let perms = load_user_permissions(&conn, claims.sub, is_super);
    if !has_permission(&perms, "manage-grocery-benefits") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: manage-grocery-benefits"));
    }

    if body.status != "approved" && body.status != "rejected" {
        return HttpResponse::BadRequest().json(ApiError::new("Status must be 'approved' or 'rejected'"));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let notes = crate::validation::normalize_optional(body.review_notes.clone());
    let claim_id = path.into_inner();
    let claim_info: Option<(i64, f64)> = conn
        .query_row(
            "SELECT user_id, amount FROM grocery_claims WHERE id = ?1 AND organization_id = ?2 AND status = 'pending'",
            crate::params![claim_id, org_id],
            |row| Ok((row.get_idx::<i64>(0)?, row.get_idx::<f64>(1)?)),
        )
        .ok();

    match conn.execute(
        "UPDATE grocery_claims SET status = ?1, reviewed_by = ?2, reviewed_at = ?3, review_notes = ?4, updated_at = ?5 WHERE id = ?6 AND organization_id = ?7 AND status = 'pending'",
        crate::params![body.status, claims.sub, now, notes.clone(), now, claim_id, org_id],
    ) {
        Ok(n) if n > 0 => {
            if let Some((user_id, amount)) = claim_info {
                if let Some(email) = crate::tenant_email::user_email(&conn, user_id) {
                    let (text, html) = crate::grocery_email::render_claim_reviewed_email(
                        amount,
                        &body.status,
                        notes.as_deref(),
                    );
                    crate::tenant_email::send_tenant_email(
                        &conn,
                        org_id,
                        &email,
                        &format!("Grocery Claim {}", body.status.to_uppercase()),
                        text,
                        html,
                    );
                }
            }
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": format!("Claim {}", body.status)})))
        }
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Claim not found or already reviewed")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}
