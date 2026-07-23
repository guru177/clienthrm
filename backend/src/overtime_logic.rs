//! Overtime hours and amount from attendance vs shift end times.

use chrono::{NaiveDate, NaiveDateTime, NaiveTime};

#[derive(Debug, Clone, serde::Serialize)]
pub struct OvertimeResult {
    pub hours: f64,
    pub amount: f64,
    pub days_with_ot: i64,
}

fn parse_time(t: &str) -> Option<NaiveTime> {
    NaiveTime::parse_from_str(t, "%H:%M:%S")
        .or_else(|_| NaiveTime::parse_from_str(t, "%H:%M"))
        .ok()
}

fn ot_setting(conn: &crate::db::Connection, org_id: i64, key: &str, default: &str) -> String {
    conn.query_row(
        "SELECT value FROM app_settings WHERE organization_id = ?1 AND key = ?2",
        crate::params![org_id, key],
        |r| r.get_idx::<String>(0),
    )
    .unwrap_or_else(|_| default.to_string())
}

pub fn overtime_for_user_month(
    conn: &crate::db::Connection,
    user_id: i64,
    org_id: i64,
    month: i32,
    year: i32,
    basic_monthly: f64,
    gross_monthly: f64,
    working_days: i64,
) -> OvertimeResult {
    let rate_mult: f64 = ot_setting(conn, org_id, "ot_rate_multiplier", "1.5")
        .parse()
        .unwrap_or(1.5);
    let holiday_mult: f64 = ot_setting(conn, org_id, "ot_holiday_multiplier", "2.0")
        .parse()
        .unwrap_or(2.0);
    let basis = ot_setting(conn, org_id, "ot_basis", "basic");
    let monthly_base = if basis == "gross" { gross_monthly } else { basic_monthly };
    let hourly = if working_days > 0 {
        monthly_base / (working_days as f64 * 8.0)
    } else {
        0.0
    };

    let (start, end) = crate::payroll_logic::month_bounds(month, year);
    let start_s = start.format("%Y-%m-%d").to_string();
    let end_s = end.format("%Y-%m-%d").to_string();

    let stmt = match conn.prepare(
        "SELECT a.date, a.clock_in, a.clock_out FROM attendance a
         WHERE a.user_id = ?1 AND a.date >= ?2 AND a.date <= ?3
           AND a.deleted_at IS NULL AND a.clock_in IS NOT NULL AND a.clock_out IS NOT NULL",
    ) {
        Ok(s) => s,
        Err(_) => {
            return OvertimeResult {
                hours: 0.0,
                amount: 0.0,
                days_with_ot: 0,
            }
        }
    };

    let rows: Vec<(String, String, String)> = stmt
        .query_map(crate::params![user_id, &start_s, &end_s], |row| {
            Ok((
                row.get_idx::<String>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<String>(2)?,
            ))
        });

    let mut total_minutes = 0.0;
    let mut total_amount = 0.0;
    let mut days_with_ot = 0i64;

    for (date_str, clock_in, clock_out) in rows {
        let Ok(d) = NaiveDate::parse_from_str(&date_str, "%Y-%m-%d") else {
            continue;
        };
        let is_holiday: bool = conn
            .query_row(
                "SELECT 1 FROM holidays WHERE organization_id = ?1 AND date = ?2",
                crate::params![org_id, &date_str],
                |_| Ok(()),
            )
            .is_ok();
        let is_working = crate::payroll_logic::is_working_day_for_user(conn, user_id, d);
        // Extra work on week-off or holiday still counts toward OT.
        let is_extra_day = is_holiday || !is_working;

        let Some(ci) = parse_time(&clock_in) else { continue };
        let Some(co) = parse_time(&clock_out) else { continue };

        let ci_dt = NaiveDateTime::new(d, ci);
        let mut co_dt = NaiveDateTime::new(d, co);
        if co_dt < ci_dt {
            co_dt += chrono::Duration::days(1);
        }

        let (ot_mins, mult) = if is_extra_day {
            // Whole worked duration on holiday / week-off is overtime.
            let mins = (co_dt - ci_dt).num_minutes() as f64;
            (mins, holiday_mult)
        } else {
            let Some(shift_end) = shift_end_time_for_user(conn, user_id, &date_str, d) else {
                continue;
            };
            let shift_end_dt = NaiveDateTime::new(d, shift_end);
            if co_dt <= shift_end_dt {
                continue;
            }
            ((co_dt - shift_end_dt).num_minutes() as f64, rate_mult)
        };

        if ot_mins <= 0.0 {
            continue;
        }

        total_minutes += ot_mins;
        total_amount += (ot_mins / 60.0) * hourly * mult;
        days_with_ot += 1;
    }

    let hours = crate::salary_split::round2(total_minutes / 60.0);
    let amount = crate::salary_split::round2(total_amount);

    OvertimeResult {
        hours,
        amount,
        days_with_ot,
    }
}

fn shift_end_time_for_user(
    conn: &crate::db::Connection,
    user_id: i64,
    date: &str,
    _d: NaiveDate,
) -> Option<NaiveTime> {
    if let Some((_off, shift)) = crate::shift_logic::query_daily_roster(conn, user_id, date) {
        if let Some(cfg) = shift {
            return parse_time(&cfg.end_time);
        }
    }
    let cfg = crate::shift_logic::resolve_shift_for_user(conn, user_id, date);
    parse_time(&cfg.end_time).or_else(|| {
        let row: Option<String> = conn
            .query_row(
                "SELECT st.end_time FROM user_shift_assignments usa
                 JOIN shift_templates st ON st.id = usa.shift_template_id
                 WHERE usa.user_id = ?1 AND usa.effective_from <= ?2
                 ORDER BY usa.effective_from DESC LIMIT 1",
                crate::params![user_id, date],
                |r| r.get_idx::<String>(0),
            )
            .ok();
        row.and_then(|t| parse_time(&t))
    })
}
