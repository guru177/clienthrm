//! Bulk-loaded payroll month data to avoid per-day / per-employee query storms.

use chrono::NaiveDate;
use std::collections::{HashMap, HashSet};

use crate::shift_logic::{is_working_day, normalize_working_days_mask};

#[derive(Debug, Clone)]
pub struct MonthContext {
    #[allow(dead_code)]
    pub month: i32,
    #[allow(dead_code)]
    pub year: i32,
    #[allow(dead_code)]
    pub org_id: i64,
    pub month_start: NaiveDate,
    pub month_end: NaiveDate,
    holidays: HashSet<NaiveDate>,
    present_by_user: HashMap<i64, HashSet<NaiveDate>>,
    open_clock_in_by_user: HashMap<i64, HashSet<NaiveDate>>,
    approved_leave_by_user: HashMap<i64, HashSet<NaiveDate>>,
    leave_lop_by_user: HashMap<i64, HashMap<NaiveDate, f64>>,
    active_range_by_user: HashMap<i64, (NaiveDate, NaiveDate)>,
    roster_day_off: HashSet<(i64, NaiveDate)>,
    roster_has_shift: HashSet<(i64, NaiveDate)>,
    shift_mask_by_user_date: HashMap<(i64, NaiveDate), u8>,
}

impl MonthContext {
    pub fn prefetch(
        conn: &crate::db::Connection,
        org_id: i64,
        user_ids: &[i64],
        month: i32,
        year: i32,
    ) -> Self {
        let (month_start, month_end) = crate::payroll_logic::month_bounds(month, year);
        let start_s = month_start.format("%Y-%m-%d").to_string();
        let end_s = month_end.format("%Y-%m-%d").to_string();

        let holidays = load_holidays(conn, org_id, &start_s, &end_s, month_start, month_end);
        let (present_by_user, open_clock_in_by_user) =
            load_attendance(conn, user_ids, &start_s, &end_s);
        let (approved_leave_by_user, leave_lop_by_user) =
            load_leave(conn, user_ids, &start_s, &end_s, month_start, month_end);
        let active_range_by_user =
            load_active_ranges(conn, user_ids, month, year);
        let (roster_day_off, roster_has_shift) =
            load_roster(conn, user_ids, &start_s, &end_s, month_start, month_end);
        let shift_mask_by_user_date =
            load_shift_masks_by_date(conn, user_ids, month_start, month_end);

        log::debug!(
            "MonthContext prefetch org={org_id} period={month}/{year} users={}",
            user_ids.len()
        );

        Self {
            month,
            year,
            org_id,
            month_start,
            month_end,
            holidays,
            present_by_user,
            open_clock_in_by_user,
            approved_leave_by_user,
            leave_lop_by_user,
            active_range_by_user,
            roster_day_off,
            roster_has_shift,
            shift_mask_by_user_date,
        }
    }

    pub fn active_range(&self, user_id: i64) -> (NaiveDate, NaiveDate) {
        self.active_range_by_user
            .get(&user_id)
            .copied()
            .unwrap_or((self.month_start, self.month_end))
    }

    pub fn is_working_day(&self, user_id: i64, d: NaiveDate) -> bool {
        if self.roster_day_off.contains(&(user_id, d)) {
            return false;
        }
        if self.roster_has_shift.contains(&(user_id, d)) {
            return true;
        }
        let mask = self
            .shift_mask_by_user_date
            .get(&(user_id, d))
            .copied()
            .unwrap_or(31);
        is_working_day(mask, d)
    }

    pub fn working_days_between(&self, user_id: i64, start: NaiveDate, end: NaiveDate) -> i64 {
        self.working_dates_between(user_id, start, end).len() as i64
    }

    pub fn working_dates_between(
        &self,
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
            if self.is_working_day(user_id, d) {
                dates.insert(d);
            }
            d += chrono::Duration::days(1);
        }
        dates
    }

    pub fn present_dates(&self, user_id: i64, start: NaiveDate, end: NaiveDate) -> HashSet<NaiveDate> {
        self.present_by_user
            .get(&user_id)
            .map(|set| {
                set.iter()
                    .copied()
                    .filter(|d| *d >= start && *d <= end && self.is_working_day(user_id, *d))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn approved_leave_dates(
        &self,
        user_id: i64,
        start: NaiveDate,
        end: NaiveDate,
    ) -> HashSet<NaiveDate> {
        self.approved_leave_by_user
            .get(&user_id)
            .map(|set| {
                set.iter()
                    .copied()
                    .filter(|d| *d >= start && *d <= end && self.is_working_day(user_id, *d))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn paid_holiday_dates(&self, user_id: i64, start: NaiveDate, end: NaiveDate) -> HashSet<NaiveDate> {
        self.holidays
            .iter()
            .copied()
            .filter(|d| *d >= start && *d <= end && self.is_working_day(user_id, *d))
            .collect()
    }

    pub fn total_lop_days(&self, user_id: i64) -> f64 {
        let (active_start, active_end) = self.active_range(user_id);
        if active_end < active_start {
            return 0.0;
        }
        let present = self.present_dates(user_id, active_start, active_end);
        let open = self
            .open_clock_in_by_user
            .get(&user_id)
            .cloned()
            .unwrap_or_default();
        let holidays = self.paid_holiday_dates(user_id, active_start, active_end);
        let leave_lop = self
            .leave_lop_by_user
            .get(&user_id)
            .cloned()
            .unwrap_or_default();
        let approved = self.approved_leave_dates(user_id, active_start, active_end);
        let today = chrono::Utc::now().date_naive();

        let mut total = 0.0;
        let mut d = active_start;
        while d <= active_end {
            if self.is_working_day(user_id, d) {
                if holidays.contains(&d) {
                } else if let Some(w) = leave_lop.get(&d) {
                    total += w;
                } else if present.contains(&d) {
                } else if open.contains(&d) && d == today {
                } else if approved.contains(&d) {
                } else {
                    total += 1.0;
                }
            }
            d += chrono::Duration::days(1);
        }
        total
    }
}

fn load_holidays(
    conn: &crate::db::Connection,
    org_id: i64,
    start_s: &str,
    end_s: &str,
    month_start: NaiveDate,
    month_end: NaiveDate,
) -> HashSet<NaiveDate> {
    conn.prepare(
        "SELECT date FROM holidays WHERE organization_id = ?3 AND date >= ?1 AND date <= ?2",
    )
    .map(|stmt| {
        stmt.query_map(crate::params![start_s, end_s, org_id], |row| row.get_idx::<String>(0))
            .into_iter()
            .filter_map(|d| NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok())
            .filter(|d| *d >= month_start && *d <= month_end)
            .collect()
    })
    .unwrap_or_default()
}

fn load_attendance(
    conn: &crate::db::Connection,
    user_ids: &[i64],
    start_s: &str,
    end_s: &str,
) -> (HashMap<i64, HashSet<NaiveDate>>, HashMap<i64, HashSet<NaiveDate>>) {
    let mut present: HashMap<i64, HashSet<NaiveDate>> = HashMap::new();
    let mut open: HashMap<i64, HashSet<NaiveDate>> = HashMap::new();
    if user_ids.is_empty() {
        return (present, open);
    }
    let ph: String = user_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT user_id, date, clock_out FROM attendance
         WHERE deleted_at IS NULL AND date >= ? AND date <= ? AND user_id IN ({ph})"
    );
    let mut params: Vec<crate::db::ParamValue> = vec![
        crate::db::into_param_value(start_s.to_string()),
        crate::db::into_param_value(end_s.to_string()),
    ];
    for uid in user_ids {
        params.push(crate::db::into_param_value(*uid));
    }
    if let Ok(stmt) = conn.prepare(&sql) {
        let rows: Vec<(i64, String, Option<String>)> = stmt.query_map(&params, |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<Option<String>>(2)?,
            ))
        });
        for (uid, date_s, clock_out) in rows {
            if let Ok(d) = NaiveDate::parse_from_str(&date_s.chars().take(10).collect::<String>(), "%Y-%m-%d")
            {
                if clock_out.as_ref().is_some_and(|c| !c.is_empty()) {
                    present.entry(uid).or_default().insert(d);
                } else {
                    open.entry(uid).or_default().insert(d);
                }
            }
        }
    }
    (present, open)
}

fn load_leave(
    conn: &crate::db::Connection,
    user_ids: &[i64],
    start_s: &str,
    end_s: &str,
    range_start: NaiveDate,
    range_end: NaiveDate,
) -> (
    HashMap<i64, HashSet<NaiveDate>>,
    HashMap<i64, HashMap<NaiveDate, f64>>,
) {
    let mut approved: HashMap<i64, HashSet<NaiveDate>> = HashMap::new();
    let mut lop: HashMap<i64, HashMap<NaiveDate, f64>> = HashMap::new();
    if user_ids.is_empty() {
        return (approved, lop);
    }
    let ph: String = user_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT user_id, start_date, end_date, leave_type, status FROM leave_requests
         WHERE deleted_at IS NULL AND user_id IN ({ph})
           AND start_date <= ? AND end_date >= ?"
    );
    let mut params: Vec<crate::db::ParamValue> = Vec::new();
    for uid in user_ids {
        params.push(crate::db::into_param_value(*uid));
    }
    params.push(crate::db::into_param_value(end_s.to_string()));
    params.push(crate::db::into_param_value(start_s.to_string()));

    if let Ok(stmt) = conn.prepare(&sql) {
        let rows: Vec<(i64, String, String, String, String)> = stmt.query_map(&params, |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<String>(2)?,
                row.get_idx::<String>(3)?,
                row.get_idx::<String>(4)?,
            ))
        });
        for (uid, start, end, leave_type, status) in rows {
            let Ok(ls) = NaiveDate::parse_from_str(&start.chars().take(10).collect::<String>(), "%Y-%m-%d")
            else {
                continue;
            };
            let Ok(le) = NaiveDate::parse_from_str(&end.chars().take(10).collect::<String>(), "%Y-%m-%d")
            else {
                continue;
            };
            let eff_start = ls.max(range_start);
            let eff_end = le.min(range_end);
            let mut d = eff_start;
            while d <= eff_end {
                if status == "approved" {
                    approved.entry(uid).or_default().insert(d);
                    let weight =
                        crate::leave_type_logic::lop_factor_for_user_slug(conn, uid, leave_type.as_str());
                    if weight > 0.0 {
                        lop.entry(uid)
                            .or_default()
                            .entry(d)
                            .and_modify(|w| *w = w.max(weight))
                            .or_insert(weight);
                    }
                }
                d += chrono::Duration::days(1);
            }
        }
    }
    (approved, lop)
}

fn load_active_ranges(
    conn: &crate::db::Connection,
    user_ids: &[i64],
    month: i32,
    year: i32,
) -> HashMap<i64, (NaiveDate, NaiveDate)> {
    let mut out = HashMap::new();
    for &uid in user_ids {
        out.insert(uid, crate::payroll_logic::user_active_range_in_month(conn, uid, month, year));
    }
    out
}

fn load_roster(
    conn: &crate::db::Connection,
    user_ids: &[i64],
    start_s: &str,
    end_s: &str,
    range_start: NaiveDate,
    range_end: NaiveDate,
) -> (HashSet<(i64, NaiveDate)>, HashSet<(i64, NaiveDate)>) {
    let mut off = HashSet::new();
    let mut has_shift = HashSet::new();
    if user_ids.is_empty() {
        return (off, has_shift);
    }
    let ph: String = user_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT user_id, roster_date, is_day_off, shift_template_id FROM shift_daily_roster
         WHERE user_id IN ({ph}) AND roster_date >= ? AND roster_date <= ?"
    );
    let mut params: Vec<crate::db::ParamValue> = Vec::new();
    for uid in user_ids {
        params.push(crate::db::into_param_value(*uid));
    }
    params.push(crate::db::into_param_value(start_s.to_string()));
    params.push(crate::db::into_param_value(end_s.to_string()));
    if let Ok(stmt) = conn.prepare(&sql) {
        let rows: Vec<(i64, String, i64, Option<i64>)> = stmt.query_map(&params, |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<i64>(2)?,
                row.get_idx::<Option<i64>>(3)?,
            ))
        });
        for (uid, date_s, is_off, shift_id) in rows {
            if let Ok(d) = NaiveDate::parse_from_str(&date_s.chars().take(10).collect::<String>(), "%Y-%m-%d")
            {
                if d < range_start || d > range_end {
                    continue;
                }
                if is_off != 0 {
                    off.insert((uid, d));
                } else if let Some(sid) = shift_id {
                    let mask: i64 = conn
                        .query_row(
                            "SELECT COALESCE(working_days_mask, 31) FROM shift_templates WHERE id = ?1",
                            [sid],
                            |row| row.get_idx::<i64>(0),
                        )
                        .unwrap_or(31);
                    if is_working_day(normalize_working_days_mask(mask), d) {
                        has_shift.insert((uid, d));
                    }
                }
            }
        }
    }
    (off, has_shift)
}

fn load_shift_masks_by_date(
    conn: &crate::db::Connection,
    user_ids: &[i64],
    range_start: NaiveDate,
    range_end: NaiveDate,
) -> HashMap<(i64, NaiveDate), u8> {
    let mut out = HashMap::new();
    for &uid in user_ids {
        let mut d = range_start;
        while d <= range_end {
            let date_s = d.format("%Y-%m-%d").to_string();
            let mask: i64 = conn
                .query_row(
                    "SELECT COALESCE(st.working_days_mask, 31) FROM user_shift_assignments usa
                     JOIN shift_templates st ON st.id = usa.shift_template_id
                     WHERE usa.user_id = ?1 AND usa.effective_from <= ?2
                     ORDER BY usa.effective_from DESC LIMIT 1",
                    crate::params![uid, &date_s],
                    |row| row.get_idx::<i64>(0),
                )
                .unwrap_or(31);
            out.insert((uid, d), normalize_working_days_mask(mask));
            d += chrono::Duration::days(1);
        }
    }
    out
}
