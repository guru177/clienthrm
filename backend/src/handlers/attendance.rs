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
    resolve_shift_for_user, resolve_shift_for_user_readonly, user_is_scheduled_working_day,
    ShiftConfig,
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
        group_by_day: None,
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
    // Holidays and week-offs are allowed — counted as extra work (no late penalty).
    let (punch_status, is_late) = crate::attendance_logic::punch_status_and_lateness(
        &conn,
        claims.sub,
        org_id,
        &date,
        now.date_naive(),
        &shift,
        &time,
    );
    let on_approved_leave =
        crate::attendance_logic::user_on_approved_leave(&conn, claims.sub, &date);
    if on_approved_leave {
        return HttpResponse::Conflict().json(ApiError::new(
            "Cannot clock in while on approved leave for this date",
        ));
    }
    let face_verified = body.face_verified.unwrap_or(false);
    let location_json = body
        .location
        .as_ref()
        .and_then(|loc| serde_json::to_string(loc).ok());

    let punch_lat = body.location.as_ref().map(|l| l.geo.lat);
    let punch_lng = body.location.as_ref().map(|l| l.geo.lng);
    let fence = crate::geo_policy::geofence_for_user(&conn, claims.sub, org_id);
    let (out_of_zone, distance_m) =
        crate::geo_policy::evaluate_punch(fence.as_ref(), punch_lat, punch_lng);
    if out_of_zone {
        let policy = crate::geo_policy::geofence_policy(&conn, org_id);
        if policy.eq_ignore_ascii_case("reject") {
            return HttpResponse::BadRequest().json(ApiError::new(
                "Clock-in rejected: you are outside the allowed branch geofence",
            ));
        }
    }

    // Close any open session (today or prior-day overnight) before starting a new one
    close_open_session_before_clock_in(&conn, claims.sub, &date, &time, &ts, &shift);

    // Clear same-day absent-only markers so this punch shows as check-in on the Attendance grid.
    let _ = conn.execute(
        "UPDATE attendance
         SET deleted_at = ?1, updated_at = ?1
         WHERE user_id = ?2 AND date = ?3 AND deleted_at IS NULL
           AND LOWER(TRIM(COALESCE(status, ''))) = 'absent'
           AND clock_in IS NULL",
        crate::params![&ts, claims.sub, &date],
    );

    match conn.execute(
        "INSERT INTO attendance (user_id, organization_id, date, clock_in, status, is_late, clock_in_location, clock_in_face_verified, clock_in_face_match_score, source, out_of_zone, geofence_distance_m, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'app', ?10, ?11, ?12, ?12)",
        crate::params![
            claims.sub,
            org_id,
            &date,
            &time,
            &punch_status,
            if is_late { 1 } else { 0 },
            location_json,
            if face_verified { 1 } else { 0 },
            body.face_match_score,
            if out_of_zone { 1 } else { 0 },
            distance_m,
            &ts,
        ],
    ) {
        Ok(_) => {
            let attendance_id = conn.last_insert_rowid();
            let ctx = serde_json::json!({
                "attendance_id": attendance_id,
                "user_id": claims.sub,
                "date": date,
                "clock_in": time,
                "is_late": is_late,
                "status": punch_status,
                "out_of_zone": out_of_zone,
                "geofence_distance_m": distance_m,
                "source": "app",
                "organization_id": org_id,
                "created_by": claims.sub,
            });
            // Fire workflows/webhooks after responding so clock-in feels instant.
            let pool_bg = pool.clone();
            let ctx_bg = ctx.clone();
            let late = is_late;
            tokio::spawn(async move {
                let Ok(conn) = pool_bg.get_for_tenant(org_id) else {
                    log::warn!("clock_in side-effects: database unavailable");
                    return;
                };
                crate::workflow_logic::trigger(&conn, org_id, "attendance_clock_in", &ctx_bg);
                if late {
                    crate::workflow_logic::trigger(&conn, org_id, "attendance_late", &ctx_bg);
                }
                crate::tenant_webhooks::dispatch(&conn, org_id, "attendance.clock_in", &ctx_bg);
            });
            let message = if punch_status == "extra_work" {
                "Clocked in (extra work — holiday or week off)"
            } else {
                "Clocked in"
            };
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
                "message": message,
                "time": time,
                "shift": shift.to_json(),
                "is_late": is_late,
                "status": punch_status,
                "is_extra_work": punch_status == "extra_work",
                "out_of_zone": out_of_zone,
                "geofence_distance_m": distance_m,
            })))
        }
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn clock_out(pool: web::Data<DbPool>, req: HttpRequest, body: Option<web::Json<crate::models::attendance::ClockOutRequest>>) -> HttpResponse {
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

    let location_json = body
        .and_then(|b| b.into_inner().location)
        .and_then(|loc| serde_json::to_string(&loc).ok());

    match conn.execute(
        "UPDATE attendance SET clock_out=?1, duration_minutes=?2, is_early_exit=?3, clock_out_location=COALESCE(?4, clock_out_location), updated_at=?5 WHERE id=?6",
        crate::params![&time, duration, if early_exit { 1 } else { 0 }, location_json, &ts, att_id],
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
    } else {
        let is_sa = crate::tenant::user_is_super_admin(&conn, claims.sub, org_id);
        let (permissions, _) = crate::plan_limits::resolve_effective_permissions(
            &conn,
            org_id,
            crate::middleware::rbac::load_user_permissions(&conn, claims.sub, is_sa),
        );
        let scope = crate::branch_scope::resolve_branch_scope(
            &conn, claims.sub, org_id, &permissions, is_sa,
        );
        crate::branch_scope::push_users_branch_condition_qmark(
            &mut conditions,
            &mut params,
            &scope,
            "u",
        );
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
    let group_by_day = query.group_by_day.unwrap_or(false);

    if group_by_day {
        return list_grouped_by_day(&conn, &where_clause, &params, page, per_page, offset);
    }

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
            let shift = resolve_shift_for_user_readonly(&conn, item.att.user_id, &item.att.date);
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
        "group_by_day": false,
    })))
}

/// One row per (user, date): earliest clock-in, latest clock-out, sum of session durations.
fn list_grouped_by_day(
    conn: &crate::db::Connection,
    where_clause: &str,
    params: &[crate::db::ParamValue],
    page: i64,
    per_page: i64,
    offset: i64,
) -> HttpResponse {
    let count_sql = format!(
        "SELECT COUNT(*) FROM (
            SELECT a.user_id, a.date
            FROM attendance a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE {where_clause}
            GROUP BY a.user_id, a.date
         ) t"
    );
    let total: i64 = conn
        .query_row(&count_sql, params, |r| r.get_idx::<i64>(0))
        .unwrap_or(0);

    // Postgres: MAX(clock_out) ignores NULLs for text; open sessions flagged separately.
    let sql = format!(
        "SELECT a.user_id, a.date,
                MIN(a.id) AS id,
                MIN(a.clock_in) AS first_clock_in,
                MAX(a.clock_out) AS last_clock_out,
                COALESCE(SUM(a.duration_minutes), 0) AS total_minutes,
                MAX(CASE WHEN a.clock_in IS NOT NULL AND a.clock_out IS NULL THEN 1 ELSE 0 END) AS has_open,
                COUNT(a.id) AS session_count,
                MAX(CASE WHEN LOWER(TRIM(COALESCE(a.status,''))) = 'extra_work' THEN 1 ELSE 0 END) AS any_extra,
                MAX(CASE WHEN LOWER(TRIM(COALESCE(a.status,''))) = 'half_day' THEN 1 ELSE 0 END) AS any_half,
                MAX(CASE WHEN LOWER(TRIM(COALESCE(a.status,''))) = 'absent' THEN 1 ELSE 0 END) AS any_absent,
                u.name AS user_name,
                u.email AS user_email
         FROM attendance a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE {where_clause}
         GROUP BY a.user_id, a.date, u.name, u.email
         ORDER BY a.date DESC, a.user_id DESC
         LIMIT {per_page} OFFSET {offset}"
    );

    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    struct DayRow {
        user_id: i64,
        date: String,
        id: i64,
        first_in: Option<String>,
        last_out: Option<String>,
        total_minutes: i64,
        has_open: bool,
        session_count: i64,
        any_extra: bool,
        any_half: bool,
        any_absent: bool,
        user_name: Option<String>,
        user_email: Option<String>,
    }

    let day_rows: Vec<DayRow> = stmt.query_map(params, |row| {
        Ok(DayRow {
            user_id: row.get_idx::<i64>(0)?,
            date: row.get_idx::<String>(1)?,
            id: row.get_idx::<i64>(2)?,
            first_in: row.get_idx::<Option<String>>(3)?,
            last_out: row.get_idx::<Option<String>>(4)?,
            total_minutes: row.get_idx::<i64>(5).unwrap_or(0),
            has_open: row.get_idx::<i64>(6).unwrap_or(0) != 0,
            session_count: row.get_idx::<i64>(7).unwrap_or(0),
            any_extra: row.get_idx::<i64>(8).unwrap_or(0) != 0,
            any_half: row.get_idx::<i64>(9).unwrap_or(0) != 0,
            any_absent: row.get_idx::<i64>(10).unwrap_or(0) != 0,
            user_name: row.get_idx::<Option<String>>(11)?,
            user_email: row.get_idx::<Option<String>>(12)?,
        })
    });

    let rows: Vec<serde_json::Value> = day_rows
        .into_iter()
        .map(|r| {
            let shift = resolve_shift_for_user_readonly(conn, r.user_id, &r.date);
            let first_in = r.first_in.as_deref();
            let last_out = if r.has_open { None } else { r.last_out.as_deref() };

            // Day summary: span from first punch-in to last punch-out (standard daily hours).
            let duration = match (first_in, last_out) {
                (Some(ci), Some(co)) => calc_duration_minutes(ci, co),
                _ => r.total_minutes,
            };

            let day = chrono::NaiveDate::parse_from_str(&r.date, "%Y-%m-%d").ok();
            let org_id = crate::tenant::org_id_for_user(conn, r.user_id);
            let is_extra = day
                .map(|d| {
                    crate::attendance_logic::is_extra_work_day(conn, r.user_id, org_id, &r.date, d)
                })
                .unwrap_or(false);

            let is_late = if is_extra {
                false
            } else {
                first_in
                    .map(|ci| late_for_shift(&shift, ci))
                    .unwrap_or(false)
            };
            let is_early = if is_extra || r.has_open {
                false
            } else {
                last_out
                    .map(|co| early_for_shift(&shift, co))
                    .unwrap_or(false)
            };

            let status = if r.any_half {
                "half_day"
            } else if r.any_extra || (is_extra && first_in.is_some()) {
                "extra_work"
            } else if r.any_absent && first_in.is_none() {
                "absent"
            } else if first_in.is_some() {
                "present"
            } else {
                "absent"
            };

            // Collect sources for the day
            let sources: Vec<String> = conn
                .prepare(
                    "SELECT DISTINCT COALESCE(NULLIF(TRIM(source), ''), 'app')
                     FROM attendance
                     WHERE user_id = ?1 AND date = ?2 AND deleted_at IS NULL
                     ORDER BY 1",
                )
                .map(|stmt| {
                    stmt.query_map(crate::params![r.user_id, &r.date], |row| {
                        row.get_idx::<String>(0)
                    })
                })
                .unwrap_or_default();
            let source_label = if sources.is_empty() {
                "app".to_string()
            } else if sources.len() == 1 {
                sources[0].clone()
            } else {
                sources.join("+")
            };

            serde_json::json!({
                "id": r.id,
                "user_id": r.user_id,
                "date": r.date,
                "clock_in": first_in.map(|t| combine_datetime(&r.date, t)),
                "clock_out": last_out.map(|t| {
                    combine_clock_out_datetime(&r.date, first_in.unwrap_or("00:00:00"), t)
                }),
                "duration_minutes": duration,
                "is_late": is_late,
                "is_early_exit": is_early,
                "status": status,
                "source": source_label,
                "session_count": r.session_count,
                "has_open_session": r.has_open,
                "group_by_day": true,
                "shift": shift.to_json(),
                "user": {
                    "id": r.user_id,
                    "name": r.user_name,
                    "email": r.user_email,
                },
            })
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
        "group_by_day": true,
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
            if crate::attendance_logic::expects_attendance(
                &conn,
                *uid,
                org_id,
                &today_str,
                today_date,
            ) {
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
            if crate::attendance_logic::expects_attendance(&conn, claims.sub, org_id, &ds, d) {
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
        let scheduled_today = if crate::attendance_logic::expects_attendance(
            &conn,
            claims.sub,
            org_id,
            &today_str,
            today_date,
        ) {
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
    org_id: i64,
    date: &str,
    clock_in: Option<&str>,
    clock_out: Option<&str>,
) -> (Option<i64>, bool, bool) {
    let shift = resolve_shift_for_user(conn, user_id, date);
    let day = chrono::NaiveDate::parse_from_str(date.trim(), "%Y-%m-%d").ok();
    let extra = day
        .map(|d| crate::attendance_logic::is_extra_work_day(conn, user_id, org_id, date, d))
        .unwrap_or(false);
    let is_late = if extra {
        false
    } else {
        clock_in
            .map(|ci| late_for_shift(&shift, ci))
            .unwrap_or(false)
    };
    let (duration, early) = match (clock_in, clock_out) {
        (Some(ci), Some(co)) => (
            Some(calc_duration_minutes(ci, co)),
            if extra {
                false
            } else {
                early_for_shift(&shift, co)
            },
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

    let parsed_date = match NaiveDate::parse_from_str(date.trim(), "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return Err("A valid date (YYYY-MM-DD) is required".to_string()),
    };
    // Reject future-dated attendance. A same-day entry is allowed; anything past
    // today is almost always a data-entry mistake and would corrupt payroll/leave math.
    if parsed_date > chrono::Local::now().date_naive() {
        return Err("Attendance cannot be marked for a future date".to_string());
    }

    if clock_in.is_none() && clock_out.is_some() {
        return Err("Cannot set a clock-out without a clock-in".to_string());
    }

    // Keep leave / attendance in sync: no punch times on approved leave days.
    // Explicit leave/absent markers without clock times remain allowed.
    let status_lc = status.trim().to_lowercase();
    let leave_marker = matches!(
        status_lc.as_str(),
        "leave" | "on_leave" | "on-leave" | "sick_leave" | "absent"
    );
    if clock_in.is_some()
        && !leave_marker
        && crate::attendance_logic::user_on_approved_leave(conn, user_id, date)
    {
        return Err(
            "Cannot add attendance punches on an approved leave day — cancel the leave first"
                .to_string(),
        );
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
        recompute_flags(conn, user_id, org_id, date, clock_in.as_deref(), clock_out.as_deref());

    let resolved_status = {
        let trimmed = status.trim().to_lowercase();
        if clock_in.is_some()
            && (trimmed.is_empty() || trimmed == "present")
            && crate::attendance_logic::is_extra_work_day(conn, user_id, org_id, date, parsed_date)
        {
            "extra_work".to_string()
        } else if trimmed.is_empty() {
            "present".to_string()
        } else {
            status
        }
    };

    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "INSERT INTO attendance
            (user_id, organization_id, date, clock_in, clock_out, duration_minutes, is_late, is_early_exit,
             status, notes, source, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'manual', ?11, ?11)",
        crate::params![
            user_id,
            org_id,
            date,
            clock_in,
            clock_out,
            duration,
            if is_late { 1 } else { 0 },
            if is_early { 1 } else { 0 },
            resolved_status,
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
        org_id,
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
        clock_in.clone(),
        clock_out.clone(),
        status.clone(),
        body.notes.clone(),
    ) {
        Ok(id) => {
            if let Some(email) = crate::tenant_email::user_email(&conn, body.user_id) {
                let (text, html) = crate::attendance_shift_email::render_manual_attendance_email(
                    date,
                    &status,
                    clock_in.as_deref(),
                    clock_out.as_deref(),
                );
                crate::tenant_email::send_tenant_email(
                    &conn,
                    org_id,
                    &email,
                    &format!("Attendance Updated: {date}"),
                    text,
                    html,
                );
            }
            if status.eq_ignore_ascii_case("absent") {
                crate::workflow_logic::trigger(
                    &conn,
                    org_id,
                    "attendance_absent",
                    &serde_json::json!({
                        "attendance_id": id,
                        "user_id": body.user_id,
                        "date": date,
                        "status": status,
                        "source": "manual",
                        "organization_id": org_id,
                        "created_by": claims.sub,
                    }),
                );
            }
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
                "message": "Attendance entry created",
                "id": id,
            })))
        }
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

/// GET /api/admin/attendance/live-locations — all org users for live map monitoring
pub async fn live_locations(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let stmt = match conn.prepare(
        "SELECT u.id, u.name, u.email,
                p.ip_address, p.latitude, p.longitude, p.city, p.region, p.country,
                p.accuracy_meters, p.last_active_at,
                CASE WHEN open_sess.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_clocked_in,
                open_sess.clock_in_location
         FROM users u
         LEFT JOIN user_presence p ON p.user_id = u.id AND p.organization_id = u.organization_id
         LEFT JOIN (
             SELECT a.user_id, MAX(a.id) AS attendance_id
             FROM attendance a
             INNER JOIN users uu ON uu.id = a.user_id AND uu.organization_id = ?1
             WHERE a.clock_out IS NULL AND a.deleted_at IS NULL
             GROUP BY a.user_id
         ) open_ids ON open_ids.user_id = u.id
         LEFT JOIN attendance open_sess ON open_sess.id = open_ids.attendance_id
         WHERE u.organization_id = ?1
           AND u.deleted_at IS NULL
         ORDER BY is_clocked_in DESC,
                  CASE WHEN p.last_active_at IS NULL THEN 1 ELSE 0 END,
                  p.last_active_at DESC,
                  u.name ASC",
    ) {
        Ok(s) => s,
        Err(e) => {
            return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}")))
        }
    };

    let users: Vec<serde_json::Value> = stmt.query_map(crate::params![org_id], |row| {
        let mut latitude: Option<f64> = row.get_idx::<Option<f64>>(4)?;
        let mut longitude: Option<f64> = row.get_idx::<Option<f64>>(5)?;
        let clock_in_location: Option<String> = row.get_idx::<Option<String>>(12)?;
        if latitude.is_none() || longitude.is_none() {
            if let Some(ref loc) = clock_in_location {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(loc) {
                    let geo = v.get("geo");
                    let lat = geo
                        .and_then(|g| g.get("lat"))
                        .and_then(|x| x.as_f64())
                        .or_else(|| v.get("lat").and_then(|x| x.as_f64()));
                    let lng = geo
                        .and_then(|g| g.get("lng"))
                        .and_then(|x| x.as_f64())
                        .or_else(|| v.get("lng").and_then(|x| x.as_f64()));
                    if lat.is_some() && lng.is_some() {
                        latitude = lat;
                        longitude = lng;
                    }
                }
            }
        }
        let has_location = latitude.is_some() && longitude.is_some();
        let is_clocked_in = row.get_idx::<i64>(11)? != 0;
        Ok(serde_json::json!({
            "id": row.get_idx::<i64>(0)?,
            "name": row.get_idx::<String>(1)?,
            "email": row.get_idx::<String>(2)?,
            "ip_address": row.get_idx::<Option<String>>(3)?,
            "latitude": latitude,
            "longitude": longitude,
            "city": row.get_idx::<Option<String>>(6)?,
            "region": row.get_idx::<Option<String>>(7)?,
            "country": row.get_idx::<Option<String>>(8)?,
            "accuracy_meters": row.get_idx::<Option<f64>>(9)?,
            "last_active_at": row.get_idx::<Option<String>>(10)?,
            "has_location": has_location,
            "is_clocked_in": is_clocked_in,
            "is_active": is_clocked_in,
        }))
    });

    let clocked_in_count = users
        .iter()
        .filter(|u| u.get("is_clocked_in").and_then(|v| v.as_bool()) == Some(true))
        .count() as i64;
    let clocked_out_count = (users.len() as i64) - clocked_in_count;
    let without_location = users
        .iter()
        .filter(|u| u.get("has_location").and_then(|v| v.as_bool()) == Some(false))
        .count() as i64;
    let updated_at = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "users": users,
        "active_count": clocked_in_count,
        "inactive_count": clocked_out_count,
        "clocked_in_count": clocked_in_count,
        "clocked_out_count": clocked_out_count,
        "without_location_count": without_location,
        "updated_at": updated_at,
    })))
}
