use actix_web::{web, HttpRequest, HttpResponse};
use chrono::{Datelike, Local, NaiveDate};
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
}

#[derive(Debug, Deserialize)]
pub struct EmployeeAttendanceLogQuery {
    pub user_id: i64,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

fn can_view_org_attendance(conn: &crate::db::Connection, claims: &JwtClaims, org_id: i64) -> bool {
    if crate::middleware::rbac::effective_super_admin(conn, claims, org_id) {
        return true;
    }
    let perms = crate::middleware::rbac::load_user_permissions(conn, claims.sub, false);
    crate::middleware::rbac::has_permission(&perms, "manage-attendance")
        || crate::middleware::rbac::has_permission(&perms, "view-attendance")
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
        .prepare("SELECT id FROM users WHERE deleted_at IS NULL AND is_super_admin=0 AND organization_id = ?1 ORDER BY name")
        .map(|s| s.query_map([org_id], |r| r.get_idx::<i64>(0)))
        .unwrap_or_default();

    let rows: Vec<serde_json::Value> = user_ids
        .into_iter()
        .filter_map(|uid| {
            let emp = crate::handlers::payroll::build_employee_payroll(
                &conn, uid, org_id, month, year, None,
            )?;
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

    let stmt = match conn.prepare(
        "SELECT u.id, u.name, u.employee_id,
                MIN(a.clock_in) AS first_clock_in,
                MAX(a.clock_out) AS last_clock_out,
                COALESCE(SUM(a.duration_minutes), 0) AS total_minutes,
                COUNT(a.id) AS session_count,
                MAX(a.is_late) AS any_late,
                MAX(a.is_early_exit) AS any_early,
                SUM(CASE WHEN a.clock_out IS NULL AND a.clock_in IS NOT NULL THEN 1 ELSE 0 END) AS open_sessions
         FROM users u
         LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ?1 AND a.deleted_at IS NULL
         WHERE u.deleted_at IS NULL AND u.is_super_admin = 0 AND u.organization_id = ?2
         GROUP BY u.id
         ORDER BY u.name",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    let rows: Vec<serde_json::Value> = stmt
        .query_map(crate::params![date, org_id], |row| {
            let session_count: i64 = row.get_idx::<i64>(6).unwrap_or(0);
            let open_sessions: i64 = row.get_idx::<i64>(9).unwrap_or(0);
            let first_in: Option<String> = row.get_idx(3).ok();
            let user_id: i64 = row.get_idx::<i64>(0)?;
            let on_leave: bool = conn
                .query_row(
                    "SELECT 1 FROM leave_requests
                     WHERE user_id = ?1 AND status = 'approved' AND deleted_at IS NULL
                       AND start_date <= ?2 AND end_date >= ?2 LIMIT 1",
                    crate::params![user_id, &date],
                    |_| Ok(()),
                )
                .is_ok();
            let attendance_status = if session_count == 0 {
                if on_leave {
                    "on_leave"
                } else if day
                    .map(|d| !user_is_scheduled_working_day(&conn, user_id, &date, d))
                    .unwrap_or(false)
                {
                    "scheduled_off"
                } else {
                    "absent"
                }
            } else if open_sessions > 0 {
                "open"
            } else {
                "present"
            };
            Ok(serde_json::json!({
                "user_id": user_id,
                "name": row.get_idx::<String>(1)?,
                "employee_id": row.get_idx::<Option<String>>(2)?,
                "date": date,
                "check_in": first_in.as_ref().map(|t| combine_datetime(&date, t)),
                "check_out": row.get_idx::<Option<String>>(4).ok().flatten().map(|t| {
                    combine_clock_out_datetime(&date, first_in.as_deref().unwrap_or("00:00:00"), &t)
                }),
                "total_minutes": row.get_idx::<i64>(5).unwrap_or(0),
                "session_count": session_count,
                "is_late": row.get_idx::<i64>(7).unwrap_or(0) != 0,
                "is_early_exit": row.get_idx::<i64>(8).unwrap_or(0) != 0,
                "has_open_session": open_sessions > 0,
                "attendance_status": attendance_status,
                "sessions": [],
                "sources": [],
                "source_summary": { "biometric": 0, "app": 0, "manual": 0 },
            }))
        });

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
