//! Leave type configuration — paid / unpaid / half-day LOP rules.

use crate::db::Connection;
use std::collections::HashMap;

use crate::tenant::org_id_for_user;

#[derive(Debug, Clone)]
pub struct LeaveTypeConfig {
    pub id: i64,
    pub slug: String,
    pub name: String,
    pub payment_type: String,
    pub counts_toward_quota: bool,
    pub is_active: bool,
}

/// LOP weight for one business day: 0 = paid, 0.5 = half-day, 1.0 = unpaid.
pub fn lop_factor(payment_type: &str) -> f64 {
    match payment_type {
        "unpaid" => 1.0,
        "half_day" => 0.5,
        _ => 0.0,
    }
}

pub fn payment_type_label(payment_type: &str) -> &'static str {
    match payment_type {
        "unpaid" => "Unpaid (LOP)",
        "half_day" => "Half-day (50% LOP)",
        _ => "Paid",
    }
}

pub fn load_all(conn: &Connection, org_id: i64) -> Vec<LeaveTypeConfig> {
    let mut stmt = match conn.prepare(
        "SELECT id, slug, name, payment_type, counts_toward_quota, is_active
         FROM leave_types WHERE organization_id = ?1 ORDER BY name",
    ) {
        Ok(s) => s,
        Err(_) => return default_types(),
    };
    let list: Vec<LeaveTypeConfig> = stmt.query_map([org_id], |row| {
        Ok(LeaveTypeConfig {
            id: row.get_idx::<i64>(0)?,
            slug: row.get_idx::<String>(1)?,
            name: row.get_idx::<String>(2)?,
            payment_type: row.get_idx::<String>(3)?,
            counts_toward_quota: row.get_idx::<i64>(4).unwrap_or(0) != 0,
            is_active: row.get_idx::<i64>(5).unwrap_or(1) != 0,
        })
    });
    if list.is_empty() {
        default_types()
    } else {
        list
    }
}

pub fn load_active(conn: &Connection, org_id: i64) -> Vec<LeaveTypeConfig> {
    load_all(conn, org_id)
        .into_iter()
        .filter(|t| t.is_active)
        .collect()
}

pub fn load_map(conn: &Connection, org_id: i64) -> HashMap<String, LeaveTypeConfig> {
    load_all(conn, org_id)
        .into_iter()
        .map(|t| (t.slug.clone(), t))
        .collect()
}

pub fn config_for_slug(conn: &Connection, org_id: i64, slug: &str) -> Option<LeaveTypeConfig> {
    load_map(conn, org_id)
        .into_iter()
        .find(|(s, _)| s == slug)
        .map(|(_, c)| c)
}

pub fn lop_factor_for_slug(conn: &Connection, org_id: i64, slug: &str) -> f64 {
    config_for_slug(conn, org_id, slug)
        .map(|c| lop_factor(&c.payment_type))
        .unwrap_or_else(|| {
            if slug == "unpaid" {
                1.0
            } else {
                0.0
            }
        })
}

pub fn lop_factor_for_user_slug(conn: &Connection, user_id: i64, slug: &str) -> f64 {
    lop_factor_for_slug(conn, org_id_for_user(conn, user_id), slug)
}

pub fn is_valid_active_slug(conn: &Connection, org_id: i64, slug: &str) -> bool {
    config_for_slug(conn, org_id, slug)
        .map(|c| c.is_active)
        .unwrap_or(false)
}

pub fn counts_toward_quota(conn: &Connection, org_id: i64, slug: &str) -> bool {
    config_for_slug(conn, org_id, slug)
        .map(|c| c.counts_toward_quota)
        .unwrap_or(slug == "annual")
}

pub fn counts_toward_quota_for_user(conn: &Connection, user_id: i64, slug: &str) -> bool {
    counts_toward_quota(conn, org_id_for_user(conn, user_id), slug)
}

pub fn quota_slugs(conn: &Connection, org_id: i64) -> Vec<String> {
    load_all(conn, org_id)
        .into_iter()
        .filter(|t| t.counts_toward_quota && t.is_active)
        .map(|t| t.slug)
        .collect()
}

pub fn quota_slugs_for_user(conn: &Connection, user_id: i64) -> Vec<String> {
    quota_slugs(conn, org_id_for_user(conn, user_id))
}

fn default_types() -> Vec<LeaveTypeConfig> {
    vec![
        LeaveTypeConfig {
            id: 0,
            slug: "sick".into(),
            name: "Sick Leave".into(),
            payment_type: "paid".into(),
            counts_toward_quota: false,
            is_active: true,
        },
        LeaveTypeConfig {
            id: 0,
            slug: "annual".into(),
            name: "Annual Leave".into(),
            payment_type: "paid".into(),
            counts_toward_quota: true,
            is_active: true,
        },
        LeaveTypeConfig {
            id: 0,
            slug: "personal".into(),
            name: "Personal Leave".into(),
            payment_type: "paid".into(),
            counts_toward_quota: false,
            is_active: true,
        },
        LeaveTypeConfig {
            id: 0,
            slug: "unpaid".into(),
            name: "Unpaid Leave".into(),
            payment_type: "unpaid".into(),
            counts_toward_quota: false,
            is_active: true,
        },
        LeaveTypeConfig {
            id: 0,
            slug: "emergency".into(),
            name: "Emergency Leave".into(),
            payment_type: "paid".into(),
            counts_toward_quota: false,
            is_active: true,
        },
    ]
}
