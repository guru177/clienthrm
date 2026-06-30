use chrono::{DateTime, Duration, Months, NaiveDateTime, Utc};
use crate::db::Connection;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct SubscriptionStatus {
    pub plan_started_at: Option<String>,
    pub plan_expires_at: Option<String>,
    pub billing_period: String,
    pub days_remaining: Option<i64>,
    pub subscription_expired: bool,
}

/// Parse billing period text into an expiry datetime from `started`.
/// Returns `None` for open-ended plans (`custom`, `lifetime`, unparseable).
pub fn compute_expires_at(billing_period: &str, started: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let period = billing_period.trim().to_lowercase();
    if period.is_empty() || period == "custom" || period == "lifetime" {
        return None;
    }

    if let Some((amount, unit)) = parse_period_parts(&period) {
        return Some(add_period(started, amount, unit));
    }

    None
}

#[derive(Clone, Copy)]
enum PeriodUnit {
    Day,
    Week,
    Month,
    Year,
}

fn parse_period_parts(period: &str) -> Option<(i64, PeriodUnit)> {
    match period {
        "day" | "daily" => Some((1, PeriodUnit::Day)),
        "week" | "weekly" => Some((1, PeriodUnit::Week)),
        "month" | "monthly" => Some((1, PeriodUnit::Month)),
        "year" | "yearly" | "annual" => Some((1, PeriodUnit::Year)),
        _ => {
            let parts: Vec<&str> = period.split_whitespace().collect();
            if parts.len() < 2 {
                return None;
            }
            let amount = parts[0].parse::<i64>().ok()?;
            if amount <= 0 {
                return None;
            }
            let unit = parts[1].trim_end_matches('s');
            let parsed = match unit {
                "day" => PeriodUnit::Day,
                "week" => PeriodUnit::Week,
                "month" => PeriodUnit::Month,
                "year" => PeriodUnit::Year,
                _ => return None,
            };
            Some((amount, parsed))
        }
    }
}

fn add_period(start: DateTime<Utc>, amount: i64, unit: PeriodUnit) -> DateTime<Utc> {
    match unit {
        PeriodUnit::Day => start + Duration::days(amount),
        PeriodUnit::Week => start + Duration::weeks(amount),
        PeriodUnit::Month => start + Months::new(amount as u32),
        PeriodUnit::Year => start + Months::new((amount as u32).saturating_mul(12)),
    }
}

pub fn parse_datetime(value: &str) -> Option<DateTime<Utc>> {
    NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S")
        .ok()
        .map(|naive| DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc))
}

pub fn is_expired(expires_at: Option<&str>) -> bool {
    let Some(raw) = expires_at else {
        return false;
    };
    let Some(expires) = parse_datetime(raw) else {
        return false;
    };
    Utc::now() > expires
}

pub fn days_remaining(expires_at: Option<&str>) -> Option<i64> {
    let raw = expires_at?;
    let expires = parse_datetime(raw)?;
    let diff = expires - Utc::now();
    Some(diff.num_days().max(0))
}

pub fn billing_period_for_plan(conn: &Connection, plan_slug: &str) -> String {
    conn.query_row(
        "SELECT billing_period FROM subscription_plans WHERE lower(slug) = lower(?1)",
        [plan_slug],
        |row| row.get_idx::<String>(0),
    )
    .unwrap_or_else(|_| "month".to_string())
}

/// Set subscription window for an organization based on plan billing period (fresh period from now).
pub fn assign_org_subscription(
    conn: &Connection,
    org_id: i64,
    plan_slug: &str,
) -> crate::db::Result<()> {
    let billing_period = billing_period_for_plan(conn, plan_slug);
    let now = Utc::now();
    let started = now.format("%Y-%m-%d %H:%M:%S").to_string();
    let expires = compute_expires_at(&billing_period, now)
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());

    conn.execute(
        "UPDATE organizations SET plan_started_at = ?1, plan_expires_at = ?2, updated_at = ?1 WHERE id = ?3",
        crate::params![started, expires, org_id],
    )?;
    Ok(())
}

/// Extend the current subscription by one billing period from the existing expiry (or from now if expired).
pub fn renew_org_subscription(
    conn: &Connection,
    org_id: i64,
    plan_slug: &str,
) -> crate::db::Result<()> {
    let billing_period = billing_period_for_plan(conn, plan_slug);
    let now = Utc::now();
    let now_str = now.format("%Y-%m-%d %H:%M:%S").to_string();

    let current_expires: Option<String> = conn
        .query_row(
            "SELECT plan_expires_at FROM organizations WHERE id = ?1",
            [org_id],
            |row| row.get_idx::<Option<String>>(0),
        )
        .unwrap_or(None);

    let base = match current_expires.as_deref().and_then(parse_datetime) {
        Some(expires) if expires > now => expires,
        _ => now,
    };

    let new_expires = compute_expires_at(&billing_period, base)
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());

    conn.execute(
        "UPDATE organizations SET plan_expires_at = ?1, updated_at = ?2 WHERE id = ?3",
        crate::params![new_expires, &now_str, org_id],
    )?;
    Ok(())
}

/// Add N calendar days to the current expiry (or from now if expired/missing).
pub fn extend_org_subscription_days(
    conn: &Connection,
    org_id: i64,
    days: i64,
) -> crate::db::Result<()> {
    let now = Utc::now();
    let now_str = now.format("%Y-%m-%d %H:%M:%S").to_string();

    let current_expires: Option<String> = conn
        .query_row(
            "SELECT plan_expires_at FROM organizations WHERE id = ?1",
            [org_id],
            |row| row.get_idx::<Option<String>>(0),
        )
        .unwrap_or(None);

    let base = match current_expires.as_deref().and_then(parse_datetime) {
        Some(expires) if expires > now => expires,
        _ => now,
    };

    let new_expires = (base + Duration::days(days)).format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE organizations SET plan_expires_at = ?1, updated_at = ?2 WHERE id = ?3",
        crate::params![&new_expires, &now_str, org_id],
    )?;
    Ok(())
}

pub fn load_subscription_status(
    conn: &Connection,
    org_id: i64,
    plan_slug: &str,
) -> SubscriptionStatus {
    let (started, expires): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT plan_started_at, plan_expires_at FROM organizations WHERE id = ?1",
            [org_id],
            |row| Ok((row.get_idx::<Option<String>>(0)?, row.get_idx::<Option<String>>(1)?)),
        )
        .unwrap_or((None, None));

    let billing_period = billing_period_for_plan(conn, plan_slug);
    let subscription_expired = is_expired(expires.as_deref());
    let days_remaining = days_remaining(expires.as_deref());

    SubscriptionStatus {
        plan_started_at: started,
        plan_expires_at: expires,
        billing_period,
        days_remaining,
        subscription_expired,
    }
}

pub fn ensure_org_active(conn: &Connection, org_id: i64) -> Result<(), String> {
    let status: String = conn
        .query_row(
            "SELECT status FROM organizations WHERE id = ?1 AND status != 'deleted'",
            [org_id],
            |row| row.get_idx::<String>(0),
        )
        .map_err(|_| "Organization not found".to_string())?;
    if status == "suspended" {
        return Err(
            "Organization account is suspended. Contact your platform admin.".to_string(),
        );
    }
    Ok(())
}

pub fn ensure_org_subscription_enforced(conn: &Connection, org_id: i64) -> Result<(), String> {
    ensure_org_active(conn, org_id)?;
    let (plan, expires): (String, Option<String>) = conn
        .query_row(
            "SELECT plan, plan_expires_at FROM organizations WHERE id = ?1 AND status != 'deleted'",
            [org_id],
            |row| Ok((row.get_idx::<String>(0)?, row.get_idx::<Option<String>>(1)?)),
        )
        .map_err(|_| "Organization not found".to_string())?;

    if is_expired(expires.as_deref()) {
        let billing = billing_period_for_plan(conn, &plan);
        return Err(format!(
            "Subscription expired. Your \"{}\" plan ({}) has ended. Contact your platform admin to renew.",
            plan, billing
        ));
    }
    Ok(())
}

pub fn backfill_org_subscriptions(conn: &Connection) {
    let stmt = match conn.prepare(
        "SELECT id, plan, created_at FROM organizations WHERE status != 'deleted' AND plan_started_at IS NULL",
    ) {
        Ok(s) => s,
        Err(_) => return,
    };

    let rows: Vec<(i64, String, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((row.get_idx::<i64>(0)?, row.get_idx::<String>(1)?, row.get_idx::<Option<String>>(2)?))
        });

    for (org_id, plan, created_at) in rows {
        let billing = billing_period_for_plan(conn, &plan);
        let start_raw = created_at.unwrap_or_else(|| {
            Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
        });
        let started = parse_datetime(&start_raw).unwrap_or_else(Utc::now);
        let expires = compute_expires_at(&billing, started)
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());

        let _ = conn.execute(
            "UPDATE organizations SET plan_started_at = ?1, plan_expires_at = ?2 WHERE id = ?3",
            crate::params![start_raw, expires, org_id],
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Datelike, TimeZone};

    #[test]
    fn parses_day_and_month_periods() {
        let start = Utc.with_ymd_and_hms(2026, 6, 1, 10, 0, 0).unwrap();
        let end = compute_expires_at("14 days", start).unwrap();
        assert_eq!((end - start).num_days(), 14);

        let end = compute_expires_at("month", start).unwrap();
        assert_eq!(end.month(), 7);
    }

    #[test]
    fn renew_extends_from_current_expiry() {
        let start = Utc.with_ymd_and_hms(2026, 6, 1, 10, 0, 0).unwrap();
        let current_expires = compute_expires_at("14 days", start).unwrap();
        let renewed = compute_expires_at("14 days", current_expires).unwrap();
        assert_eq!((renewed - start).num_days(), 28);
    }

    #[test]
    fn custom_plan_has_no_expiry() {
        let start = Utc.with_ymd_and_hms(2026, 6, 1, 10, 0, 0).unwrap();
        assert!(compute_expires_at("custom", start).is_none());
    }
}
