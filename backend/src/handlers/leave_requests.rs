use actix_web::{web, HttpRequest, HttpResponse};
use chrono::{Datelike, NaiveDate};
use serde::Deserialize;
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;

#[derive(Debug, Deserialize)]
pub struct LeaveListQuery {
    pub status: Option<String>,
    pub leave_type: Option<String>,
    pub search: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RejectLeaveRequest {
    pub rejection_reason: Option<String>,
}

fn leave_overlaps_generated_payslip(
    conn: &crate::db::Connection,
    user_id: i64,
    start_date: &str,
    end_date: &str,
) -> bool {
    let Some(ls) = NaiveDate::parse_from_str(start_date, "%Y-%m-%d").ok() else {
        return false;
    };
    let Some(le) = NaiveDate::parse_from_str(end_date, "%Y-%m-%d").ok() else {
        return false;
    };
    let mut month = ls.year() * 100 + ls.month() as i32;
    let end_key = le.year() * 100 + le.month() as i32;
    while month <= end_key {
        let y = month / 100;
        let m = month % 100;
        let found: bool = conn
            .query_row(
                "SELECT 1 FROM payslips WHERE user_id=?1 AND month=?2 AND year=?3 AND status='generated' LIMIT 1",
                crate::params![user_id, m, y],
                |_| Ok(()),
            )
            .is_ok();
        if found {
            return true;
        }
        month = if m == 12 { (y + 1) * 100 + 1 } else { y * 100 + (m + 1) };
    }
    false
}

fn leave_dates_outside_employment(
    conn: &crate::db::Connection,
    user_id: i64,
    start_date: &str,
    end_date: &str,
) -> bool {
    let Ok(ls) = NaiveDate::parse_from_str(start_date, "%Y-%m-%d") else {
        return true;
    };
    let Ok(le) = NaiveDate::parse_from_str(end_date, "%Y-%m-%d") else {
        return true;
    };
    let (join, exit): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT date_of_joining, date_of_exit FROM users WHERE id = ?1",
            [user_id],
            |row| Ok((row.get_idx(0).ok(), row.get_idx(1).ok())),
        )
        .unwrap_or((None, None));
    if let Some(ref j) = join {
        if let Ok(jd) = NaiveDate::parse_from_str(j, "%Y-%m-%d") {
            if ls < jd {
                return true;
            }
        }
    }
    if let Some(ref e) = exit {
        if let Ok(ed) = NaiveDate::parse_from_str(e, "%Y-%m-%d") {
            if le > ed {
                return true;
            }
        }
    }
    false
}

fn sync_user_on_leave_status(
    conn: &crate::db::Connection,
    user_id: i64,
    on_leave: bool,
) {
    let status = if on_leave { "on-leave" } else { "active" };
    let _ = conn.execute(
        "UPDATE users SET status = ?1, updated_at = datetime('now')
         WHERE id = ?2 AND deleted_at IS NULL AND status != 'inactive'",
        crate::params![status, user_id],
    );
}

fn leave_days_between(conn: &crate::db::Connection, user_id: i64, start: &str, end: &str) -> i64 {
    let start_date = NaiveDate::parse_from_str(start, "%Y-%m-%d").ok();
    let end_date = NaiveDate::parse_from_str(end, "%Y-%m-%d").ok();
    match (start_date, end_date) {
        (Some(s), Some(e)) => crate::payroll_logic::working_days_between_for_user(conn, user_id, s, e),
        _ => 1,
    }
}

fn has_overlapping_leave(
    conn: &crate::db::Connection,
    user_id: i64,
    start: &str,
    end: &str,
    exclude_id: Option<i64>,
) -> bool {
    let sql = if exclude_id.is_some() {
        "SELECT 1 FROM leave_requests WHERE user_id=?1 AND deleted_at IS NULL
         AND status NOT IN ('rejected') AND start_date <= ?3 AND end_date >= ?2 AND id != ?4 LIMIT 1"
    } else {
        "SELECT 1 FROM leave_requests WHERE user_id=?1 AND deleted_at IS NULL
         AND status NOT IN ('rejected') AND start_date <= ?3 AND end_date >= ?2 LIMIT 1"
    };
    if let Some(eid) = exclude_id {
        conn.query_row(sql, crate::params![user_id, start, end, eid], |_| Ok(()))
            .is_ok()
    } else {
        conn.query_row(sql, crate::params![user_id, start, end], |_| Ok(()))
            .is_ok()
    }
}

fn leave_to_json(row: &crate::db::Row) -> crate::db::Result<serde_json::Value> {
    let id: i64 = row.get("id")?;
    let user_id: i64 = row.get("user_id")?;
    Ok(serde_json::json!({
        "id": id,
        "user_id": user_id,
        "leave_type": row.get::<String>("leave_type")?,
        "start_date": row.get::<String>("start_date")?,
        "end_date": row.get::<String>("end_date")?,
        "days_count": row.get::<i64>("days_count").unwrap_or(1),
        "reason": row.get::<Option<String>>("reason")?,
        "status": row.get::<String>("status")?,
        "remarks": row.get::<Option<String>>("remarks").ok().flatten(),
        "rejection_reason": row.get::<Option<String>>("rejection_reason").ok().flatten(),
        "approved_by": row.get::<Option<i64>>("approved_by").ok().flatten(),
        "created_at": row.get::<Option<String>>("created_at").ok().flatten(),
        "updated_at": row.get::<Option<String>>("updated_at").ok().flatten(),
        "user": {
            "id": user_id,
            "name": row.get::<Option<String>>("user_name").ok().flatten(),
            "email": row.get::<Option<String>>("user_email").ok().flatten(),
        }
    }))
}

fn fetch_leave_list(
    conn: &crate::db::Connection,
    query: &LeaveListQuery,
    org_id: i64,
    user_id: Option<i64>,
) -> serde_json::Value {
    let per_page = query.per_page.unwrap_or(15).clamp(1, 100);
    let page = query.page.unwrap_or(1).max(1);
    let offset = (page - 1) * per_page;

    let mut conditions = vec!["lr.deleted_at IS NULL".to_string()];
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];

    if let Some(uid) = user_id {
        conditions.push("lr.user_id = ?".to_string());
        params.push(crate::db::into_param_value(uid));
    }

    if let Some(ref status) = query.status {
        if !status.is_empty() && status != "all" {
            conditions.push("lr.status = ?".to_string());
            params.push(crate::db::into_param_value(status.clone()));
        }
    }

    if let Some(ref leave_type) = query.leave_type {
        if !leave_type.is_empty() && leave_type != "all" {
            conditions.push("lr.leave_type = ?".to_string());
            params.push(crate::db::into_param_value(leave_type.clone()));
        }
    }

    if let Some(ref search) = query.search {
        if !search.is_empty() {
            conditions.push("(u.name LIKE ? OR u.email LIKE ? OR lr.reason LIKE ?)".to_string());
            let like = format!("%{}%", search);
            params.push(crate::db::into_param_value(like.clone()));
            params.push(crate::db::into_param_value(like.clone()));
            params.push(crate::db::into_param_value(like));
        }
    }

    let where_clause = conditions.join(" AND ");
    let sort_col = match query.sort_by.as_deref() {
        Some("start_date") => "lr.start_date",
        Some("end_date") => "lr.end_date",
        Some("status") => "lr.status",
        Some("leave_type") => "lr.leave_type",
        Some("days_count") => "lr.days_count",
        Some("user_name") => "u.name",
        Some("id") => "lr.id",
        Some("created_at") => "lr.created_at",
        _ => "lr.created_at",
    };
    let sort_dir = if query.sort_order.as_deref() == Some("asc") {
        "ASC"
    } else {
        "DESC"
    };

    let count_sql = format!(
        "SELECT COUNT(*) FROM leave_requests lr
         INNER JOIN users u ON u.id = lr.user_id AND u.organization_id = ?
         WHERE {}",
        where_clause
    );
    let total: i64 = conn
        .query_row(
            &count_sql,
            &params,
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    let sql = format!(
        "SELECT lr.*, u.name as user_name, u.email as user_email
         FROM leave_requests lr
         INNER JOIN users u ON u.id = lr.user_id AND u.organization_id = ?
         WHERE {}
         ORDER BY {} {}
         LIMIT {per_page} OFFSET {offset}",
        where_clause, sort_col, sort_dir
    );

    let list_params = params;

    let stmt = conn.prepare(&sql).unwrap();
    let items: Vec<serde_json::Value> = stmt
        .query_map(
            &list_params,
            leave_to_json,
        );

    let last_page = ((total as f64) / (per_page as f64)).ceil().max(1.0) as i64;
    let from = if total > 0 { offset + 1 } else { 0 };
    let to = (offset + items.len() as i64).min(total);

    serde_json::json!({
        "data": items,
        "current_page": page,
        "last_page": last_page,
        "total": total,
        "from": from,
        "to": to,
        "per_page": per_page,
    })
}

fn user_leave_stats(conn: &crate::db::Connection, user_id: i64) -> serde_json::Value {
    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM leave_requests WHERE user_id=?1 AND deleted_at IS NULL",
            [user_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let pending: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM leave_requests WHERE user_id=?1 AND status='pending' AND deleted_at IS NULL",
            [user_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let approved: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM leave_requests WHERE user_id=?1 AND status='approved' AND deleted_at IS NULL",
            [user_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let year = chrono::Utc::now().year();
    let approved_days =
        crate::payroll_logic::employee_leave_used_in_year(conn, user_id, year);
    let pending_days =
        crate::payroll_logic::employee_pending_leave_days_in_year(conn, user_id, year);
    let org_id = crate::tenant::org_id_for_user(conn, user_id);
    let quota_effective =
        crate::payroll_logic::employee_effective_leave_quota(conn, user_id, year, org_id);

    serde_json::json!({
        "total_requests": total,
        "pending": pending,
        "approved": approved,
        "total_leave_days": approved_days,
        "quota_used": approved_days + pending_days,
        "quota_pending": pending_days,
        "quota_effective": quota_effective,
        "quota_year": year,
    })
}

pub async fn index(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<LeaveListQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let data = fetch_leave_list(&conn, &query, org_id, Some(claims.sub));
    HttpResponse::Ok().json(ApiResponse::success(data))
}

pub async fn list(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<LeaveListQuery>,
) -> HttpResponse {
    index(pool, req, query).await
}

pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<crate::models::leave_request::CreateLeaveRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let leave_type = match crate::validation::require_non_empty(&body.leave_type, "Leave type") {
        Ok(v) => v,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let start_date = match crate::validation::validate_date_yyyy_mm_dd(&body.start_date, "Start date") {
        Ok(v) => v,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let end_date = match crate::validation::validate_date_yyyy_mm_dd(&body.end_date, "End date") {
        Ok(v) => v,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let reason = match body.reason.as_deref() {
        Some(r) => match crate::validation::require_min_len(r, 10, "Reason") {
            Ok(v) => Some(v),
            Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
        },
        None => {
            return HttpResponse::BadRequest().json(ApiError::new("Reason is required"));
        }
    };
    if end_date < start_date {
        return HttpResponse::BadRequest().json(ApiError::new("End date must be on or after start date"));
    }
    if !crate::leave_type_logic::is_valid_active_slug(&conn, org_id, &leave_type) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid or inactive leave type"));
    }
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let days = leave_days_between(&conn, claims.sub, &start_date, &end_date);
    if days <= 0 {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid leave date range"));
    }
    if has_overlapping_leave(&conn, claims.sub, &start_date, &end_date, None) {
        return HttpResponse::BadRequest().json(ApiError::new(
            "Leave dates overlap with an existing request",
        ));
    }
    if leave_dates_outside_employment(&conn, claims.sub, &start_date, &end_date) {
        return HttpResponse::BadRequest().json(ApiError::new(
            "Leave dates must fall within the employee active employment period",
        ));
    }
    if crate::leave_type_logic::counts_toward_quota(&conn, org_id, &leave_type)
        && crate::payroll_logic::would_exceed_annual_quota(
            &conn,
            claims.sub,
            &start_date,
            &end_date,
            &leave_type,
            None,
        )
    {
        let year = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
            .map(|d| d.year())
            .unwrap_or_else(|_| chrono::Utc::now().year());
        return HttpResponse::BadRequest().json(ApiError::new(&quota_exceeded_message(
            &conn, claims.sub, org_id, year, &leave_type,
        )));
    }

    match conn.execute(
        "INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, days_count, reason, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?7)",
        crate::params![
            claims.sub,
            leave_type,
            start_date,
            end_date,
            days,
            reason,
            &now,
        ],
    ) {
        Ok(_) => {
            let leave_id = conn.last_insert_rowid();
            crate::workflow_logic::trigger(
                &conn,
                org_id,
                "leave_request_submitted",
                &serde_json::json!({
                    "leave_id": leave_id,
                    "user_id": claims.sub,
                    "leave_type": leave_type,
                    "start_date": start_date,
                    "end_date": end_date,
                    "days_count": days,
                    "reason": reason,
                    "created_by": claims.sub,
                    "organization_id": org_id,
                }),
            );
            HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
                "id": leave_id,
            })))
        }
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

fn quota_exceeded_message(
    conn: &crate::db::Connection,
    user_id: i64,
    org_id: i64,
    year: i32,
    leave_type: &str,
) -> String {
    let type_label = crate::leave_type_logic::config_for_slug(conn, org_id, leave_type)
        .map(|c| c.name)
        .unwrap_or_else(|| leave_type.to_string());
    let Some(effective) = crate::payroll_logic::employee_effective_leave_quota_for_type(
        conn, user_id, year, org_id, leave_type,
    ) else {
        return format!("{type_label} balance exceeded");
    };
    let bonus = if leave_type == "annual" {
        crate::payroll_logic::employee_leave_credits_in_year(conn, user_id, year)
    } else {
        0
    };
    let base = crate::payroll_logic::leave_type_annual_quota(conn, org_id, leave_type)
        .unwrap_or(effective);
    if bonus > 0 {
        format!(
            "{type_label} balance exceeded (allowance: {base} base + {bonus} bonus = {effective} business days)"
        )
    } else {
        format!("{type_label} balance exceeded (quota: {effective} business days)")
    }
}

pub async fn update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<crate::models::leave_request::UpdateLeaveRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let leave_id = path.into_inner();
    let leave_row: Option<(i64, String, String, String, String, Option<String>)> = conn
        .query_row(
            "SELECT lr.user_id, lr.status, lr.leave_type, lr.start_date, lr.end_date, lr.reason
             FROM leave_requests lr
             INNER JOIN users u ON u.id = lr.user_id AND u.organization_id = ?2
             WHERE lr.id = ?1 AND lr.deleted_at IS NULL",
            crate::params![leave_id, org_id],
            |r| {
                Ok((
                    r.get_idx::<i64>(0)?,
                    r.get_idx::<String>(1)?,
                    r.get_idx::<String>(2)?,
                    r.get_idx::<String>(3)?,
                    r.get_idx::<String>(4)?,
                    r.get_idx::<Option<String>>(5).ok().flatten(),
                ))
            },
        )
        .ok();
    let (owner, status, cur_type, cur_start, cur_end, cur_reason) = match leave_row {
        Some(r) => r,
        None => return HttpResponse::NotFound().json(ApiError::new("Leave request not found")),
    };
    if status != "pending" {
        return HttpResponse::Conflict().json(ApiError::new(
            "Only pending leave requests can be updated",
        ));
    }
    let is_super_admin = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    if owner != claims.sub && !is_super_admin {
        let perms = crate::middleware::rbac::load_user_permissions(&conn, claims.sub, false);
        if !crate::middleware::rbac::has_permission(&perms, "manage-leave-requests") {
            return HttpResponse::Forbidden().json(ApiError::new("Not allowed to update this leave request"));
        }
    }

    let leave_type = body
        .leave_type
        .as_deref()
        .unwrap_or(&cur_type)
        .to_string();
    let start_date = body
        .start_date
        .as_deref()
        .unwrap_or(&cur_start)
        .to_string();
    let end_date = body.end_date.as_deref().unwrap_or(&cur_end).to_string();
    let reason = body.reason.clone().or(cur_reason);

    if end_date < start_date {
        return HttpResponse::BadRequest().json(ApiError::new("End date must be on or after start date"));
    }
    if !crate::leave_type_logic::is_valid_active_slug(&conn, org_id, &leave_type) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid or inactive leave type"));
    }
    let days = leave_days_between(&conn, owner, &start_date, &end_date);
    if days <= 0 {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid leave date range"));
    }
    if has_overlapping_leave(&conn, owner, &start_date, &end_date, Some(leave_id)) {
        return HttpResponse::BadRequest().json(ApiError::new(
            "Leave dates overlap with an existing request",
        ));
    }
    if leave_dates_outside_employment(&conn, owner, &start_date, &end_date) {
        return HttpResponse::BadRequest().json(ApiError::new(
            "Leave dates must fall within the employee active employment period",
        ));
    }
    if crate::leave_type_logic::counts_toward_quota(&conn, org_id, &leave_type)
        && crate::payroll_logic::would_exceed_annual_quota(
            &conn,
            owner,
            &start_date,
            &end_date,
            &leave_type,
            Some(leave_id),
        )
    {
        let year = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
            .map(|d| d.year())
            .unwrap_or_else(|_| chrono::Utc::now().year());
        return HttpResponse::BadRequest().json(ApiError::new(&quota_exceeded_message(
            &conn, owner, org_id, year, &leave_type,
        )));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let updated = conn.execute(
        "UPDATE leave_requests
         SET leave_type=?1, start_date=?2, end_date=?3, days_count=?4, reason=?5, updated_at=?6
         WHERE id=?7 AND status='pending' AND deleted_at IS NULL
           AND user_id IN (SELECT id FROM users WHERE organization_id = ?8)",
        crate::params![leave_type, start_date, end_date, days, reason, &now, leave_id, org_id],
    );
    if updated.unwrap_or(0) == 0 {
        return HttpResponse::Conflict().json(ApiError::new(
            "Leave request not found or already processed",
        ));
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"updated": true})))
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
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let leave_id = path.into_inner();
    let leave_row: Option<(i64, String, String, String)> = conn
        .query_row(
            "SELECT lr.user_id, lr.status, lr.start_date, lr.end_date FROM leave_requests lr
             INNER JOIN users u ON u.id = lr.user_id AND u.organization_id = ?2
             WHERE lr.id = ?1 AND lr.deleted_at IS NULL",
            crate::params![leave_id, org_id],
            |r| Ok((r.get_idx::<i64>(0)?, r.get_idx::<String>(1)?, r.get_idx::<String>(2)?, r.get_idx::<String>(3)?)),
        )
        .ok();
    let (owner, status, start_date, end_date) = match leave_row {
        Some(r) => r,
        None => return HttpResponse::NotFound().json(ApiError::new("Leave request not found")),
    };
    if status != "pending" {
        let is_super_admin =
            crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
        let perms = crate::middleware::rbac::load_user_permissions(&conn, claims.sub, false);
        if !is_super_admin
            && !crate::middleware::rbac::has_permission(&perms, "manage-leave-requests")
        {
            return HttpResponse::Conflict().json(ApiError::new(
                "Only pending leave requests can be deleted",
            ));
        }
    }
    let is_super_admin = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    if owner != claims.sub && !is_super_admin {
        let perms = crate::middleware::rbac::load_user_permissions(&conn, claims.sub, false);
        if !crate::middleware::rbac::has_permission(&perms, "manage-leave-requests") {
            return HttpResponse::Forbidden().json(ApiError::new("Not allowed to delete this leave request"));
        }
    }
    if status == "approved" {
        if leave_overlaps_generated_payslip(&conn, owner, &start_date, &end_date) {
            return HttpResponse::Conflict().json(ApiError::new(
                "Cannot delete approved leave covered by a generated payslip — unlock and regenerate payroll first",
            ));
        }
    }
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "UPDATE leave_requests SET deleted_at=?1 WHERE id=?2",
        crate::params![&now, leave_id],
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"})))
}

pub async fn stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    HttpResponse::Ok().json(ApiResponse::success(user_leave_stats(&conn, claims.sub)))
}

pub async fn manage(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<LeaveListQuery>,
) -> HttpResponse {
    let _c = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&_c);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let data = fetch_leave_list(&conn, &query, org_id, None);
    HttpResponse::Ok().json(ApiResponse::success(data))
}

pub async fn list_all(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<LeaveListQuery>,
) -> HttpResponse {
    manage(pool, req, query).await
}

pub async fn admin_stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&_c);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let pending: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM leave_requests lr
             INNER JOIN users u ON u.id = lr.user_id AND u.organization_id = ?1
             WHERE lr.status='pending' AND lr.deleted_at IS NULL",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let approved: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM leave_requests lr
             INNER JOIN users u ON u.id = lr.user_id AND u.organization_id = ?1
             WHERE lr.status='approved' AND lr.deleted_at IS NULL",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let rejected: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM leave_requests lr
             INNER JOIN users u ON u.id = lr.user_id AND u.organization_id = ?1
             WHERE lr.status='rejected' AND lr.deleted_at IS NULL",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM leave_requests lr
             INNER JOIN users u ON u.id = lr.user_id AND u.organization_id = ?1
             WHERE lr.deleted_at IS NULL",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "total": total,
        "total_requests": total,
    })))
}

#[derive(Debug, Deserialize, Default)]
pub struct ApproveLeaveRequest {
    pub remarks: Option<String>,
}

pub async fn approve(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: Option<web::Json<ApproveLeaveRequest>>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let leave_id = path.into_inner();
    let leave_info: Option<(i64, String, String, String, i64, String, Option<String>)> = conn
        .query_row(
            "SELECT lr.user_id, lr.leave_type, lr.start_date, lr.end_date, lr.days_count, lr.status, lr.reason
             FROM leave_requests lr
             INNER JOIN users u ON u.id = lr.user_id AND u.organization_id = ?2
             WHERE lr.id = ?1 AND lr.deleted_at IS NULL",
            crate::params![leave_id, org_id],
            |row| {
                Ok((
                    row.get_idx::<i64>(0)?,
                    row.get_idx::<String>(1)?,
                    row.get_idx::<String>(2)?,
                    row.get_idx::<String>(3)?,
                    row.get_idx::<i64>(4)?,
                    row.get_idx::<String>(5)?,
                    row.get_idx::<Option<String>>(6)?,
                ))
            },
        )
        .ok();

    let Some((user_id, leave_type, start_date, end_date, days_count, status, reason)) = leave_info
    else {
        return HttpResponse::NotFound().json(ApiError::new("Leave request not found"));
    };
    if status != "pending" {
        return HttpResponse::Conflict().json(ApiError::new(
            "Leave request not found or already processed",
        ));
    }
    if leave_dates_outside_employment(&conn, user_id, &start_date, &end_date) {
        return HttpResponse::BadRequest().json(ApiError::new(
            "Leave dates fall outside the employee employment period",
        ));
    }
    if leave_overlaps_generated_payslip(&conn, user_id, &start_date, &end_date) {
        return HttpResponse::Conflict().json(ApiError::new(
            "Cannot approve leave that overlaps a generated payslip for this period",
        ));
    }
    if has_overlapping_leave(&conn, user_id, &start_date, &end_date, Some(leave_id)) {
        return HttpResponse::BadRequest().json(ApiError::new(
            "Leave dates overlap with an existing approved or pending request",
        ));
    }
    if crate::leave_type_logic::counts_toward_quota(&conn, org_id, &leave_type) {
        let year = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
            .map(|d| d.year())
            .unwrap_or_else(|_| chrono::Utc::now().year());
        if crate::payroll_logic::would_exceed_annual_quota(
            &conn,
            user_id,
            &start_date,
            &end_date,
            &leave_type,
            Some(leave_id),
        ) {
            let effective = crate::payroll_logic::employee_effective_leave_quota_for_type(
                &conn, user_id, year, org_id, &leave_type,
            )
            .unwrap_or(0);
            let used = crate::payroll_logic::employee_leave_used_for_type_in_year(
                &conn, user_id, year, &leave_type,
            );
            return HttpResponse::BadRequest().json(ApiError::new(&format!(
                "{} (used {} + requested > allowance {})",
                quota_exceeded_message(&conn, user_id, org_id, year, &leave_type),
                used,
                effective
            )));
        }
    }

    let remarks = body.and_then(|b| b.remarks.clone());

    let updated = conn.execute(
        "UPDATE leave_requests SET status='approved', approved_by=?1, approved_at=?2, remarks=COALESCE(?3, remarks), updated_at=?2
         WHERE id=?4 AND status='pending' AND deleted_at IS NULL
           AND user_id IN (SELECT id FROM users WHERE organization_id = ?5)",
        crate::params![claims.sub, &now, remarks, leave_id, org_id],
    );
    if updated.unwrap_or(0) == 0 {
        return HttpResponse::Conflict().json(ApiError::new(
            "Leave request not found or already processed",
        ));
    }

    sync_user_on_leave_status(&conn, user_id, true);

    crate::workflow_logic::trigger(
        &conn,
        org_id,
        "leave_request_approved",
        &serde_json::json!({
            "leave_id": leave_id,
            "user_id": user_id,
            "leave_type": leave_type,
            "start_date": start_date,
            "end_date": end_date,
            "days_count": days_count,
            "reason": reason,
            "approved_by": claims.sub,
            "organization_id": org_id,
        }),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Approved"})))
}

pub async fn reject(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<RejectLeaveRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let reason = body.rejection_reason.clone().unwrap_or_default();
    let leave_id = path.into_inner();

    let leave_info: Option<(i64, String, String, String, i64, Option<String>)> = conn
        .query_row(
            "SELECT lr.user_id, lr.leave_type, lr.start_date, lr.end_date, lr.days_count, lr.reason
             FROM leave_requests lr
             INNER JOIN users u ON u.id = lr.user_id AND u.organization_id = ?2
             WHERE lr.id = ?1 AND lr.status = 'pending' AND lr.deleted_at IS NULL",
            crate::params![leave_id, org_id],
            |row| {
                Ok((
                    row.get_idx::<i64>(0)?,
                    row.get_idx::<String>(1)?,
                    row.get_idx::<String>(2)?,
                    row.get_idx::<String>(3)?,
                    row.get_idx::<i64>(4)?,
                    row.get_idx::<Option<String>>(5)?,
                ))
            },
        )
        .ok();

    let Some((user_id, leave_type, start_date, end_date, days_count, request_reason)) = leave_info
    else {
        return HttpResponse::Conflict().json(ApiError::new(
            "Leave request not found or already processed",
        ));
    };

    let updated = conn.execute(
        "UPDATE leave_requests SET status='rejected', approved_by=?1, rejection_reason=?2, updated_at=?3
         WHERE id=?4 AND status='pending' AND deleted_at IS NULL
           AND user_id IN (SELECT id FROM users WHERE organization_id = ?5)",
        crate::params![claims.sub, reason, &now, leave_id, org_id],
    );
    if updated.unwrap_or(0) == 0 {
        return HttpResponse::Conflict().json(ApiError::new(
            "Leave request not found or already processed",
        ));
    }

    crate::workflow_logic::trigger(
        &conn,
        org_id,
        "leave_request_rejected",
        &serde_json::json!({
            "leave_id": leave_id,
            "user_id": user_id,
            "leave_type": leave_type,
            "start_date": start_date,
            "end_date": end_date,
            "days_count": days_count,
            "reason": request_reason,
            "rejected_by": claims.sub,
            "rejection_reason": reason,
            "organization_id": org_id,
        }),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Rejected"})))
}

#[derive(Debug, Deserialize)]
pub struct UpdateRemarksRequest {
    pub remarks: Option<String>,
}

pub async fn update_remarks(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<UpdateRemarksRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let leave_id = path.into_inner();
    let updated = conn.execute(
        "UPDATE leave_requests SET remarks=?1, updated_at=?2
         WHERE id=?3 AND deleted_at IS NULL
           AND user_id IN (SELECT id FROM users WHERE organization_id = ?4)",
        crate::params![body.remarks, &now, leave_id, org_id],
    );
    if updated.unwrap_or(0) == 0 {
        return HttpResponse::NotFound().json(ApiError::new("Leave request not found"));
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Remarks updated"})))
}
