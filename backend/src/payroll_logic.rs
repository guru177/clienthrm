//! Shared payroll calculations: business days, LOP, adjustments.

use chrono::{Datelike, NaiveDate};
use std::collections::{HashMap, HashSet};

use crate::tenant::org_id_for_user;

pub fn is_working_day_for_user(
    conn: &crate::db::Connection,
    user_id: i64,
    d: NaiveDate,
) -> bool {
    let date_str = d.format("%Y-%m-%d").to_string();
    crate::shift_logic::user_is_scheduled_working_day(conn, user_id, &date_str, d)
}

pub fn month_bounds(month: i32, year: i32) -> (NaiveDate, NaiveDate) {
    // Clamp to a valid calendar range so attacker-controlled month/year cannot panic.
    let m = month.clamp(1, 12) as u32;
    let y = year.clamp(1970, 9999);
    let start = NaiveDate::from_ymd_opt(y, m, 1)
        .unwrap_or_else(|| NaiveDate::from_ymd_opt(2000, 1, 1).expect("constant date is valid"));
    let end = start
        .with_day(start.num_days_in_month().into())
        .unwrap_or(start);
    (start, end)
}

pub fn calendar_days_in_month(month: i32, year: i32) -> i64 {
    NaiveDate::from_ymd_opt(year, month as u32, 1)
        .map(|d| d.num_days_in_month() as i64)
        .unwrap_or(30)
}

pub fn working_days_between_for_user(
    conn: &crate::db::Connection,
    user_id: i64,
    start: NaiveDate,
    end: NaiveDate,
) -> i64 {
    if end < start {
        return 0;
    }
    let mut count = 0i64;
    let mut d = start;
    while d <= end {
        if is_working_day_for_user(conn, user_id, d) {
            count += 1;
        }
        d += chrono::Duration::days(1);
    }
    count
}

fn working_dates_between_for_user(
    conn: &crate::db::Connection,
    user_id: i64,
    start: NaiveDate,
    end: NaiveDate,
) -> HashSet<NaiveDate> {
    let mut dates = HashSet::new();
    if end < start {
        return dates;
    }
    let mut d = start;
    while d <= end {
        if is_working_day_for_user(conn, user_id, d) {
            dates.insert(d);
        }
        d += chrono::Duration::days(1);
    }
    dates
}

/// Returns active date range for user within a payroll month (join/exit clipped).
pub fn user_active_range_in_month(
    conn: &crate::db::Connection,
    user_id: i64,
    month: i32,
    year: i32,
) -> (NaiveDate, NaiveDate) {
    let (month_start, month_end) = month_bounds(month, year);
    let (join, exit): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT date_of_joining, date_of_exit FROM users WHERE id=?1",
            [user_id],
            |row| Ok((row.get_idx::<Option<String>>(0)?, row.get_idx::<Option<String>>(1)?)),
        )
        .unwrap_or((None, None));

    let mut range_start = month_start;
    let mut range_end = month_end;

    if let Some(ref j) = join {
        if let Ok(d) = NaiveDate::parse_from_str(j, "%Y-%m-%d") {
            if d > range_start {
                range_start = d;
            }
        }
    }
    if let Some(ref e) = exit {
        if !e.is_empty() {
            if let Ok(d) = NaiveDate::parse_from_str(e, "%Y-%m-%d") {
                if d < range_end {
                    range_end = d;
                }
            }
        }
    }
    (range_start, range_end)
}

/// Business days in month, optionally clipped to employee active range.
pub fn working_days_for_user(
    conn: &crate::db::Connection,
    user_id: i64,
    month: i32,
    year: i32,
) -> i64 {
    let (range_start, range_end) = user_active_range_in_month(conn, user_id, month, year);
    if range_end < range_start {
        return 0;
    }
    working_days_between_for_user(conn, user_id, range_start, range_end)
}

/// Business-day holidays that fall within the user's active range in the month.
pub fn paid_holidays_for_user(
    conn: &crate::db::Connection,
    user_id: i64,
    month: i32,
    year: i32,
) -> i64 {
    let (range_start, range_end) = user_active_range_in_month(conn, user_id, month, year);
    if range_end < range_start {
        return 0;
    }
    let start_s = month_bounds(month, year).0.format("%Y-%m-%d").to_string();
    let end_s = month_bounds(month, year).1.format("%Y-%m-%d").to_string();

    let stmt = match conn.prepare(
        "SELECT date FROM holidays WHERE organization_id = ?3 AND date >= ?1 AND date <= ?2",
    ) {
        Ok(s) => s,
        Err(_) => return 0,
    };

    let org_id = org_id_for_user(conn, user_id);
    stmt.query_map(crate::params![start_s, end_s, org_id], |row| row.get_idx::<String>(0))
        .into_iter()
        .filter_map(|d| NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok())
        .filter(|d| {
            *d >= range_start
                && *d <= range_end
                && is_working_day_for_user(conn, user_id, *d)
        })
        .count() as i64
}

/// Distinct business-day leave dates for a user within a range and status filter.
pub fn collect_leave_business_dates(
    conn: &crate::db::Connection,
    user_id: i64,
    range_start: NaiveDate,
    range_end: NaiveDate,
    statuses: &[&str],
) -> HashSet<NaiveDate> {
    collect_leave_business_dates_filtered(
        conn,
        user_id,
        range_start,
        range_end,
        statuses,
        None,
        None,
    )
}

/// Like collect_leave_business_dates but optionally filter by leave_type slugs.
pub fn collect_leave_business_dates_filtered(
    conn: &crate::db::Connection,
    user_id: i64,
    range_start: NaiveDate,
    range_end: NaiveDate,
    statuses: &[&str],
    leave_type_slugs: Option<&[String]>,
    exclude_leave_id: Option<i64>,
) -> HashSet<NaiveDate> {
    if statuses.is_empty() || range_end < range_start {
        return HashSet::new();
    }

    let status_ph: String = statuses.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let slug_clause = if let Some(slugs) = leave_type_slugs {
        if slugs.is_empty() {
            return HashSet::new();
        }
        let sp: String = slugs.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        format!(" AND leave_type IN ({sp})")
    } else {
        String::new()
    };
    let sql = format!(
        "SELECT id, start_date, end_date FROM leave_requests
         WHERE user_id=? AND deleted_at IS NULL AND status IN ({status_ph})
           AND start_date <= ? AND end_date >= ?{slug_clause}",
    );

    let mut params: Vec<crate::db::ParamValue> = vec![
        crate::db::into_param_value(user_id),
    ];
    for s in statuses {
        params.push(crate::db::into_param_value(*s));
    }
    params.push(crate::db::into_param_value(
        range_end.format("%Y-%m-%d").to_string(),
    ));
    params.push(crate::db::into_param_value(
        range_start.format("%Y-%m-%d").to_string(),
    ));
    if let Some(slugs) = leave_type_slugs {
        for slug in slugs {
            params.push(crate::db::into_param_value(slug.clone()));
        }
    }

    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return HashSet::new(),
    };

    let rows: Vec<(i64, String, String)> = stmt
        .query_map(&params, |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<String>(2)?,
            ))
        });

    let mut dates = HashSet::new();
    for (id, start, end) in rows {
        if exclude_leave_id == Some(id) {
            continue;
        }
        let Ok(ls) = NaiveDate::parse_from_str(&start, "%Y-%m-%d") else {
            continue;
        };
        let Ok(le) = NaiveDate::parse_from_str(&end, "%Y-%m-%d") else {
            continue;
        };
        dates.extend(working_dates_between_for_user(
            conn,
            user_id,
            ls.max(range_start),
            le.min(range_end),
        ));
    }
    dates
}

/// Per-date max LOP weight from approved leave (paid=0, half_day=0.5, unpaid=1).
pub fn collect_approved_leave_lop_weights(
    conn: &crate::db::Connection,
    user_id: i64,
    range_start: NaiveDate,
    range_end: NaiveDate,
) -> HashMap<NaiveDate, f64> {
    if range_end < range_start {
        return HashMap::new();
    }
    let sql = "SELECT start_date, end_date, leave_type FROM leave_requests
         WHERE user_id=? AND deleted_at IS NULL AND status='approved'
           AND start_date <= ? AND end_date >= ?";
    let stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return HashMap::new(),
    };
    let rows: Vec<(String, String, String)> = stmt
        .query_map(
            crate::params![
                user_id,
                range_end.format("%Y-%m-%d").to_string(),
                range_start.format("%Y-%m-%d").to_string(),
            ],
            |row| Ok((
                row.get_idx::<String>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<String>(2)?,
            )),
        );

    let mut weights: HashMap<NaiveDate, f64> = HashMap::new();
    for (start, end, leave_type) in rows {
        let factor = crate::leave_type_logic::lop_factor_for_user_slug(conn, user_id, &leave_type);
        if factor <= 0.0 {
            continue;
        }
        let Ok(ls) = NaiveDate::parse_from_str(&start, "%Y-%m-%d") else {
            continue;
        };
        let Ok(le) = NaiveDate::parse_from_str(&end, "%Y-%m-%d") else {
            continue;
        };
        for d in working_dates_between_for_user(conn, user_id, ls.max(range_start), le.min(range_end))
        {
            weights
                .entry(d)
                .and_modify(|w| *w = w.max(factor))
                .or_insert(factor);
        }
    }
    weights
}

/// Dates with an open clock-in session (no clock-out yet) within range.
pub fn collect_open_clock_in_dates(
    conn: &crate::db::Connection,
    user_id: i64,
    range_start: NaiveDate,
    range_end: NaiveDate,
) -> HashSet<NaiveDate> {
    if range_end < range_start {
        return HashSet::new();
    }
    let start_s = range_start.format("%Y-%m-%d").to_string();
    let end_s = range_end.format("%Y-%m-%d").to_string();
    let stmt = match conn.prepare(
        "SELECT DISTINCT date FROM attendance
         WHERE user_id=?1 AND date >= ?2 AND date <= ?3 AND deleted_at IS NULL
           AND clock_out IS NULL",
    ) {
        Ok(s) => s,
        Err(_) => return HashSet::new(),
    };
    stmt.query_map(crate::params![user_id, &start_s, &end_s], |row| row.get_idx::<String>(0))
        .into_iter()
        .filter_map(|d| NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok())
        .filter(|d| is_working_day_for_user(conn, user_id, *d))
        .collect()
}

/// Total LOP-equivalent days in month (supports fractional half-days).
pub fn total_lop_days_for_month(
    conn: &crate::db::Connection,
    user_id: i64,
    month: i32,
    year: i32,
) -> f64 {
    let (active_start, active_end) = user_active_range_in_month(conn, user_id, month, year);
    if active_end < active_start {
        return 0.0;
    }
    let present = collect_present_business_dates(conn, user_id, active_start, active_end);
    let open_sessions = collect_open_clock_in_dates(conn, user_id, active_start, active_end);
    let today = chrono::Utc::now().date_naive();
    let holidays = collect_paid_holiday_dates(conn, user_id, month, year);
    let leave_lop = collect_approved_leave_lop_weights(conn, user_id, active_start, active_end);
    let all_approved =
        collect_leave_business_dates(conn, user_id, active_start, active_end, &["approved"]);

    let mut total = 0.0;
    let mut d = active_start;
    while d <= active_end {
        if is_working_day_for_user(conn, user_id, d) {
            if holidays.contains(&d) {
                // paid holiday — no LOP
            } else if let Some(w) = leave_lop.get(&d) {
                // unpaid / half-day leave still counts even if employee clocked in
                total += w;
            } else if present.contains(&d) {
                // present without unpaid leave
            } else if open_sessions.contains(&d) && d == today {
                // in-progress clock-in today — wait for clock-out before LOP
            } else if all_approved.contains(&d) {
                // paid approved leave — no LOP
            } else {
                total += 1.0;
            }
        }
        d += chrono::Duration::days(1);
    }
    total
}

/// Completed attendance days (clock-out required), clipped to active range.
pub fn collect_present_business_dates(
    conn: &crate::db::Connection,
    user_id: i64,
    range_start: NaiveDate,
    range_end: NaiveDate,
) -> HashSet<NaiveDate> {
    if range_end < range_start {
        return HashSet::new();
    }
    let start_s = range_start.format("%Y-%m-%d").to_string();
    let end_s = range_end.format("%Y-%m-%d").to_string();

    let stmt = match conn.prepare(
        "SELECT DISTINCT date FROM attendance
         WHERE user_id=?1 AND date >= ?2 AND date <= ?3 AND deleted_at IS NULL
           AND clock_out IS NOT NULL",
    ) {
        Ok(s) => s,
        Err(_) => return HashSet::new(),
    };

    stmt.query_map(crate::params![user_id, &start_s, &end_s], |row| row.get_idx::<String>(0))
        .into_iter()
        .filter_map(|d| NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok())
        .filter(|d| is_working_day_for_user(conn, user_id, *d))
        .collect()
}

/// Approved leave business days in month (distinct dates — overlapping requests deduped).
pub fn employee_leave_business_days(
    conn: &crate::db::Connection,
    user_id: i64,
    month: i32,
    year: i32,
) -> i64 {
    let (active_start, active_end) = user_active_range_in_month(conn, user_id, month, year);
    if active_end < active_start {
        return 0;
    }
    collect_leave_business_dates(conn, user_id, active_start, active_end, &["approved"]).len() as i64
}

/// Used approved quota-counting leave business days in calendar year.
pub fn employee_leave_used_in_year(conn: &crate::db::Connection, user_id: i64, year: i32) -> i64 {
    let Some(year_start) = NaiveDate::from_ymd_opt(year, 1, 1) else { return 0; };
    let Some(year_end) = NaiveDate::from_ymd_opt(year, 12, 31) else { return 0; };
    let slugs = crate::leave_type_logic::quota_slugs_for_user(conn, user_id);
    if slugs.is_empty() {
        return 0;
    }
    collect_leave_business_dates_filtered(
        conn,
        user_id,
        year_start,
        year_end,
        &["approved"],
        Some(&slugs),
        None,
    )
    .len() as i64
}

/// Pending quota-counting leave business days in calendar year (deduped).
pub fn employee_pending_leave_days_in_year(conn: &crate::db::Connection, user_id: i64, year: i32) -> i64 {
    let Some(year_start) = NaiveDate::from_ymd_opt(year, 1, 1) else { return 0; };
    let Some(year_end) = NaiveDate::from_ymd_opt(year, 12, 31) else { return 0; };
    let slugs = crate::leave_type_logic::quota_slugs_for_user(conn, user_id);
    if slugs.is_empty() {
        return 0;
    }
    collect_leave_business_dates_filtered(
        conn,
        user_id,
        year_start,
        year_end,
        &["pending"],
        Some(&slugs),
        None,
    )
    .len() as i64
}

/// Approved quota-counting leave business days for one leave type in a calendar year.
pub fn employee_leave_used_for_type_in_year(
    conn: &crate::db::Connection,
    user_id: i64,
    year: i32,
    leave_type: &str,
) -> i64 {
    let Some(year_start) = NaiveDate::from_ymd_opt(year, 1, 1) else { return 0; };
    let Some(year_end) = NaiveDate::from_ymd_opt(year, 12, 31) else { return 0; };
    let slugs = vec![leave_type.to_string()];
    collect_leave_business_dates_filtered(
        conn,
        user_id,
        year_start,
        year_end,
        &["approved"],
        Some(&slugs),
        None,
    )
    .len() as i64
}

fn would_exceed_quota_for_year(
    conn: &crate::db::Connection,
    user_id: i64,
    range_start: NaiveDate,
    range_end: NaiveDate,
    leave_type: &str,
    year: i32,
    exclude_leave_id: Option<i64>,
) -> bool {
    if !crate::leave_type_logic::counts_toward_quota_for_user(conn, user_id, leave_type) {
        return false;
    }
    let org_id = org_id_for_user(conn, user_id);
    let Some(effective) =
        employee_effective_leave_quota_for_type(conn, user_id, year, org_id, leave_type)
    else {
        return false;
    };
    let Some(year_start) = NaiveDate::from_ymd_opt(year, 1, 1) else { return false; };
    let Some(year_end) = NaiveDate::from_ymd_opt(year, 12, 31) else { return false; };
    let type_slugs = vec![leave_type.to_string()];

    let req_start = range_start.max(year_start);
    let req_end = range_end.min(year_end);
    if req_end < req_start {
        return false;
    }

    let mut dates = collect_leave_business_dates_filtered(
        conn,
        user_id,
        year_start,
        year_end,
        &["approved", "pending"],
        Some(&type_slugs),
        exclude_leave_id,
    );
    if exclude_leave_id.is_none() {
        dates.extend(working_dates_between_for_user(
            conn,
            user_id,
            req_start,
            req_end,
        ));
    }

    dates.len() as i64 > effective
}

/// Whether adding a new quota-counting leave request would exceed annual quota.
/// Spans crossing calendar years are checked against each affected year.
pub fn would_exceed_annual_quota(
    conn: &crate::db::Connection,
    user_id: i64,
    start_date: &str,
    end_date: &str,
    leave_type: &str,
    exclude_leave_id: Option<i64>,
) -> bool {
    let Ok(ls) = NaiveDate::parse_from_str(start_date, "%Y-%m-%d") else {
        return false;
    };
    let Ok(le) = NaiveDate::parse_from_str(end_date, "%Y-%m-%d") else {
        return false;
    };
    let mut year = ls.year();
    let end_year = le.year();
    while year <= end_year {
        if would_exceed_quota_for_year(
            conn,
            user_id,
            ls,
            le,
            leave_type,
            year,
            exclude_leave_id,
        ) {
            return true;
        }
        year += 1;
    }
    false
}

/// Total distinct approved leave business days across all employees in a month (tenant-scoped).
pub fn approved_leave_business_days_in_month(
    conn: &crate::db::Connection,
    org_id: i64,
    month: i32,
    year: i32,
) -> i64 {
    let (month_start, month_end) = month_bounds(month, year);
    let end_str = month_end.format("%Y-%m-%d").to_string();
    let start_str = month_start.format("%Y-%m-%d").to_string();

    let stmt = match conn.prepare(
        "SELECT lr.user_id, lr.start_date, lr.end_date FROM leave_requests lr
         JOIN users u ON u.id = lr.user_id
         WHERE u.organization_id = ?3
           AND lr.status='approved' AND lr.deleted_at IS NULL
           AND lr.start_date <= ?1 AND lr.end_date >= ?2",
    ) {
        Ok(s) => s,
        Err(_) => return 0,
    };

    let rows: Vec<(i64, String, String)> = stmt
        .query_map(crate::params![&end_str, &start_str, org_id], |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<String>(2)?,
            ))
        });

    let mut dates = HashSet::new();
    for (user_id, start, end) in rows {
        let Ok(ls) = NaiveDate::parse_from_str(&start, "%Y-%m-%d") else {
            continue;
        };
        let Ok(le) = NaiveDate::parse_from_str(&end, "%Y-%m-%d") else {
            continue;
        };
        let (active_start, active_end) = user_active_range_in_month(conn, user_id, month, year);
        if active_end < active_start {
            continue;
        }
        dates.extend(working_dates_between_for_user(
            conn,
            user_id,
            ls.max(month_start).max(active_start),
            le.min(month_end).min(active_end),
        ));
    }
    dates.len() as i64
}

pub fn annual_leave_quota(conn: &crate::db::Connection, org_id: i64) -> i64 {
    conn.query_row(
        "SELECT CAST(value AS INTEGER) FROM app_settings WHERE organization_id = ?1 AND key='annual_leave_quota'",
        [org_id],
        |r| r.get_idx::<i64>(0),
    )
    .unwrap_or(12)
}

/// Bonus leave days granted by admin (e.g. worked on a holiday / comp-off).
pub fn employee_leave_credits_in_year(
    conn: &crate::db::Connection,
    user_id: i64,
    year: i32,
) -> i64 {
    conn.query_row(
        "SELECT COALESCE(SUM(days), 0) FROM leave_credits
         WHERE user_id = ?1 AND year = ?2 AND deleted_at IS NULL",
        crate::params![user_id, year],
        |r| r.get_idx::<i64>(0),
    )
    .unwrap_or(0)
}

/// Base org quota plus per-employee bonus credits for the calendar year.
pub fn employee_effective_leave_quota(
    conn: &crate::db::Connection,
    user_id: i64,
    year: i32,
    org_id: i64,
) -> i64 {
    annual_leave_quota(conn, org_id) + employee_leave_credits_in_year(conn, user_id, year)
}

/// Per-type annual quota. Returns None when the type has no enforced limit.
pub fn leave_type_annual_quota(
    conn: &crate::db::Connection,
    org_id: i64,
    leave_type: &str,
) -> Option<i64> {
    let cfg = crate::leave_type_logic::config_for_slug(conn, org_id, leave_type)?;
    if !cfg.counts_toward_quota {
        return None;
    }
    if let Some(q) = cfg.quota_days {
        return Some(q);
    }
    if leave_type == "annual" {
        Some(annual_leave_quota(conn, org_id))
    } else {
        None
    }
}

/// Effective quota for a specific leave type (includes bonus credits for annual only).
pub fn employee_effective_leave_quota_for_type(
    conn: &crate::db::Connection,
    user_id: i64,
    year: i32,
    org_id: i64,
    leave_type: &str,
) -> Option<i64> {
    let base = leave_type_annual_quota(conn, org_id, leave_type)?;
    if leave_type == "annual" {
        Some(base + employee_leave_credits_in_year(conn, user_id, year))
    } else {
        Some(base)
    }
}

pub fn employee_present_business_days(
    conn: &crate::db::Connection,
    user_id: i64,
    month: i32,
    year: i32,
) -> i64 {
    let (active_start, active_end) = user_active_range_in_month(conn, user_id, month, year);
    if active_end < active_start {
        return 0;
    }
    collect_present_business_dates(conn, user_id, active_start, active_end).len() as i64
}

/// Distinct paid-holiday business dates for a user in the active month range.
pub fn collect_paid_holiday_dates(
    conn: &crate::db::Connection,
    user_id: i64,
    month: i32,
    year: i32,
) -> HashSet<NaiveDate> {
    let (active_start, active_end) = user_active_range_in_month(conn, user_id, month, year);
    if active_end < active_start {
        return HashSet::new();
    }
    let start_s = month_bounds(month, year).0.format("%Y-%m-%d").to_string();
    let end_s = month_bounds(month, year).1.format("%Y-%m-%d").to_string();

    let org_id = org_id_for_user(conn, user_id);
    let stmt = match conn.prepare(
        "SELECT date FROM holidays WHERE organization_id = ?3 AND date >= ?1 AND date <= ?2",
    ) {
        Ok(s) => s,
        Err(_) => return HashSet::new(),
    };

    stmt.query_map(crate::params![start_s, end_s, org_id], |row| row.get_idx::<String>(0))
        .into_iter()
        .filter_map(|d| NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok())
        .filter(|d| {
            is_working_day_for_user(conn, user_id, *d)
                && *d >= active_start
                && *d <= active_end
        })
        .collect()
}

/// Per-component LOP line (from salary_components earnings).
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct LopLine {
    pub component_id: i64,
    pub name: String,
    pub amount: f64,
}

/// Per-component LOP breakdown (matches Excel red section).
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct LopBreakdown {
    pub days: f64,
    pub lines: Vec<LopLine>,
    pub basic: f64,
    pub hra: f64,
    pub conveyance: f64,
    pub special: f64,
    pub total: f64,
    pub net_after_lop: f64,
}

pub fn component_lop_breakdown(
    salary: &crate::salary_logic::PayrollSalaryBreakdown,
    lop_days: f64,
    divisor_days: f64,
) -> LopBreakdown {
    let divisor = divisor_days;
    if divisor <= 0.0 || lop_days <= 0.0 {
        return LopBreakdown {
            net_after_lop: salary.lop_gross(),
            ..Default::default()
        };
    }

    let mut lines = Vec::new();
    let mut basic = 0.0;
    let mut hra = 0.0;
    let mut conveyance = 0.0;
    let mut special = 0.0;

    for comp in &salary.components {
        let comp_type = comp.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if comp_type != "earning" {
            continue;
        }
        if comp
            .get("is_reimbursement")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            continue;
        }
        let amount = comp.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
        if amount <= 0.0 {
            continue;
        }
        let name = comp
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Earning")
            .to_string();
        let slug = comp
            .get("slug")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let comp_id = comp
            .get("component_id")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let lop_amt = crate::salary_split::round2(amount * lop_days / divisor);
        if lop_amt <= 0.0 {
            continue;
        }
        lines.push(LopLine {
            component_id: comp_id,
            name: format!("LOP — {name}"),
            amount: lop_amt,
        });
        match crate::salary_logic::bucket_component(slug, &name) {
            "basic" => basic = crate::salary_split::round2(basic + lop_amt),
            "hra" => hra = crate::salary_split::round2(hra + lop_amt),
            "transport" => conveyance = crate::salary_split::round2(conveyance + lop_amt),
            _ => special = crate::salary_split::round2(special + lop_amt),
        }
    }

    let mut total = crate::salary_split::round2(basic + hra + conveyance + special);
    let lop_gross = salary.lop_gross();
    if total <= 0.0 && lop_days > 0.0 && lop_gross > 0.0 {
        total = crate::salary_split::round2(lop_gross * lop_days / divisor);
    }
    LopBreakdown {
        days: lop_days,
        lines,
        basic,
        hra,
        conveyance,
        special,
        total,
        net_after_lop: crate::salary_split::round2((lop_gross - total).max(0.0)),
    }
}

/// LOP with per-component split; uses calendar days in month as divisor.
pub fn lop_amount_for_user_month(
    conn: &crate::db::Connection,
    user_id: i64,
    month: i32,
    year: i32,
    _working_days: i64,
) -> (f64, LopBreakdown) {
    let lop_days = total_lop_days_for_month(conn, user_id, month, year);
    let working_divisor = working_days_for_user(conn, user_id, month, year).max(1) as f64;
    if lop_days <= 0.0 {
        return (0.0, LopBreakdown::default());
    }
    let cal_days = calendar_days_in_month(month, year);
    let month_end = format!("{}-{:02}-{}", year, month, cal_days);
    let Some(salary) = crate::salary_logic::load_user_salary(conn, user_id, &month_end) else {
        return (0.0, LopBreakdown::default());
    };
    let breakdown = component_lop_breakdown(&salary, lop_days, working_divisor);
    (breakdown.total, breakdown)
}

/// Sum of per-employee paid holidays across active staff for a month.
pub fn total_paid_holidays_for_month(
    conn: &crate::db::Connection,
    org_id: i64,
    month: i32,
    year: i32,
) -> i64 {
    let stmt = match conn.prepare(
        "SELECT id FROM users WHERE deleted_at IS NULL AND is_super_admin=0 AND organization_id = ?1",
    ) {
        Ok(s) => s,
        Err(_) => return 0,
    };
    let user_ids: Vec<i64> = stmt
        .query_map([org_id], |row| row.get_idx::<i64>(0));
    user_ids
        .iter()
        .map(|uid| paid_holidays_for_user(conn, *uid, month, year))
        .sum()
}

/// Approved leave business days in month grouped by leave type (deduped per date per type).
pub fn approved_leave_days_by_type_in_month(
    conn: &crate::db::Connection,
    org_id: i64,
    month: i32,
    year: i32,
) -> HashMap<String, i64> {
    let (month_start, month_end) = month_bounds(month, year);
    let end_str = month_end.format("%Y-%m-%d").to_string();
    let start_str = month_start.format("%Y-%m-%d").to_string();

    let stmt = match conn.prepare(
        "SELECT lr.user_id, lr.leave_type, lr.start_date, lr.end_date FROM leave_requests lr
         JOIN users u ON u.id = lr.user_id
         WHERE u.organization_id = ?3
           AND lr.status='approved' AND lr.deleted_at IS NULL
           AND lr.start_date <= ?1 AND lr.end_date >= ?2",
    ) {
        Ok(s) => s,
        Err(_) => return HashMap::new(),
    };

    let rows: Vec<(i64, String, String, String)> = stmt
        .query_map(crate::params![&end_str, &start_str, org_id], |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<String>(2)?,
                row.get_idx::<String>(3)?,
            ))
        });

    let mut by_type: HashMap<String, HashSet<NaiveDate>> = HashMap::new();
    for (user_id, leave_type, start, end) in rows {
        let Ok(ls) = NaiveDate::parse_from_str(&start, "%Y-%m-%d") else {
            continue;
        };
        let Ok(le) = NaiveDate::parse_from_str(&end, "%Y-%m-%d") else {
            continue;
        };
        let (active_start, active_end) = user_active_range_in_month(conn, user_id, month, year);
        if active_end < active_start {
            continue;
        }
        let dates = working_dates_between_for_user(
            conn,
            user_id,
            ls.max(month_start).max(active_start),
            le.min(month_end).min(active_end),
        );
        by_type.entry(leave_type).or_default().extend(dates);
    }
    by_type
        .into_iter()
        .map(|(k, v)| (k, v.len() as i64))
        .collect()
}

/// Parse per-employee advance allocation overrides from preview request body.
pub fn parse_advance_allocation_map(
    advance_allocations: &Option<serde_json::Value>,
) -> HashMap<i64, Vec<crate::statutory_logic::AdvanceAllocation>> {
    let mut map = HashMap::new();
    let Some(obj) = advance_allocations.as_ref().and_then(|v| v.as_object()) else {
        return map;
    };
    for (key, val) in obj {
        let Ok(uid) = key.parse::<i64>() else { continue };
        let Some(arr) = val.as_array() else { continue };
        let allocs: Vec<crate::statutory_logic::AdvanceAllocation> = arr
            .iter()
            .filter_map(|item| {
                Some(crate::statutory_logic::AdvanceAllocation {
                    advance_id: item.get("advance_id")?.as_i64()?,
                    amount: item.get("amount")?.as_f64()?,
                })
            })
            .collect();
        if !allocs.is_empty() {
            map.insert(uid, allocs);
        }
    }
    map
}

/// Apply default or custom per-advance recovery to payslip totals.
pub fn apply_advance_override(
    default_advance: f64,
    net: f64,
    total_deductions: f64,
    active_advances: &[crate::statutory_logic::EmployeeAdvance],
    user_overrides: Option<&[crate::statutory_logic::AdvanceAllocation]>,
) -> Result<(f64, f64, f64, Vec<crate::statutory_logic::AdvanceAllocation>), String> {
    let allocations = if let Some(overrides) = user_overrides {
        crate::statutory_logic::validate_advance_allocations(active_advances, overrides)?
    } else {
        crate::statutory_logic::default_advance_allocations(active_advances)
    };
    let custom_advance = crate::statutory_logic::sum_advance_allocations(&allocations);
    let delta = crate::salary_split::round2(custom_advance - default_advance);
    let total_deductions = crate::salary_split::round2((total_deductions + delta).max(0.0));
    let net = crate::salary_split::round2((net - delta).max(0.0));
    Ok((custom_advance, net, total_deductions, allocations))
}

/// Parse per-employee adjustments from preview request body.
pub fn parse_employee_adjustments(
    adjustments: &Option<serde_json::Value>,
) -> HashMap<i64, Vec<serde_json::Value>> {
    let mut map = HashMap::new();
    let Some(obj) = adjustments.as_ref().and_then(|v| v.as_object()) else {
        return map;
    };
    for (key, val) in obj {
        let Ok(uid) = key.parse::<i64>() else { continue };
        if let Some(arr) = val.as_array() {
            map.insert(uid, arr.clone());
        }
    }
    map
}

fn sum_adjustment_additions(adjs: &[serde_json::Value]) -> f64 {
    adjs.iter()
        .filter(|a| a.get("type").and_then(|v| v.as_str()) == Some("addition"))
        .map(|a| a.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0))
        .sum()
}

fn sum_adjustment_deductions(adjs: &[serde_json::Value]) -> f64 {
    adjs.iter()
        .filter(|a| a.get("type").and_then(|v| v.as_str()) == Some("deduction"))
        .map(|a| a.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0))
        .sum()
}

/// Merge draft + generate-time adjustments and apply once (avoids double-counting preview flats).
pub fn finalize_payslip_adjustments(
    gross: f64,
    net: f64,
    total_deductions: f64,
    existing_adj_json: &str,
    common_adjustments: &[serde_json::Value],
) -> (f64, f64, String) {
    let existing: Vec<serde_json::Value> =
        serde_json::from_str(existing_adj_json).unwrap_or_default();
    let mut all_adjs = existing.clone();
    all_adjs.extend(common_adjustments.iter().cloned());

    let flat_add = sum_adjustment_additions(&existing);
    let flat_ded = sum_adjustment_deductions(&existing);
    let base_net = net - flat_add + flat_ded;
    let base_total_ded = (total_deductions - flat_ded).max(0.0);

    apply_adjustment_list(gross, base_net, base_total_ded, &all_adjs)
}

/// Apply a list of flat adjustments; returns (net, total_deductions, json).
pub fn apply_adjustment_list(
    gross: f64,
    mut net: f64,
    mut total_deductions: f64,
    adjs: &[serde_json::Value],
) -> (f64, f64, String) {
    let mut applied = Vec::new();
    for adj in adjs {
        let adj_type = adj.get("type").and_then(|v| v.as_str()).unwrap_or("addition");
        let value_type = adj
            .get("value_type")
            .and_then(|v| v.as_str())
            .unwrap_or("flat");
        let value = adj.get("value").and_then(|v| v.as_f64()).or_else(|| {
            adj.get("amount").and_then(|v| v.as_f64())
        }).unwrap_or(0.0);
        if value == 0.0 {
            continue;
        }
        let amount = if value_type == "percentage" {
            gross * value / 100.0
        } else {
            value
        };
        if adj_type == "addition" {
            net += amount;
        } else {
            net = (net - amount).max(0.0);
            total_deductions += amount;
        }
        applied.push(serde_json::json!({
            "type": adj_type,
            "label": adj.get("label").and_then(|v| v.as_str()).unwrap_or(""),
            "value_type": value_type,
            "value": value,
            "amount": amount,
        }));
    }
    let json = serde_json::to_string(&applied).unwrap_or_else(|_| "[]".to_string());
    (net, total_deductions, json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calendar_days_june() {
        assert_eq!(calendar_days_in_month(6, 2026), 30);
    }

    #[test]
    fn calendar_days_february_leap() {
        assert_eq!(calendar_days_in_month(2, 2024), 29);
    }

    #[test]
    fn parse_employee_adjustments_map() {
        let raw = serde_json::json!({"2": [{"type": "addition", "amount": 100}]});
        let map = parse_employee_adjustments(&Some(raw));
        assert_eq!(map.len(), 1);
        assert_eq!(map.get(&2).unwrap().len(), 1);
    }

    #[test]
    fn apply_adjustment_list_flat_deduction() {
        let adjs = vec![serde_json::json!({
            "type": "deduction",
            "label": "Fine",
            "value_type": "flat",
            "value": 50.0
        })];
        let (net, ded, _) = apply_adjustment_list(1000.0, 800.0, 200.0, &adjs);
        assert_eq!(net, 750.0);
        assert_eq!(ded, 250.0);
    }

    #[test]
    fn apply_advance_override_partial_recovery() {
        let advances = vec![
            crate::statutory_logic::EmployeeAdvance {
                id: 1,
                amount: 10_000.0,
                balance: 6_000.0,
                monthly_emi: 2_000.0,
                description: None,
            },
        ];
        let overrides = vec![crate::statutory_logic::AdvanceAllocation {
            advance_id: 1,
            amount: 500.0,
        }];
        let (adv, net, ded, _) =
            apply_advance_override(2_000.0, 18_000.0, 4_000.0, &advances, Some(&overrides)).unwrap();
        assert_eq!(adv, 500.0);
        assert_eq!(ded, 2_500.0);
        assert_eq!(net, 19_500.0);
    }

    #[test]
    fn apply_adjustment_percentage_of_gross() {
        let adjs = vec![serde_json::json!({
            "type": "addition",
            "label": "Bonus",
            "value_type": "percentage",
            "value": 10.0
        })];
        let (net, _, _) = apply_adjustment_list(1000.0, 900.0, 100.0, &adjs);
        assert!((net - 1000.0).abs() < 0.01);
    }
}
