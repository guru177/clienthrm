use actix_web::{web, HttpRequest, HttpResponse};
use chrono::Datelike;
use serde::Deserialize;

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;

#[derive(Debug, Deserialize)]
pub struct ReportMonthQuery {
    pub month: Option<i32>,
    pub year: Option<i32>,
}

fn month_bounds(month: i32, year: i32) -> (String, String) {
    let days = chrono::NaiveDate::from_ymd_opt(year, month as u32, 1)
        .map(|d| d.num_days_in_month() as i64)
        .unwrap_or(30);
    (
        format!("{}-{:02}-01", year, month),
        format!("{}-{:02}-{}", year, month, days),
    )
}

/// GET /api/admin/reports/attendance-summary
pub async fn attendance_summary(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<ReportMonthQuery>,
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

    let now = chrono::Utc::now();
    let month = query.month.unwrap_or(now.month() as i32);
    let year = query.year.unwrap_or(now.year());
    let (start, end) = month_bounds(month, year);

    let mut stmt = match conn.prepare(
        "SELECT u.id, u.name, u.employee_id,
                COUNT(DISTINCT a.date) AS present_days,
                COUNT(DISTINCT CASE WHEN a.is_late = 1 THEN a.date END) AS late_marks,
                COUNT(DISTINCT CASE WHEN a.is_early_exit = 1 THEN a.date END) AS early_exits
         FROM users u
         LEFT JOIN attendance a ON a.user_id = u.id AND a.date >= ?1 AND a.date <= ?2 AND a.deleted_at IS NULL
           AND a.clock_out IS NOT NULL
           AND a.date >= COALESCE(NULLIF(substr(u.date_of_joining, 1, 10), ''), '1900-01-01')
           AND (u.date_of_exit IS NULL OR u.date_of_exit = '' OR a.date <= substr(u.date_of_exit, 1, 10))
         WHERE u.deleted_at IS NULL AND u.is_super_admin = 0 AND u.organization_id = ?3
         GROUP BY u.id
         ORDER BY u.name",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    let rows: Vec<serde_json::Value> = stmt
        .query_map(crate::params![start, end, org_id], |row| {
            Ok(serde_json::json!({
                "user_id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
                "employee_id": row.get_idx::<Option<String>>(2)?,
                "present_days": row.get_idx::<i64>(3).unwrap_or(0),
                "late_marks": row.get_idx::<i64>(4).unwrap_or(0),
                "early_exits": row.get_idx::<i64>(5).unwrap_or(0),
            }))
        });

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "month": month,
        "year": year,
        "employees": rows,
        "total": rows.len(),
    })))
}

/// GET /api/admin/reports/payroll-register
pub async fn payroll_register(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<ReportMonthQuery>,
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

    let now = chrono::Utc::now();
    let month = query.month.unwrap_or(now.month() as i32);
    let year = query.year.unwrap_or(now.year());

    let mut stmt = match conn.prepare(
        "SELECT p.id, u.name, u.employee_id, p.gross_salary, p.total_deductions, p.net_salary, p.status,
                p.present_days, p.working_days, p.lop_deduction, COALESCE(p.shift_penalty, 0)
         FROM payslips p
         JOIN users u ON u.id = p.user_id AND u.organization_id = ?3
         WHERE p.month = ?1 AND p.year = ?2 AND p.status = 'generated'
         ORDER BY u.name",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    let rows: Vec<serde_json::Value> = stmt
        .query_map(crate::params![month, year, org_id], |row| {
            Ok(serde_json::json!({
                "payslip_id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
                "employee_id": row.get_idx::<Option<String>>(2)?,
                "gross_salary": row.get_idx::<f64>(3)?,
                "total_deductions": row.get_idx::<f64>(4)?,
                "net_salary": row.get_idx::<f64>(5)?,
                "status": row.get_idx::<String>(6)?,
                "present_days": row.get_idx::<i64>(7).unwrap_or(0),
                "working_days": row.get_idx::<i64>(8).unwrap_or(0),
                "lop_deduction": row.get_idx::<f64>(9).unwrap_or(0.0),
                "shift_penalty": row.get_idx::<f64>(10).unwrap_or(0.0),
            }))
        });

    let total_gross: f64 = rows.iter().filter_map(|r| r.get("gross_salary").and_then(|v| v.as_f64())).sum();
    let total_net: f64 = rows.iter().filter_map(|r| r.get("net_salary").and_then(|v| v.as_f64())).sum();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "month": month,
        "year": year,
        "total_gross": total_gross,
        "total_net": total_net,
        "payslips": rows,
    })))
}

/// GET /api/admin/reports/payroll-split — Excel-style salary split export data
pub async fn payroll_split(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<ReportMonthQuery>,
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

    let now = chrono::Utc::now();
    let month = query.month.unwrap_or(now.month() as i32);
    let year = query.year.unwrap_or(now.year());
    let cal_days = crate::payroll_logic::calendar_days_in_month(month, year);
    let month_end = format!("{}-{:02}-{}", year, month, cal_days);

    let user_ids: Vec<i64> = conn
        .prepare("SELECT id FROM users WHERE deleted_at IS NULL AND is_super_admin=0 AND organization_id = ?1 ORDER BY name")
        .map(|s| s.query_map([org_id], |r| r.get_idx::<i64>(0)))
        .unwrap_or_default();

    let rows: Vec<serde_json::Value> = user_ids
        .into_iter()
        .filter_map(|uid| {
            let emp = crate::handlers::payroll::build_employee_payroll(&conn, uid, org_id, month, year)?;
            let name = emp.get("name")?.as_str()?.to_string();
            let ss = emp.get("salary_structure")?;
            let profile = crate::salary_split::load_employee_profile(&conn, uid, &month_end);
            let cal_days = crate::payroll_logic::calendar_days_in_month(month, year);
            let month_end_s = format!("{}-{:02}-{}", year, month, cal_days);
            let salary = crate::salary_logic::load_user_salary(&conn, uid, &month_end_s);
            Some(serde_json::json!({
                "user_id": uid,
                "name": name,
                "yearly_ctc": profile.as_ref().map(|p| p.yearly_ctc),
                "monthly_ctc": salary.as_ref().map(|s| s.gross),
                "basic": salary.as_ref().map(|s| s.basic),
                "hra": salary.as_ref().map(|s| s.hra),
                "conveyance": salary.as_ref().map(|s| s.transport),
                "special": salary.as_ref().map(|s| s.other_earnings),
                "pf_applicable": profile.as_ref().map(|p| p.pf_applicable).unwrap_or(true),
                "esi_applicable": profile.as_ref().map(|p| p.esi_applicable).unwrap_or(true),
                "gross_salary": ss.get("gross_salary"),
                "gross_after_lop": ss.get("gross_after_lop"),
                "lop_breakdown": ss.get("lop_breakdown"),
                "lop_deduction": ss.get("lop_deduction"),
                "statutory": ss.get("statutory"),
                "pf_deduction": ss.get("pf_deduction"),
                "esi_deduction": ss.get("esi_deduction"),
                "prof_tax": ss.get("prof_tax"),
                "advance_deduction": ss.get("advance_deduction"),
                "total_deductions": ss.get("total_deductions"),
                "net_salary": ss.get("net_salary"),
                "absent_days": emp.get("absent_days"),
                "present_days": emp.get("present_days"),
            }))
        })
        .collect();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "month": month,
        "year": year,
        "calendar_days": cal_days,
        "rows": rows,
    })))
}

/// GET /api/admin/reports/leave-balance
pub async fn leave_balance(
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

    let year = chrono::Utc::now().year();
    let base_quota = crate::payroll_logic::annual_leave_quota(&conn, org_id);

    let mut users_stmt = match conn.prepare(
        "SELECT id, name, employee_id FROM users WHERE deleted_at IS NULL AND is_super_admin = 0 AND organization_id = ?1 ORDER BY name",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let users: Vec<(i64, String, Option<String>)> = users_stmt
        .query_map([org_id], |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<Option<String>>(2)?,
            ))
        });

    let rows: Vec<serde_json::Value> = users
        .into_iter()
        .map(|(uid, name, employee_id)| {
            let used = crate::payroll_logic::employee_leave_used_in_year(&conn, uid, year);
            let pending = crate::payroll_logic::employee_pending_leave_days_in_year(&conn, uid, year);
            let bonus = crate::payroll_logic::employee_leave_credits_in_year(&conn, uid, year);
            let effective = base_quota + bonus;
            let available = (effective - used - pending).max(0);
            serde_json::json!({
                "user_id": uid,
                "name": name,
                "employee_id": employee_id,
                "annual_quota": base_quota,
                "bonus_days": bonus,
                "total_allowance": effective,
                "used_days": used,
                "pending_days": pending,
                "balance": available,
                "available_days": available,
            })
        })
        .collect();

    HttpResponse::Ok().json(ApiResponse::success(rows))
}
