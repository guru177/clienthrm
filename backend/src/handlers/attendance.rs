use actix_web::{web, HttpRequest, HttpResponse};
use chrono::{Datelike, Local, NaiveDate};
use serde::Deserialize;
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::attendance::{
    Attendance, AttendanceListQuery, AttendanceStatsQuery, BulkManualAttendanceRequest, ClockInRequest,
    CreateAttendanceRequest, UpdateAttendanceRequest,
};
use crate::attendance_logic::{close_open_session_before_clock_in, combine_clock_out_datetime, combine_datetime, find_open_attendance_session};
use crate::shift_logic::{
    calc_duration_minutes, early_for_shift, late_for_shift,
    resolve_shift_for_user, user_is_scheduled_working_day, ShiftConfig,
};
use crate::models::user::JwtClaims;
use crate::tenant::org_id_from_claims;

pub fn can_view_org_attendance(conn: &crate::db::Connection, claims: &JwtClaims, org_id: i64) -> bool {
    if crate::middleware::rbac::effective_super_admin(conn, claims, org_id) {
        return true;
    }
    let perms = crate::middleware::rbac::load_user_permissions(conn, claims.sub, false);
    crate::middleware::rbac::has_permission(&perms, "manage-attendance")
}

fn can_mark_attendance(conn: &crate::db::Connection, claims: &JwtClaims, org_id: i64) -> bool {
    if crate::middleware::rbac::effective_super_admin(conn, claims, org_id) {
        return true;
    }
    let perms = crate::middleware::rbac::load_user_permissions(conn, claims.sub, false);
    crate::middleware::rbac::has_permission(&perms, "manage-attendance")
        || crate::middleware::rbac::has_permission(&perms, "mark-attendance")
}

fn session_json(att: &Attendance, shift: Option<&ShiftConfig>) -> serde_json::Value {
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
        "date": att.date,
        "clock_in": clock_in,
        "clock_out": clock_out,
        "duration_minutes": att.duration_minutes,
        "is_late": att.is_late,
        "is_early_exit": att.is_early_exit,
        "status": att.status,
        "source": att.source,
        "clock_in_face_verified": att.clock_in_face_verified,
        "clock_in_face_match_score": att.clock_in_face_match_score,
        "shift": shift.map(|s| s.to_json()).unwrap_or(serde_json::Value::Null),
    })
}

fn fetch_user_sessions(
    conn: &crate::db::Connection,
    user_id: i64,
    date: &str,
) -> Vec<Attendance> {
    let sql = "SELECT * FROM attendance WHERE user_id=?1 AND date=?2 AND deleted_at IS NULL ORDER BY id DESC";
    let stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map(crate::params![user_id, date], Attendance::from_row)
}

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    list(pool, req, web::Query(AttendanceListQuery {
        search: None,
        status: None,
        page: Some(1),
        per_page: Some(100),
        only_open: None,
        user_id: None,
        date_from: None,
        date_to: None,
    })).await
}

pub async fn today(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let today = Local::now().format("%Y-%m-%d").to_string();
    let shift = resolve_shift_for_user(&conn, claims.sub, &today);
    let sessions = fetch_user_sessions(&conn, claims.sub, &today);
    let active_clock_in = sessions
        .iter()
        .find(|s| s.clock_out.is_none())
        .map(|s| session_json(s, Some(&shift)));
    let attendances: Vec<serde_json::Value> = sessions
        .iter()
        .map(|s| session_json(s, Some(&shift)))
        .collect();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "active_clock_in": active_clock_in,
        "attendances": attendances,
        "total_sessions": sessions.len(),
        "shift": shift.to_json(),
    })))
}

pub async fn clock_in(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<ClockInRequest>,
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

    let now = Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H:%M:%S").to_string();
    let ts = now.format("%Y-%m-%d %H:%M:%S").to_string();
    let shift = resolve_shift_for_user(&conn, claims.sub, &date);
    if !user_is_scheduled_working_day(&conn, claims.sub, &date, now.date_naive()) {
        return HttpResponse::BadRequest().json(ApiError::new(
            "Clock-in is not allowed on a scheduled day off",
        ));
    }
    let on_approved_leave: bool = conn
        .query_row(
            "SELECT 1 FROM leave_requests
             WHERE user_id = ?1 AND status = 'approved' AND deleted_at IS NULL
               AND start_date <= ?2 AND end_date >= ?2 LIMIT 1",
            crate::params![claims.sub, &date],
            |_| Ok(()),
        )
        .is_ok();
    if on_approved_leave {
        return HttpResponse::Conflict().json(ApiError::new(
            "Cannot clock in while on approved leave for this date",
        ));
    }
    let is_late = late_for_shift(&shift, &time);
    let face_verified = body.face_verified.unwrap_or(false);
    let location_json = body
        .location
        .as_ref()
        .and_then(|loc| serde_json::to_string(loc).ok());

    // Close any open session (today or prior-day overnight) before starting a new one
    close_open_session_before_clock_in(&conn, claims.sub, &date, &time, &ts, &shift);

    match conn.execute(
        "INSERT INTO attendance (user_id, date, clock_in, status, is_late, clock_in_location, clock_in_face_verified, clock_in_face_match_score, source, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'present', ?4, ?5, ?6, ?7, 'app', ?8, ?8)",
        crate::params![
            claims.sub,
            &date,
            &time,
            if is_late { 1 } else { 0 },
            location_json,
            if face_verified { 1 } else { 0 },
            body.face_match_score,
            &ts,
        ],
    ) {
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "message": "Clocked in",
            "time": time,
            "shift": shift.to_json(),
            "is_late": is_late,
        }))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn clock_out(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let now = Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H:%M:%S").to_string();
    let ts = now.format("%Y-%m-%d %H:%M:%S").to_string();
    let shift = resolve_shift_for_user(&conn, claims.sub, &date);

    let active = find_open_attendance_session(&conn, claims.sub, &date);

    let Some((att_id, session_date, clock_in)) = active else {
        return HttpResponse::BadRequest().json(ApiError::new("No active clock-in session found"));
    };

    let session_shift = resolve_shift_for_user(&conn, claims.sub, &session_date);
    let duration = calc_duration_minutes(&clock_in, &time);
    let early_exit = early_for_shift(&session_shift, &time);

    match conn.execute(
        "UPDATE attendance SET clock_out=?1, duration_minutes=?2, is_early_exit=?3, updated_at=?4 WHERE id=?5",
        crate::params![&time, duration, if early_exit { 1 } else { 0 }, &ts, att_id],
    ) {
        Ok(rows) if rows > 0 => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "message": "Clocked out",
            "time": time,
            "duration_minutes": duration,
            "shift": shift.to_json(),
            "is_early_exit": early_exit,
        }))),
        Ok(_) => HttpResponse::BadRequest().json(ApiError::new("Could not clock out")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn list(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<AttendanceListQuery>,
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

    let per_page = query.per_page.unwrap_or(10).clamp(1, 100);
    let page = query.page.unwrap_or(1).max(1);
    let offset = (page - 1) * per_page;

    let mut conditions = vec!["a.deleted_at IS NULL".to_string(), "u.organization_id = ?".to_string()];
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];

    if !can_view_org_attendance(&conn, &claims, org_id) {
        conditions.push("a.user_id = ?".to_string());
        params.push(crate::db::into_param_value(claims.sub));
    } else if let Some(user_id) = query.user_id {
        conditions.push("a.user_id = ?".to_string());
        params.push(crate::db::into_param_value(user_id));
    }

    if let Some(ref status) = query.status {
        if !status.is_empty() && status != "all" {
            conditions.push("a.status = ?".to_string());
            params.push(crate::db::into_param_value(status.clone()));
        }
    }

    if query.only_open.unwrap_or(false) {
        conditions.push(
            "a.clock_in IS NOT NULL AND a.clock_out IS NULL".to_string(),
        );
    }

    if let Some(ref search) = query.search {
        if !search.is_empty() {
            conditions.push("(u.name LIKE ? OR u.email LIKE ?)".to_string());
            let like = format!("%{}%", search);
            params.push(crate::db::into_param_value(like.clone()));
            params.push(crate::db::into_param_value(like));
        }
    }

    if let Some(ref date_from) = query.date_from {
        if !date_from.is_empty() {
            conditions.push("a.date >= ?".to_string());
            params.push(crate::db::into_param_value(date_from.clone()));
        }
    }

    if let Some(ref date_to) = query.date_to {
        if !date_to.is_empty() {
            conditions.push("a.date <= ?".to_string());
            params.push(crate::db::into_param_value(date_to.clone()));
        }
    }

    let where_clause = conditions.join(" AND ");
    let count_sql = format!(
        "SELECT COUNT(*) FROM attendance a LEFT JOIN users u ON u.id = a.user_id WHERE {}",
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
        "SELECT a.*, u.name as user_name, u.email as user_email
         FROM attendance a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE {}
         ORDER BY a.date DESC, a.id DESC
         LIMIT {per_page} OFFSET {offset}",
        where_clause
    );

    let list_params: Vec<crate::db::ParamValue> = params;

    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{}", e))),
    };

    struct ListRow {
        att: Attendance,
        user_name: Option<String>,
        user_email: Option<String>,
    }

    let list_rows: Vec<ListRow> = stmt
        .query_map(
            &list_params,
            |row| {
                Ok(ListRow {
                    att: Attendance::from_row(row)?,
                    user_name: row.get::<Option<String>>("user_name").ok().flatten(),
                    user_email: row.get::<Option<String>>("user_email").ok().flatten(),
                })
            },
        );

    let rows: Vec<serde_json::Value> = list_rows
        .iter()
        .map(|item| {
            let shift = resolve_shift_for_user(&conn, item.att.user_id, &item.att.date);
            let mut session = session_json(&item.att, Some(&shift));
            if let Some(obj) = session.as_object_mut() {
                obj.insert(
                    "user".to_string(),
                    serde_json::json!({
                        "id": item.att.user_id,
                        "name": item.user_name,
                        "email": item.user_email,
                    }),
                );
            }
            session
        })
        .collect();

    let last_page = ((total as f64) / (per_page as f64)).ceil().max(1.0) as i64;
    let from = if total > 0 { offset + 1 } else { 0 };
    let to = (offset + rows.len() as i64).min(total);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "data": rows,
        "current_page": page,
        "last_page": last_page,
        "total": total,
        "from": from,
        "to": to,
        "per_page": per_page,
    })))
}

#[derive(Debug, Deserialize)]
pub struct AttendanceUsersQuery {
    pub search: Option<String>,
}

pub async fn users(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<AttendanceUsersQuery>,
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

    let mut sql = String::from(
        "SELECT u.id, u.name, u.email, u.phone, d.name AS department_name
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id AND d.organization_id = u.organization_id
         WHERE u.deleted_at IS NULL AND u.organization_id = ?1
           AND TRIM(COALESCE(u.name, '')) != ''",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];

    if let Some(ref search) = query.search {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            let like = format!("%{trimmed}%");
            sql.push_str(
                " AND (u.name LIKE ?2 OR COALESCE(u.email, '') LIKE ?3 OR COALESCE(u.phone, '') LIKE ?4 OR COALESCE(d.name, '') LIKE ?5)",
            );
            params.push(crate::db::into_param_value(like.clone()));
            params.push(crate::db::into_param_value(like.clone()));
            params.push(crate::db::into_param_value(like.clone()));
            params.push(crate::db::into_param_value(like));
        }
    }

    sql.push_str(" ORDER BY u.name");

    let items: Vec<serde_json::Value> = match conn.query_map_result(&sql, &params, |row| {
        Ok(serde_json::json!({
            "id": row.get_idx::<i64>(0)?,
            "name": row.get_idx::<String>(1)?,
            "email": row.get_idx::<Option<String>>(2)?,
            "phone": row.get_idx::<Option<String>>(3)?,
            "department_name": row.get_idx::<Option<String>>(4)?,
        }))
    }) {
        Ok(rows) => rows,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    HttpResponse::Ok().json(ApiResponse::success(items))
}

pub async fn stats(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<AttendanceStatsQuery>,
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

    let today = Local::now();
    let month_start = format!("{}-{:02}-01", today.year(), today.month());
    let today_str = today.format("%Y-%m-%d").to_string();
    let today_date = today.date_naive();

    let view_org = can_view_org_attendance(&conn, &claims, org_id);
    let scope = if view_org { "org" } else { "self" };

    let source_filter = query
        .source
        .as_deref()
        .filter(|s| !s.is_empty() && *s != "all");
    let source_clause = match source_filter {
        Some(_src) => " AND COALESCE(a.source, 'app') = ?3",
        None => "",
    };

    let user_clause = if view_org {
        " AND a.user_id IN (SELECT id FROM users WHERE organization_id = ?2 AND deleted_at IS NULL)"
    } else {
        " AND a.user_id = ?2"
    };

    let mut month_params: Vec<crate::db::ParamValue> = if view_org {
        vec![
            crate::db::into_param_value(month_start.clone()),
            crate::db::into_param_value(org_id),
        ]
    } else {
        vec![
            crate::db::into_param_value(month_start.clone()),
            crate::db::into_param_value(claims.sub),
        ]
    };
    if let Some(src) = source_filter {
        month_params.push(crate::db::into_param_value(src));
    }

    let q = |sql: &str| -> i64 {
        conn.query_row(
            &format!("{sql}{user_clause}{source_clause}"),
            &month_params,
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0)
    };

    let total_days = q("SELECT COUNT(DISTINCT a.date) FROM attendance a WHERE a.deleted_at IS NULL AND a.date >= ?1");
    let present_days = q(
        "SELECT COUNT(*) FROM attendance a WHERE a.deleted_at IS NULL AND a.clock_out IS NOT NULL AND a.date >= ?1",
    );
    let late_days =
        q("SELECT COUNT(*) FROM attendance a WHERE a.deleted_at IS NULL AND a.is_late=1 AND a.date >= ?1");
    let early_exit_days =
        q("SELECT COUNT(*) FROM attendance a WHERE a.deleted_at IS NULL AND a.is_early_exit=1 AND a.date >= ?1");
    let total_minutes = q(
        "SELECT COALESCE(SUM(a.duration_minutes),0) FROM attendance a WHERE a.deleted_at IS NULL AND a.date >= ?1",
    );

    let has_completed_on = |user_id: i64, date: &str| -> bool {
        let mut sql = "SELECT 1 FROM attendance a WHERE a.user_id = ?1 AND a.date = ?2 \
                         AND a.deleted_at IS NULL AND a.clock_out IS NOT NULL"
            .to_string();
        if let Some(src) = source_filter {
            sql.push_str(" AND COALESCE(a.source, 'app') = ?3");
            conn.query_row(&sql, crate::params![user_id, date, src], |_| Ok(()))
                .is_ok()
        } else {
            conn.query_row(&sql, crate::params![user_id, date], |_| Ok(()))
                .is_ok()
        }
    };

    let (absent_days, present_today, scheduled_today) = if view_org {
        let user_ids: Vec<i64> = conn
            .prepare(
                "SELECT id FROM users WHERE deleted_at IS NULL AND is_super_admin=0 AND organization_id = ?1",
            )
            .ok()
            .map(|stmt| stmt.query_map([org_id], |row| row.get_idx::<i64>(0)))
            .unwrap_or_default();

        let mut scheduled = 0i64;
        let mut present_scheduled = 0i64;
        for uid in &user_ids {
            if user_is_scheduled_working_day(&conn, *uid, &today_str, today_date) {
                scheduled += 1;
                if has_completed_on(*uid, &today_str) {
                    present_scheduled += 1;
                }
            }
        }
        let absent_today = (scheduled - present_scheduled).max(0);
        (absent_today, present_scheduled, scheduled)
    } else {
        let mut working = 0i64;
        let mut present_scheduled = 0i64;
        let mut d = match NaiveDate::parse_from_str(&month_start, "%Y-%m-%d") {
            Ok(v) => v,
            Err(_) => today_date,
        };
        while d <= today_date {
            let ds = d.format("%Y-%m-%d").to_string();
            if user_is_scheduled_working_day(&conn, claims.sub, &ds, d) {
                working += 1;
                if has_completed_on(claims.sub, &ds) {
                    present_scheduled += 1;
                }
            }
            d = match d.succ_opt() {
                Some(next) => next,
                None => break,
            };
        }
        let absent = (working - present_scheduled).max(0);
        let present_today = if has_completed_on(claims.sub, &today_str) {
            1
        } else {
            0
        };
        let scheduled_today = if user_is_scheduled_working_day(&conn, claims.sub, &today_str, today_date) {
            1
        } else {
            0
        };
        (absent, present_today, scheduled_today)
    };

    let mut payload = serde_json::json!({
        "scope": scope,
        "source": source_filter.unwrap_or("all"),
        "total_days": total_days,
        "present_days": present_days,
        "absent_days": absent_days,
        "late_days": late_days,
        "early_exit_days": early_exit_days,
        "total_hours": total_minutes / 60,
        "present": present_today,
        "total": scheduled_today,
        "absent": absent_days,
        "scheduled_today": scheduled_today,
    });

    if view_org && source_filter.is_none() {
        let by_source = |src: &str| -> i64 {
            conn.query_row(
                "SELECT COUNT(*) FROM attendance a
                 WHERE a.deleted_at IS NULL AND a.clock_out IS NOT NULL AND a.date >= ?1
                   AND COALESCE(a.source, 'app') = ?3
                   AND a.user_id IN (SELECT id FROM users WHERE organization_id = ?2 AND deleted_at IS NULL)",
                crate::params![&month_start, org_id, src],
                |r| r.get_idx::<i64>(0),
            )
            .unwrap_or(0)
        };
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("by_source".to_string(), serde_json::json!({
                "app": by_source("app"),
                "biometric": by_source("biometric"),
                "manual": by_source("manual"),
            }));
        }
    }

    HttpResponse::Ok().json(ApiResponse::success(payload))
}

/// Normalize a "HH:MM" or "HH:MM:SS" time string to "HH:MM:SS"; None/empty → None.
fn normalize_time(value: Option<&str>) -> Option<String> {
    let v = value?.trim();
    if v.is_empty() {
        return None;
    }
    // Accept an ISO "<date>T<time>" too — keep only the time part.
    let t = if let Some((_, time)) = v.split_once('T') { time } else { v };
    let t = t.trim();
    match t.len() {
        5 => Some(format!("{t}:00")), // HH:MM
        8 => Some(t.to_string()),     // HH:MM:SS
        _ => crate::shift_logic::parse_time(t).map(|p| p.format("%H:%M:%S").to_string()),
    }
}

/// Recompute duration / late / early flags for a session against the user's shift.
fn recompute_flags(
    conn: &crate::db::Connection,
    user_id: i64,
    date: &str,
    clock_in: Option<&str>,
    clock_out: Option<&str>,
) -> (Option<i64>, bool, bool) {
    let shift = resolve_shift_for_user(conn, user_id, date);
    let is_late = clock_in
        .map(|ci| late_for_shift(&shift, ci))
        .unwrap_or(false);
    let (duration, early) = match (clock_in, clock_out) {
        (Some(ci), Some(co)) => (
            Some(calc_duration_minutes(ci, co)),
            early_for_shift(&shift, co),
        ),
        _ => (None, false),
    };
    (duration, is_late, early)
}

fn insert_manual_record(
    conn: &crate::db::Connection,
    org_id: i64,
    user_id: i64,
    date: &str,
    clock_in: Option<String>,
    clock_out: Option<String>,
    status: String,
    notes: Option<String>,
) -> Result<i64, String> {
    let in_org = conn
        .query_row(
            "SELECT 1 FROM users WHERE id = ?1 AND organization_id = ?2 AND deleted_at IS NULL",
            crate::params![user_id, org_id],
            |_| Ok(()),
        )
        .is_ok();
    if !in_org {
        return Err("Employee not found in organization".to_string());
    }

    if date.trim().len() < 10 {
        return Err("A valid date (YYYY-MM-DD) is required".to_string());
    }

    if clock_in.is_none() && clock_out.is_some() {
        return Err("Cannot set a clock-out without a clock-in".to_string());
    }

    if clock_in.is_some() {
        let shift = resolve_shift_for_user(conn, user_id, date);
        let ts = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        close_open_session_before_clock_in(
            conn,
            user_id,
            date,
            clock_in.as_deref().unwrap_or("00:00:00"),
            &ts,
            &shift,
        );
    }

    let (duration, is_late, is_early) =
        recompute_flags(conn, user_id, date, clock_in.as_deref(), clock_out.as_deref());

    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "INSERT INTO attendance
            (user_id, date, clock_in, clock_out, duration_minutes, is_late, is_early_exit,
             status, notes, source, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'manual', ?10, ?10)",
        crate::params![
            user_id,
            date,
            clock_in,
            clock_out,
            duration,
            if is_late { 1 } else { 0 },
            if is_early { 1 } else { 0 },
            status,
            notes,
            &now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

/// PATCH /api/admin/attendance/{id} — edit/regularize an attendance record.
pub async fn update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<UpdateAttendanceRequest>,
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

    if !can_view_org_attendance(&conn, &claims, org_id) {
        return HttpResponse::Forbidden()
            .json(ApiError::new("You do not have permission to edit attendance"));
    }

    let att_id = path.into_inner();
    // Load the record, scoped to the caller's organization.
    let existing = conn.query_row(
        "SELECT a.* FROM attendance a
         JOIN users u ON u.id = a.user_id
         WHERE a.id = ?1 AND u.organization_id = ?2 AND a.deleted_at IS NULL",
        crate::params![att_id, org_id],
        Attendance::from_row,
    );
    let existing = match existing {
        Ok(a) => a,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Attendance record not found")),
    };

    // Resolve final field values (provided value overrides, else keep existing).
    let clock_in = match body.clock_in.as_deref() {
        Some(_) => normalize_time(body.clock_in.as_deref()),
        None => existing.clock_in.clone(),
    };
    let clock_out = if body.clear_clock_out.unwrap_or(false) {
        None
    } else {
        match body.clock_out.as_deref() {
            Some(_) => normalize_time(body.clock_out.as_deref()),
            None => existing.clock_out.clone(),
        }
    };

    if clock_in.is_none() && clock_out.is_some() {
        return HttpResponse::BadRequest()
            .json(ApiError::new("Cannot set a clock-out without a clock-in"));
    }

    let status = body
        .status
        .clone()
        .filter(|s| !s.trim().is_empty())
        .or(existing.status.clone())
        .unwrap_or_else(|| "present".to_string());

    let (duration, is_late, is_early) = recompute_flags(
        &conn,
        existing.user_id,
        &existing.date,
        clock_in.as_deref(),
        clock_out.as_deref(),
    );

    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let result = conn.execute(
        "UPDATE attendance
         SET clock_in=?1, clock_out=?2, duration_minutes=?3, is_late=?4, is_early_exit=?5,
             status=?6, notes=?7, source='manual', updated_at=?8
         WHERE id=?9",
        crate::params![
            clock_in,
            clock_out,
            duration,
            if is_late { 1 } else { 0 },
            if is_early { 1 } else { 0 },
            status,
            body.notes.clone().or(existing.notes.clone()),
            &now,
            att_id
        ],
    );

    match result {
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "message": "Attendance updated",
            "id": att_id,
        }))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

/// POST /api/admin/attendance/manual — create an attendance record for an employee.
pub async fn store_manual(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<CreateAttendanceRequest>,
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

    if !can_mark_attendance(&conn, &claims, org_id) {
        return HttpResponse::Forbidden()
            .json(ApiError::new("You do not have permission to add attendance"));
    }

    let date = body.date.trim();
    if date.len() < 10 {
        return HttpResponse::BadRequest().json(ApiError::new("A valid date (YYYY-MM-DD) is required"));
    }

    let clock_in = normalize_time(body.clock_in.as_deref());
    let clock_out = normalize_time(body.clock_out.as_deref());
    let status = body
        .status
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "present".to_string());

    match insert_manual_record(
        &conn,
        org_id,
        body.user_id,
        date,
        clock_in,
        clock_out,
        status,
        body.notes.clone(),
    ) {
        Ok(id) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "message": "Attendance entry created",
            "id": id,
        }))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&e)),
    }
}

/// POST /api/admin/attendance/manual/bulk — create manual attendance for multiple employees.
pub async fn store_manual_bulk(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<BulkManualAttendanceRequest>,
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

    if !can_mark_attendance(&conn, &claims, org_id) {
        return HttpResponse::Forbidden()
            .json(ApiError::new("You do not have permission to add attendance"));
    }

    let date = body.date.trim();
    if date.len() < 10 {
        return HttpResponse::BadRequest().json(ApiError::new("A valid date (YYYY-MM-DD) is required"));
    }

    if body.entries.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("At least one entry is required"));
    }

    let mut results = Vec::new();
    let mut created = 0usize;
    let mut failed = 0usize;

    for entry in &body.entries {
        let clock_in = normalize_time(entry.clock_in.as_deref());
        let clock_out = normalize_time(entry.clock_out.as_deref());
        let status = entry
            .status
            .clone()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "present".to_string());

        match insert_manual_record(
            &conn,
            org_id,
            entry.user_id,
            date,
            clock_in,
            clock_out,
            status,
            entry.notes.clone(),
        ) {
            Ok(id) => {
                created += 1;
                results.push(serde_json::json!({
                    "user_id": entry.user_id,
                    "ok": true,
                    "id": id,
                }));
            }
            Err(e) => {
                failed += 1;
                results.push(serde_json::json!({
                    "user_id": entry.user_id,
                    "ok": false,
                    "error": e,
                }));
            }
        }
    }

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "message": format!("Created {} attendance record(s)", created),
        "created": created,
        "failed": failed,
        "results": results,
    })))
}

/// DELETE /api/admin/attendance/{id} — soft-delete an attendance record.
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

    if !can_view_org_attendance(&conn, &claims, org_id) {
        return HttpResponse::Forbidden()
            .json(ApiError::new("You do not have permission to delete attendance"));
    }

    let att_id = path.into_inner();
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let rows = conn
        .execute(
            "UPDATE attendance SET deleted_at=?1, updated_at=?1
             WHERE id=?2 AND user_id IN (SELECT id FROM users WHERE organization_id = ?3)",
            crate::params![&now, att_id, org_id],
        )
        .unwrap_or(0);

    if rows == 0 {
        return HttpResponse::NotFound().json(ApiError::new("Attendance record not found"));
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "message": "Attendance record deleted",
    })))
}
