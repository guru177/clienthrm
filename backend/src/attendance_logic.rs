//! Shared attendance session resolution.

/// Returns (attendance_id, session_date, clock_in) for the user's open session.
/// Prefers same-day; falls back to the most recent open session (overnight shifts).
pub fn find_open_attendance_session(
    conn: &crate::db::Connection,
    user_id: i64,
    punch_date: &str,
) -> Option<(i64, String, String)> {
    if let Ok(row) = conn.query_row(
        "SELECT id, date, clock_in FROM attendance
         WHERE user_id=?1 AND date=?2 AND clock_out IS NULL AND deleted_at IS NULL
           AND clock_in IS NOT NULL
         ORDER BY id DESC LIMIT 1",
        crate::params![user_id, punch_date],
        |row| Ok((row.get_idx::<i64>(0)?, row.get_idx::<String>(1)?, row.get_idx::<String>(2)?)),
    ) {
        return Some(row);
    }
    conn.query_row(
        "SELECT id, date, clock_in FROM attendance
         WHERE user_id=?1 AND clock_out IS NULL AND deleted_at IS NULL
           AND clock_in IS NOT NULL
           AND date < ?2
         ORDER BY date DESC, id DESC LIMIT 1",
        crate::params![user_id, punch_date],
        |row| Ok((row.get_idx::<i64>(0)?, row.get_idx::<String>(1)?, row.get_idx::<String>(2)?)),
    )
    .ok()
}

/// Combine date+time; rolls clock-out to next day when out < in (overnight).
pub fn combine_clock_out_datetime(date: &str, clock_in: &str, clock_out: &str) -> String {
    let in_part = if clock_in.len() >= 8 {
        &clock_in[..8]
    } else {
        clock_in
    };
    let out_part = if clock_out.len() >= 8 {
        &clock_out[..8]
    } else {
        clock_out
    };
    let out_date = if out_part < in_part {
        if let Ok(d) = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d") {
            (d + chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string()
        } else {
            date.to_string()
        }
    } else {
        date.to_string()
    };
    format!("{}T{}", out_date, out_part)
}

/// Close any open attendance session (including prior-day overnight) before clock-in.
pub fn close_open_session_before_clock_in(
    conn: &crate::db::Connection,
    user_id: i64,
    punch_date: &str,
    clock_out_time: &str,
    updated_at: &str,
    today_shift: &crate::shift_logic::ShiftConfig,
) {
    use crate::shift_logic::{close_open_sessions, resolve_shift_for_user};

    for _ in 0..8 {
        let Some((_, session_date, _)) = find_open_attendance_session(conn, user_id, punch_date) else {
            break;
        };
        let session_shift = resolve_shift_for_user(conn, user_id, &session_date);
        close_open_sessions(
            conn,
            user_id,
            &session_date,
            clock_out_time,
            updated_at,
            &session_shift,
        );
    }
    close_open_sessions(conn, user_id, punch_date, clock_out_time, updated_at, today_shift);
}

pub fn combine_datetime(date: &str, time: &str) -> String {
    let time_part = if time.len() >= 8 { &time[..8] } else { time };
    format!("{}T{}", date, time_part)
}

/// True when the organization has a holiday on this calendar date.
pub fn org_date_is_holiday(conn: &crate::db::Connection, org_id: i64, date: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM holidays WHERE organization_id = ?1 AND date = ?2 LIMIT 1",
        crate::params![org_id, date],
        |_| Ok(()),
    )
    .is_ok()
}

/// Holiday or weekly/roster day-off — punches are allowed and treated as extra work.
pub fn is_extra_work_day(
    conn: &crate::db::Connection,
    user_id: i64,
    org_id: i64,
    date: &str,
    day: chrono::NaiveDate,
) -> bool {
    if org_date_is_holiday(conn, org_id, date) {
        return true;
    }
    !crate::shift_logic::user_is_scheduled_working_day(conn, user_id, date, day)
}

/// Status + late/early policy for a punch on this date.
pub fn punch_status_and_lateness(
    conn: &crate::db::Connection,
    user_id: i64,
    org_id: i64,
    date: &str,
    day: chrono::NaiveDate,
    shift: &crate::shift_logic::ShiftConfig,
    clock_in: &str,
) -> (String, bool) {
    if is_extra_work_day(conn, user_id, org_id, date, day) {
        return ("extra_work".to_string(), false);
    }
    (
        "present".to_string(),
        crate::shift_logic::late_for_shift(shift, clock_in),
    )
}

/// True when the employee has an approved (non-deleted) leave covering this date.
pub fn user_on_approved_leave(
    conn: &crate::db::Connection,
    user_id: i64,
    date: &str,
) -> bool {
    conn.query_row(
        "SELECT 1 FROM leave_requests
         WHERE user_id = ?1 AND status = 'approved' AND deleted_at IS NULL
           AND start_date <= ?2 AND end_date >= ?2
         LIMIT 1",
        crate::params![user_id, date],
        |_| Ok(()),
    )
    .is_ok()
}

/// Soft-delete absent-only markers in a date range (no clock-in).
/// Used when leave is approved so registers show L instead of A.
pub fn clear_absent_only_markers(
    conn: &crate::db::Connection,
    user_id: i64,
    start_date: &str,
    end_date: &str,
    now: &str,
) -> usize {
    conn.execute(
        "UPDATE attendance
         SET deleted_at = ?1, updated_at = ?1
         WHERE user_id = ?2 AND deleted_at IS NULL
           AND date >= ?3 AND date <= ?4
           AND LOWER(TRIM(COALESCE(status, ''))) = 'absent'
           AND clock_in IS NULL",
        crate::params![now, user_id, start_date, end_date],
    )
    .unwrap_or(0) as usize
}

/// Keep `users.status` in sync with whether approved leave covers today.
pub fn refresh_user_on_leave_status(conn: &crate::db::Connection, user_id: i64) {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let on_leave = user_on_approved_leave(conn, user_id, &today);
    let status = if on_leave { "on-leave" } else { "active" };
    let _ = conn.execute(
        "UPDATE users SET status = ?1, updated_at = datetime('now')
         WHERE id = ?2 AND deleted_at IS NULL AND status != 'inactive'",
        crate::params![status, user_id],
    );
}

/// Day the employee is expected to work (counts toward absent if no punch).
/// Excludes week-offs, holidays, and approved leave.
pub fn expects_attendance(
    conn: &crate::db::Connection,
    user_id: i64,
    org_id: i64,
    date: &str,
    day: chrono::NaiveDate,
) -> bool {
    if user_on_approved_leave(conn, user_id, date) {
        return false;
    }
    if org_date_is_holiday(conn, org_id, date) {
        return false;
    }
    crate::shift_logic::user_is_scheduled_working_day(conn, user_id, date, day)
}

/// Sync leave approval into attendance: clear conflicting absents + refresh user status.
pub fn sync_attendance_after_leave_approved(
    conn: &crate::db::Connection,
    user_id: i64,
    start_date: &str,
    end_date: &str,
) {
    let now = chrono::Local::now()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    clear_absent_only_markers(conn, user_id, start_date, end_date, &now);
    refresh_user_on_leave_status(conn, user_id);
}
