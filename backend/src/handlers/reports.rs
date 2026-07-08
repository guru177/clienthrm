use std::collections::{HashMap, HashSet};

use actix_web::{web, HttpRequest, HttpResponse};
use chrono::{Datelike, Duration, Local, NaiveDate};
use serde::Deserialize;

use crate::attendance_logic::{combine_clock_out_datetime, combine_datetime};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::attendance::Attendance;
use crate::models::{ApiError, ApiResponse};
use crate::models::user::JwtClaims;
use crate::shift_logic::{resolve_shift_for_user, user_is_scheduled_working_day};
use crate::tenant::org_id_from_claims;

#[derive(Debug, Deserialize)]
pub struct ReportMonthQuery {
    pub month: Option<i32>,
    pub year: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct DailyAttendanceQuery {
    pub date: Option<String>,
    pub search: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct EmployeeAttendanceLogQuery {
    pub user_id: i64,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct AttendanceRegisterQuery {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    /// Alias for start_date (legacy / alternate clients).
    pub from_date: Option<String>,
    /// Alias for end_date (legacy / alternate clients).
    pub to_date: Option<String>,
    pub department_id: Option<i64>,
    pub search: Option<String>,
}

const REGISTER_MAX_DAYS: i64 = 93;

fn date_range_list(start: NaiveDate, end: NaiveDate) -> Vec<String> {
    let mut dates = Vec::new();
    let mut d = start;
    while d <= end {
        dates.push(d.format("%Y-%m-%d").to_string());
        d += Duration::days(1);
    }
    dates
}

fn parse_ymd(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

fn day_attendance_status(
    session_count: i64,
    open_sessions: i64,
    on_leave: bool,
    is_holiday: bool,
    is_scheduled_working_day: bool,
) -> &'static str {
    if session_count == 0 {
        if on_leave {
            "on_leave"
        } else if is_holiday {
            "holiday"
        } else if !is_scheduled_working_day {
            "scheduled_off"
        } else {
            "absent"
        }
    } else if open_sessions > 0 {
        "open"
    } else {
        "present"
    }
}

fn status_to_register_code(status: &str) -> &'static str {
    match status {
        "present" => "P",
        "absent" => "A",
        "on_leave" => "L",
        "scheduled_off" => "O",
        "holiday" => "H",
        "open" => "•",
        _ => "",
    }
}

fn register_legend() -> serde_json::Value {
    serde_json::json!({
        "P": "Present",
        "A": "Absent",
        "L": "Leave",
        "O": "Off day",
        "H": "Holiday",
        "•": "Open session",
    })
}

fn can_view_org_attendance(conn: &crate::db::Connection, claims: &JwtClaims, org_id: i64) -> bool {
    if crate::middleware::rbac::effective_super_admin(conn, claims, org_id) {
        return true;
    }
    let perms = crate::middleware::rbac::load_user_permissions(conn, claims.sub, false);
    crate::middleware::rbac::has_permission(&perms, "manage-attendance")
        || crate::middleware::rbac::has_permission(&perms, "view-attendance")
}

fn can_view_attendance_register(conn: &crate::db::Connection, claims: &JwtClaims, org_id: i64) -> bool {
    if can_view_org_attendance(conn, claims, org_id) {
        return true;
    }
    let perms = crate::middleware::rbac::load_user_permissions(conn, claims.sub, false);
    crate::middleware::rbac::has_permission(&perms, "view-reports")
}

fn normalize_source(raw: Option<&str>) -> &'static str {
    match raw.map(str::trim).filter(|s| !s.is_empty()) {
        Some(s) if s.eq_ignore_ascii_case("biometric") || s.to_ascii_lowercase().contains("bio") => {
            "biometric"
        }
        Some(s) if s.eq_ignore_ascii_case("manual") => "manual",
        Some(s) if s.eq_ignore_ascii_case("app") => "app",
        Some(_) => "app",
        None => "app",
    }
}

fn source_label(source: &str) -> &'static str {
    match source {
        "biometric" => "Biometric device",
        "manual" => "Manual",
        _ => "App / system",
    }
}

fn session_detail_json(
    conn: &crate::db::Connection,
    att: &Attendance,
    user_name: Option<&str>,
    user_email: Option<&str>,
) -> serde_json::Value {
    let shift = resolve_shift_for_user(conn, att.user_id, &att.date);
    let source = normalize_source(att.source.as_deref());
    let clock_in = att.clock_in.as_ref().map(|t| combine_datetime(&att.date, t));
    let clock_out = att.clock_out.as_ref().map(|t| {
        combine_clock_out_datetime(
            &att.date,
            att.clock_in.as_deref().unwrap_or("00:00:00"),
            t,
        )
    });
    serde_json::json!({
        "id": att.id,
        "clock_in": clock_in,
        "clock_out": clock_out,
        "duration_minutes": att.duration_minutes,
        "is_late": att.is_late,
        "is_early_exit": att.is_early_exit,
        "status": att.status,
        "source": source,
        "source_label": source_label(source),
        "user": {
            "id": att.user_id,
            "name": user_name,
            "email": user_email,
        },
        "shift": shift.to_json(),
    })
}

fn session_log_json(
    conn: &crate::db::Connection,
    att: &Attendance,
    user_name: Option<&str>,
    user_email: Option<&str>,
    employee_id: Option<&str>,
) -> serde_json::Value {
    let shift = resolve_shift_for_user(conn, att.user_id, &att.date);
    let source = normalize_source(att.source.as_deref());
    let clock_in = att.clock_in.as_ref().map(|t| combine_datetime(&att.date, t));
    let clock_out = att.clock_out.as_ref().map(|t| {
        combine_clock_out_datetime(
            &att.date,
            att.clock_in.as_deref().unwrap_or("00:00:00"),
            t,
        )
    });
    serde_json::json!({
        "id": att.id,
        "user_id": att.user_id,
        "user": {
            "id": att.user_id,
            "name": user_name,
            "email": user_email,
            "employee_id": employee_id,
        },
        "date": att.date,
        "clock_in": clock_in,
        "clock_out": clock_out,
        "duration_minutes": att.duration_minutes,
        "is_late": att.is_late,
        "is_early_exit": att.is_early_exit,
        "status": att.status,
        "source": source,
        "source_label": source_label(source),
        "shift": shift.to_json(),
    })
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
    let conn = match pool.get_read() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let now = chrono::Utc::now();
    let month = query.month.unwrap_or(now.month() as i32);
    let year = query.year.unwrap_or(now.year());
    let (start, end) = month_bounds(month, year);

    let stmt = match conn.prepare(
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
    let conn = match pool.get_read() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let now = chrono::Utc::now();
    let month = query.month.unwrap_or(now.month() as i32);
    let year = query.year.unwrap_or(now.year());

    let stmt = match conn.prepare(
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

fn component_display_kind(slug: &str, name: &str) -> &'static str {
    match crate::salary_logic::bucket_component(slug, name) {
        "basic" | "hra" => "earn",
        _ => "yellow",
    }
}

fn earnings_map_from_components(components: &[serde_json::Value]) -> serde_json::Map<String, serde_json::Value> {
    let mut m = serde_json::Map::new();
    for c in components {
        if c.get("type").and_then(|v| v.as_str()) != Some("earning") {
            continue;
        }
        if c
            .get("is_reimbursement")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            continue;
        }
        let id = c.get("component_id").and_then(|v| v.as_i64()).unwrap_or(0);
        if id <= 0 {
            continue;
        }
        let amt = c.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
        m.insert(id.to_string(), serde_json::json!(amt));
    }
    m
}

fn component_lines_map(
    lines: &[crate::salary_split::ComponentLine],
    employee_only: bool,
) -> serde_json::Map<String, serde_json::Value> {
    let mut m = serde_json::Map::new();
    for line in lines {
        if employee_only && line.is_employer {
            continue;
        }
        if line.component_id <= 0 {
            continue;
        }
        m.insert(
            line.component_id.to_string(),
            serde_json::json!(line.amount),
        );
    }
    m
}

fn sum_nested_maps(rows: &[serde_json::Value], key: &str) -> serde_json::Map<String, serde_json::Value> {
    let mut out = serde_json::Map::new();
    for row in rows {
        let Some(obj) = row.get(key).and_then(|v| v.as_object()) else {
            continue;
        };
        for (k, v) in obj {
            let amt = v.as_f64().unwrap_or(0.0);
            let cur = out.get(k).and_then(|x| x.as_f64()).unwrap_or(0.0);
            out.insert(k.clone(), serde_json::json!(cur + amt));
        }
    }
    out
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
    let conn = match pool.get_read() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let now = chrono::Utc::now();
    let month = query.month.unwrap_or(now.month() as i32);
    let year = query.year.unwrap_or(now.year());
    let cal_days = crate::payroll_logic::calendar_days_in_month(month, year);
    let month_end = format!("{}-{:02}-{}", year, month, cal_days);

    let user_ids: Vec<i64> = conn
        .prepare("SELECT id FROM users WHERE deleted_at IS NULL AND organization_id = ?1 ORDER BY name")
        .map(|s| s.query_map([org_id], |r| r.get_idx::<i64>(0)))
        .unwrap_or_default();

    let user_meta: std::collections::HashMap<i64, (String, Option<String>, Option<String>, Option<String>)> = conn
        .prepare(
            "SELECT id, name, employee_id, date_of_birth, date_of_joining FROM users
             WHERE deleted_at IS NULL AND organization_id = ?1",
        )
        .map(|s| {
            s.query_map([org_id], |row| {
                Ok((
                    row.get_idx::<i64>(0)?,
                    row.get_idx::<String>(1)?,
                    row.get_idx::<Option<String>>(2)?,
                    row.get_idx::<Option<String>>(3)?,
                    row.get_idx::<Option<String>>(4)?,
                ))
            })
        })
        .unwrap_or_default()
        .into_iter()
        .map(|(id, name, eid, dob, doj)| (id, (name, eid, dob, doj)))
        .collect();

    let statutory_cfg = crate::statutory_logic::load_statutory_config(&conn, org_id);

    let comp_config = crate::salary_split::load_component_split_config(&conn, org_id);
    let mut earning_columns: Vec<serde_json::Value> = comp_config
        .earnings
        .iter()
        .map(|e| {
            serde_json::json!({
                "id": e.id,
                "name": e.name,
                "slug": e.slug,
                "kind": component_display_kind(&e.slug, &e.name),
            })
        })
        .collect();

    let mut deduction_columns: Vec<serde_json::Value> = comp_config
        .deductions
        .iter()
        .filter(|d| !crate::salary_split::is_employer_deduction(d))
        .map(|d| {
            serde_json::json!({
                "id": d.id,
                "name": d.name,
                "slug": d.slug,
                "is_pre_tax": d.is_pre_tax,
                "kind": "deduct",
            })
        })
        .collect();

    let mut deduction_name_by_id: HashMap<i64, String> = deduction_columns
        .iter()
        .filter_map(|c| {
            let id = c.get("id")?.as_i64()?;
            let name = c.get("name")?.as_str()?.to_string();
            Some((id, name))
        })
        .collect();

    let rows: Vec<serde_json::Value> = user_ids
        .into_iter()
        .filter_map(|uid| {
            let (name, employee_id, date_of_birth, date_of_joining) =
                user_meta.get(&uid).cloned()?;
            let profile = crate::salary_split::load_employee_profile(&conn, uid, &month_end);
            let month_end_s = format!("{}-{:02}-{}", year, month, cal_days);

            let (
                yearly_ctc,
                monthly_ctc,
                gross_salary,
                earnings,
                deductions,
                total_deductions,
                net_salary,
                has_salary,
            ) = if let Some(ref prof) = profile {
                let preview =
                    crate::salary_split::preview_for_profile(&conn, org_id, prof);
                (
                    Some(preview.yearly_ctc),
                    Some(preview.monthly_ctc),
                    Some(preview.gross),
                    component_lines_map(&preview.earning_lines, false),
                    component_lines_map(&preview.deduction_lines, true),
                    Some(preview.total_employee_deductions),
                    Some(preview.net_take_home),
                    true,
                )
            } else if let Some(salary) =
                crate::salary_logic::load_user_salary(&conn, uid, &month_end_s)
            {
                let pf_on = comp_config.has_pf;
                let esi_on = comp_config.has_esi;
                let ded_lines = crate::salary_split::build_payroll_deduction_lines(
                    &comp_config,
                    &statutory_cfg,
                    salary.basic,
                    salary.gross,
                    0.0,
                    pf_on,
                    esi_on,
                );
                let statutory =
                    crate::salary_split::statutory_result_from_lines(&ded_lines);
                let total = statutory.total_employee;
                (
                    Some(salary.gross * 12.0),
                    Some(salary.gross),
                    Some(salary.gross),
                    earnings_map_from_components(&salary.components),
                    component_lines_map(&ded_lines, true),
                    Some(total),
                    Some((salary.gross - total).max(0.0)),
                    true,
                )
            } else {
                (
                    None,
                    None,
                    None,
                    serde_json::Map::new(),
                    serde_json::Map::new(),
                    None,
                    None,
                    false,
                )
            };

            Some(serde_json::json!({
                "user_id": uid,
                "name": name,
                "employee_id": employee_id,
                "date_of_birth": date_of_birth,
                "date_of_joining": date_of_joining,
                "yearly_ctc": yearly_ctc,
                "monthly_ctc": monthly_ctc,
                "gross_salary": gross_salary,
                "earnings": earnings,
                "deductions": deductions,
                "total_deductions": total_deductions,
                "net_salary": net_salary,
                "has_salary": has_salary,
            }))
        })
        .collect();

    let mut column_meta: HashMap<i64, (String, String, String)> = earning_columns
        .iter()
        .filter_map(|c| {
            let id = c.get("id")?.as_i64()?;
            let name = c.get("name")?.as_str()?.to_string();
            let slug = c.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let kind = c.get("kind").and_then(|v| v.as_str()).unwrap_or("yellow").to_string();
            Some((id, (name, slug, kind)))
        })
        .collect();

    for row in &rows {
        for key in ["earnings", "deductions"] {
            let Some(obj) = row.get(key).and_then(|v| v.as_object()) else {
                continue;
            };
            for id_s in obj.keys() {
                let Ok(id) = id_s.parse::<i64>() else { continue };
                if key == "deductions" {
                    if deduction_name_by_id.contains_key(&id) {
                        continue;
                    }
                    if let Ok((name, slug)) = conn.query_row(
                        "SELECT name, COALESCE(slug, '') FROM salary_components
                         WHERE id = ?1 AND organization_id = ?2",
                        crate::params![id, org_id],
                        |r| Ok((r.get_idx::<String>(0)?, r.get_idx::<String>(1)?)),
                    ) {
                        deduction_name_by_id.insert(id, name.clone());
                        deduction_columns.push(serde_json::json!({
                            "id": id,
                            "name": name,
                            "slug": slug,
                            "kind": "deduct",
                        }));
                    }
                    continue;
                }
                if column_meta.contains_key(&id) {
                    continue;
                }
                if let Ok((name, slug)) = conn.query_row(
                    "SELECT name, COALESCE(slug, '') FROM salary_components
                     WHERE id = ?1 AND organization_id = ?2",
                    crate::params![id, org_id],
                    |r| Ok((r.get_idx::<String>(0)?, r.get_idx::<String>(1)?)),
                ) {
                    let kind = component_display_kind(&slug, &name).to_string();
                    column_meta.insert(id, (name, slug, kind));
                }
            }
        }
    }

    earning_columns = column_meta
        .iter()
        .map(|(id, (name, slug, kind))| {
            serde_json::json!({
                "id": id,
                "name": name,
                "slug": slug,
                "kind": kind,
            })
        })
        .collect();
    earning_columns.sort_by(|a, b| {
        a.get("id")
            .and_then(|v| v.as_i64())
            .unwrap_or(0)
            .cmp(&b.get("id").and_then(|v| v.as_i64()).unwrap_or(0))
    });

    deduction_columns.sort_by(|a, b| {
        a.get("id")
            .and_then(|v| v.as_i64())
            .unwrap_or(0)
            .cmp(&b.get("id").and_then(|v| v.as_i64()).unwrap_or(0))
    });

    fn sum_key(rows: &[serde_json::Value], key: &str) -> f64 {
        rows.iter()
            .filter_map(|r| r.get(key).and_then(|v| v.as_f64()))
            .sum()
    }

    let totals = serde_json::json!({
        "yearly_ctc": sum_key(&rows, "yearly_ctc"),
        "monthly_ctc": sum_key(&rows, "monthly_ctc"),
        "gross_salary": sum_key(&rows, "gross_salary"),
        "earnings": sum_nested_maps(&rows, "earnings"),
        "deductions": sum_nested_maps(&rows, "deductions"),
        "total_deductions": sum_key(&rows, "total_deductions"),
        "net_salary": sum_key(&rows, "net_salary"),
    });

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "month": month,
        "year": year,
        "calendar_days": cal_days,
        "earning_columns": earning_columns,
        "deduction_columns": deduction_columns,
        "rows": rows,
        "totals": totals,
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
    let conn = match pool.get_read() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let year = chrono::Utc::now().year();
    let base_quota = crate::payroll_logic::annual_leave_quota(&conn, org_id);

    let users_stmt = match conn.prepare(
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

/// GET /api/admin/reports/daily-attendance?date=YYYY-MM-DD
/// One row per employee for the selected day: check-in, check-out, total time.
pub async fn daily_attendance_register(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<DailyAttendanceQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_read() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    if !can_view_org_attendance(&conn, &claims, org_id) {
        return HttpResponse::Forbidden().json(ApiError::new("Permission denied"));
    }

    let date = query
        .date
        .clone()
        .filter(|d| !d.is_empty())
        .unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());

    // Merge biometric device punches into attendance (include next day for overnight clock-outs).
    let sync_end = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map(|d| (d + chrono::Duration::days(1)).format("%Y-%m-%d").to_string())
        .unwrap_or_else(|_| date.clone());
    let synced =
        crate::handlers::biometric::sync_org_biometric_punches_between(&conn, org_id, &date, &sync_end);

    let day = NaiveDate::parse_from_str(&date, "%Y-%m-%d").ok();

    let mut sql = String::from(
        "SELECT u.id, u.name, u.employee_id, u.phone, d.name AS department_name,
                MIN(a.clock_in) AS first_clock_in,
                MAX(a.clock_out) AS last_clock_out,
                COALESCE(SUM(a.duration_minutes), 0) AS total_minutes,
                COUNT(a.id) AS session_count,
                MAX(a.is_late) AS any_late,
                MAX(a.is_early_exit) AS any_early,
                SUM(CASE WHEN a.clock_out IS NULL AND a.clock_in IS NOT NULL THEN 1 ELSE 0 END) AS open_sessions
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id AND d.organization_id = u.organization_id
         LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ?1 AND a.deleted_at IS NULL
         WHERE u.deleted_at IS NULL AND u.is_super_admin = 0 AND u.organization_id = ?2
           AND TRIM(COALESCE(u.name, '')) != ''",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![
        crate::db::into_param_value(date.clone()),
        crate::db::into_param_value(org_id),
    ];

    if let Some(ref search) = query.search {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            let like = format!("%{trimmed}%");
            sql.push_str(
                " AND (u.name LIKE ?3 OR COALESCE(u.email, '') LIKE ?4 OR COALESCE(u.phone, '') LIKE ?5 OR COALESCE(d.name, '') LIKE ?6)",
            );
            params.push(crate::db::into_param_value(like.clone()));
            params.push(crate::db::into_param_value(like.clone()));
            params.push(crate::db::into_param_value(like.clone()));
            params.push(crate::db::into_param_value(like));
        }
    }

    sql.push_str(
        " GROUP BY u.id, u.name, u.employee_id, u.phone, d.name ORDER BY u.name",
    );

    let date_for_rows = date.clone();
    let rows: Vec<serde_json::Value> = match conn.query_map_result(&sql, &params, |row| {
            let session_count: i64 = row.get_idx::<i64>(8).unwrap_or(0);
            let open_sessions: i64 = row.get_idx::<i64>(11).unwrap_or(0);
            let first_in: Option<String> = row.get_idx(5).ok();
            let user_id: i64 = row.get_idx::<i64>(0)?;
            let on_leave: bool = conn
                .query_row(
                    "SELECT 1 FROM leave_requests
                     WHERE user_id = ?1 AND status = 'approved' AND deleted_at IS NULL
                       AND start_date <= ?2 AND end_date >= ?2 LIMIT 1",
                    crate::params![user_id, &date_for_rows],
                    |_| Ok(()),
                )
                .is_ok();
            let is_holiday: bool = conn
                .query_row(
                    "SELECT 1 FROM holidays WHERE organization_id = ?1 AND date = ?2 LIMIT 1",
                    crate::params![org_id, &date_for_rows],
                    |_| Ok(()),
                )
                .is_ok();
            let is_working = day
                .map(|d| user_is_scheduled_working_day(&conn, user_id, &date_for_rows, d))
                .unwrap_or(true);
            let attendance_status = day_attendance_status(
                session_count,
                open_sessions,
                on_leave,
                is_holiday,
                is_working,
            );
            Ok(serde_json::json!({
                "user_id": user_id,
                "name": row.get_idx::<String>(1)?,
                "employee_id": row.get_idx::<Option<String>>(2)?,
                "phone": row.get_idx::<Option<String>>(3)?,
                "department_name": row.get_idx::<Option<String>>(4)?,
                "date": date_for_rows,
                "check_in": first_in.as_ref().map(|t| combine_datetime(&date_for_rows, t)),
                "check_out": row.get_idx::<Option<String>>(6).ok().flatten().map(|t| {
                    combine_clock_out_datetime(&date_for_rows, first_in.as_deref().unwrap_or("00:00:00"), &t)
                }),
                "total_minutes": row.get_idx::<i64>(7).unwrap_or(0),
                "session_count": session_count,
                "is_late": row.get_idx::<i64>(9).unwrap_or(0) != 0,
                "is_early_exit": row.get_idx::<i64>(10).unwrap_or(0) != 0,
                "has_open_session": open_sessions > 0,
                "attendance_status": attendance_status,
                "sessions": [],
                "sources": [],
                "source_summary": { "biometric": 0, "app": 0, "manual": 0 },
            }))
        }) {
        Ok(r) => r,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    // Attach session-level detail (biometric + app/system combined).
    let session_stmt = match conn.prepare(
        "SELECT a.*, u.name as user_name, u.email as user_email
         FROM attendance a
         INNER JOIN users u ON u.id = a.user_id
         WHERE u.organization_id = ?1 AND a.date = ?2 AND a.deleted_at IS NULL
         ORDER BY u.name, a.clock_in, a.id",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    struct DaySession {
        att: Attendance,
        user_name: Option<String>,
        user_email: Option<String>,
    }

    let day_sessions: Vec<DaySession> = session_stmt.query_map(
        crate::params![org_id, date],
        |row| {
            Ok(DaySession {
                att: Attendance::from_row(row)?,
                user_name: row.get::<Option<String>>("user_name").ok().flatten(),
                user_email: row.get::<Option<String>>("user_email").ok().flatten(),
            })
        },
    );

    let enriched: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|mut row| {
            let user_id = row.get("user_id").and_then(|v| v.as_i64()).unwrap_or(0);
            let mut bio = 0i64;
            let mut app = 0i64;
            let mut manual = 0i64;
            let mut sources: Vec<String> = Vec::new();
            let sessions: Vec<serde_json::Value> = day_sessions
                .iter()
                .filter(|s| s.att.user_id == user_id)
                .map(|s| {
                    let detail = session_detail_json(
                        &conn,
                        &s.att,
                        s.user_name.as_deref(),
                        s.user_email.as_deref(),
                    );
                    let src = detail
                        .get("source")
                        .and_then(|v| v.as_str())
                        .unwrap_or("app");
                    if src == "biometric" {
                        bio += 1;
                        if !sources.contains(&"biometric".to_string()) {
                            sources.push("biometric".to_string());
                        }
                    } else if src == "manual" {
                        manual += 1;
                        if !sources.contains(&"manual".to_string()) {
                            sources.push("manual".to_string());
                        }
                    } else {
                        app += 1;
                        if !sources.contains(&"app".to_string()) {
                            sources.push("app".to_string());
                        }
                    }
                    detail
                })
                .collect();

            if let Some(obj) = row.as_object_mut() {
                obj.insert("sessions".to_string(), serde_json::json!(sessions));
                obj.insert("sources".to_string(), serde_json::json!(sources));
                obj.insert(
                    "source_summary".to_string(),
                    serde_json::json!({ "biometric": bio, "app": app, "manual": manual }),
                );
            }
            row
        })
        .collect();

    let present_count = enriched
        .iter()
        .filter(|r| r.get("attendance_status").and_then(|v| v.as_str()) == Some("present"))
        .count();
    let open_count = enriched
        .iter()
        .filter(|r| r.get("attendance_status").and_then(|v| v.as_str()) == Some("open"))
        .count();
    let scheduled_off_count = enriched
        .iter()
        .filter(|r| r.get("attendance_status").and_then(|v| v.as_str()) == Some("scheduled_off"))
        .count();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "date": date,
        "employees": enriched,
        "total_employees": enriched.len(),
        "present_count": present_count,
        "open_count": open_count,
        "absent_count": enriched
            .iter()
            .filter(|r| r.get("attendance_status").and_then(|v| v.as_str()) == Some("absent"))
            .count(),
        "scheduled_off_count": scheduled_off_count,
        "biometric_synced": synced,
    })))
}

/// GET /api/admin/reports/employee-attendance-log?user_id=&start_date=&end_date=
pub async fn employee_attendance_log(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<EmployeeAttendanceLogQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_read() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let view_org = can_view_org_attendance(&conn, &claims, org_id);
    if !view_org && query.user_id != claims.sub {
        return HttpResponse::Forbidden().json(ApiError::new("Cannot view another employee's attendance log"));
    }

    let user_row = conn.query_row(
        "SELECT id, name, email, employee_id FROM users
         WHERE id = ?1 AND organization_id = ?2 AND deleted_at IS NULL",
        crate::params![query.user_id, org_id],
        |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<Option<String>>(2)?,
                row.get_idx::<Option<String>>(3)?,
            ))
        },
    );
    let Ok((uid, user_name, user_email, employee_id)) = user_row else {
        return HttpResponse::NotFound().json(ApiError::new("Employee not found"));
    };

    let today = Local::now().format("%Y-%m-%d").to_string();
    let start_date = query
        .start_date
        .clone()
        .filter(|d| !d.is_empty())
        .unwrap_or_else(|| {
            let now = Local::now();
            format!("{}-{:02}-01", now.year(), now.month())
        });
    let end_date = query
        .end_date
        .clone()
        .filter(|d| !d.is_empty())
        .unwrap_or(today.clone());

    let biometric_synced =
        crate::handlers::biometric::sync_org_biometric_punches_between(&conn, org_id, &start_date, &end_date);

    let per_page = query.per_page.unwrap_or(50).clamp(1, 200);
    let page = query.page.unwrap_or(1).max(1);
    let offset = (page - 1) * per_page;

    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM attendance
             WHERE user_id = ?1 AND deleted_at IS NULL AND date >= ?2 AND date <= ?3",
            crate::params![uid, start_date, end_date],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    let stmt = match conn.prepare(
        "SELECT * FROM attendance
         WHERE user_id = ?1 AND deleted_at IS NULL AND date >= ?2 AND date <= ?3
         ORDER BY date DESC, id DESC
         LIMIT ?4 OFFSET ?5",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    let sessions: Vec<Attendance> = stmt.query_map(
        crate::params![uid, start_date, end_date, per_page, offset],
        Attendance::from_row,
    );

    let rows: Vec<serde_json::Value> = sessions
        .iter()
        .map(|att| {
            session_log_json(
                &conn,
                att,
                Some(&user_name),
                user_email.as_deref(),
                employee_id.as_deref(),
            )
        })
        .collect();

    let total_minutes: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(duration_minutes), 0) FROM attendance
             WHERE user_id = ?1 AND deleted_at IS NULL AND date >= ?2 AND date <= ?3",
            crate::params![uid, start_date, end_date],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    let distinct_days: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT date) FROM attendance
             WHERE user_id = ?1 AND deleted_at IS NULL AND date >= ?2 AND date <= ?3",
            crate::params![uid, start_date, end_date],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    let biometric_sessions: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM attendance
             WHERE user_id = ?1 AND deleted_at IS NULL AND date >= ?2 AND date <= ?3
               AND lower(COALESCE(source, '')) = 'biometric'",
            crate::params![uid, start_date, end_date],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let app_sessions = total.saturating_sub(biometric_sessions);

    let last_page = ((total as f64) / (per_page as f64)).ceil().max(1.0) as i64;

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "employee": {
            "id": uid,
            "name": user_name,
            "email": user_email,
            "employee_id": employee_id,
        },
        "start_date": start_date,
        "end_date": end_date,
        "summary": {
            "total_sessions": total,
            "distinct_days": distinct_days,
            "total_minutes": total_minutes,
            "by_source": {
                "biometric": biometric_sessions,
                "app": app_sessions,
            },
        },
        "sessions": rows,
        "current_page": page,
        "last_page": last_page,
        "total": total,
        "per_page": per_page,
        "biometric_synced": biometric_synced,
    })))
}

/// GET /api/admin/reports/attendance-register?start_date=&end_date=&department_id=&search=
/// Book-style matrix: employees × days with register codes (P/A/L/O/H/•).
pub async fn attendance_register(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<AttendanceRegisterQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_read() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    if !can_view_attendance_register(&conn, &claims, org_id) {
        return HttpResponse::Forbidden().json(ApiError::new("Permission denied"));
    }

    let now = Local::now();
    let default_start = format!("{}-{:02}-01", now.year(), now.month());
    let default_end = now.format("%Y-%m-%d").to_string();

    let start_s = query
        .start_date
        .clone()
        .or_else(|| query.from_date.clone())
        .filter(|d| !d.is_empty())
        .unwrap_or(default_start);
    let end_s = query
        .end_date
        .clone()
        .or_else(|| query.to_date.clone())
        .filter(|d| !d.is_empty())
        .unwrap_or(default_end);

    let start_date = match parse_ymd(&start_s) {
        Some(d) => d,
        None => return HttpResponse::BadRequest().json(ApiError::new("Invalid start_date")),
    };
    let end_date = match parse_ymd(&end_s) {
        Some(d) => d,
        None => return HttpResponse::BadRequest().json(ApiError::new("Invalid end_date")),
    };

    if start_date > end_date {
        return HttpResponse::BadRequest().json(ApiError::new("start_date must be on or before end_date"));
    }

    let span_days = (end_date - start_date).num_days() + 1;
    if span_days > REGISTER_MAX_DAYS {
        return HttpResponse::BadRequest().json(ApiError::new(&format!(
            "Date range cannot exceed {REGISTER_MAX_DAYS} days"
        )));
    }

    let dates = date_range_list(start_date, end_date);
    let sync_end = (end_date + Duration::days(1)).format("%Y-%m-%d").to_string();
    let biometric_synced =
        crate::handlers::biometric::sync_org_biometric_punches_between(&conn, org_id, &start_s, &sync_end);

    // Active employees
    let mut emp_sql = String::from(
        "SELECT u.id, u.name, u.employee_id, d.name AS department_name
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id AND d.organization_id = u.organization_id
         WHERE u.deleted_at IS NULL AND u.is_super_admin = 0 AND u.organization_id = ?1
           AND TRIM(COALESCE(u.name, '')) != ''",
    );
    let mut emp_params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    let mut next_idx = 2i32;

    if let Some(dept_id) = query.department_id {
        emp_sql.push_str(&format!(" AND u.department_id = ?{next_idx}"));
        emp_params.push(crate::db::into_param_value(dept_id));
        next_idx += 1;
    }

    if let Some(ref search) = query.search {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            let like = format!("%{trimmed}%");
            emp_sql.push_str(&format!(
                " AND (u.name LIKE ?{next_idx} OR COALESCE(u.email, '') LIKE ?{} OR COALESCE(u.phone, '') LIKE ?{} OR COALESCE(d.name, '') LIKE ?{})",
                next_idx + 1,
                next_idx + 2,
                next_idx + 3
            ));
            emp_params.push(crate::db::into_param_value(like.clone()));
            emp_params.push(crate::db::into_param_value(like.clone()));
            emp_params.push(crate::db::into_param_value(like.clone()));
            emp_params.push(crate::db::into_param_value(like));
        }
    }

    emp_sql.push_str(" ORDER BY u.name");

    let employees: Vec<(i64, String, Option<String>, Option<String>)> = match conn
        .query_map_result(&emp_sql, &emp_params, |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<Option<String>>(2)?,
                row.get_idx::<Option<String>>(3)?,
            ))
        }) {
        Ok(r) => r,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    // Attendance aggregates per user per day
    let att_stmt = match conn.prepare(
        "SELECT a.user_id, a.date,
                COUNT(a.id) AS session_count,
                SUM(CASE WHEN a.clock_out IS NULL AND a.clock_in IS NOT NULL THEN 1 ELSE 0 END) AS open_sessions
         FROM attendance a
         INNER JOIN users u ON u.id = a.user_id AND u.organization_id = ?1
         WHERE a.deleted_at IS NULL AND a.date >= ?2 AND a.date <= ?3
         GROUP BY a.user_id, a.date",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    let mut attendance_map: HashMap<(i64, String), (i64, i64)> = HashMap::new();
    let att_rows: Vec<(i64, String, i64, i64)> = att_stmt
        .query_map(crate::params![org_id, start_s, end_s], |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<i64>(2).unwrap_or(0),
                row.get_idx::<i64>(3).unwrap_or(0),
            ))
        });
    for (uid, date, sc, os) in att_rows {
        attendance_map.insert((uid, date), (sc, os));
    }

    // Approved leave overlapping range → (user_id, date) set
    let leave_stmt = match conn.prepare(
        "SELECT lr.user_id, lr.start_date, lr.end_date
         FROM leave_requests lr
         INNER JOIN users u ON u.id = lr.user_id AND u.organization_id = ?1
         WHERE lr.status = 'approved' AND lr.deleted_at IS NULL
           AND lr.start_date <= ?3 AND lr.end_date >= ?2",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    let mut leave_set: HashSet<(i64, String)> = HashSet::new();
    let leave_rows: Vec<(i64, String, String)> = leave_stmt
        .query_map(crate::params![org_id, start_s, end_s], |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<String>(2)?,
            ))
        });
    for (uid, ls, le) in leave_rows {
        let ls_d = parse_ymd(&ls).unwrap_or(start_date);
        let le_d = parse_ymd(&le).unwrap_or(end_date);
        let from = ls_d.max(start_date);
        let to = le_d.min(end_date);
        let mut d = from;
        while d <= to {
            leave_set.insert((uid, d.format("%Y-%m-%d").to_string()));
            d += Duration::days(1);
        }
    }

    // Org holidays in range
    let holiday_stmt = match conn.prepare(
        "SELECT date FROM holidays WHERE organization_id = ?1 AND date >= ?2 AND date <= ?3",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let holiday_dates: HashSet<String> = holiday_stmt
        .query_map(crate::params![org_id, start_s, end_s], |row| {
            row.get_idx::<String>(0)
        })
        .into_iter()
        .collect();

    let mut daily_totals: HashMap<String, serde_json::Value> = HashMap::new();
    for date in &dates {
        daily_totals.insert(
            date.clone(),
            serde_json::json!({
                "present": 0,
                "absent": 0,
                "leave": 0,
                "off": 0,
                "holiday": 0,
                "open": 0,
            }),
        );
    }

    let employee_rows: Vec<serde_json::Value> = employees
        .into_iter()
        .map(|(user_id, name, employee_id, department_name)| {
            let mut days_map = serde_json::Map::new();
            let mut present_days = 0i64;

            for date in &dates {
                let naive = parse_ymd(date).unwrap_or(start_date);
                let (session_count, open_sessions) = attendance_map
                    .get(&(user_id, date.clone()))
                    .copied()
                    .unwrap_or((0, 0));
                let on_leave = leave_set.contains(&(user_id, date.clone()));
                let is_holiday = holiday_dates.contains(date);
                let is_working =
                    user_is_scheduled_working_day(&conn, user_id, date, naive);
                let status = day_attendance_status(
                    session_count,
                    open_sessions,
                    on_leave,
                    is_holiday,
                    is_working,
                );
                let code = status_to_register_code(status);
                if status == "present" {
                    present_days += 1;
                }

                if let Some(totals) = daily_totals.get_mut(date) {
                    if let Some(obj) = totals.as_object_mut() {
                        let key = match status {
                            "present" => "present",
                            "absent" => "absent",
                            "on_leave" => "leave",
                            "scheduled_off" => "off",
                            "holiday" => "holiday",
                            "open" => "open",
                            _ => "",
                        };
                        if !key.is_empty() {
                            if let Some(v) = obj.get_mut(key) {
                                *v = serde_json::json!(v.as_i64().unwrap_or(0) + 1);
                            }
                        }
                    }
                }

                days_map.insert(date.clone(), serde_json::Value::String(code.to_string()));
            }

            serde_json::json!({
                "user_id": user_id,
                "name": name,
                "employee_id": employee_id,
                "department_name": department_name,
                "days": days_map,
                "present_days": present_days,
            })
        })
        .collect();

    let daily_totals_json: serde_json::Map<String, serde_json::Value> =
        daily_totals.into_iter().collect();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "start_date": start_s,
        "end_date": end_s,
        "dates": dates,
        "legend": register_legend(),
        "employees": employee_rows,
        "daily_totals": daily_totals_json,
        "total_employees": employee_rows.len(),
        "biometric_synced": biometric_synced,
    })))
}
