//! Variable pay, reimbursements, payroll hold, pay groups helpers.

pub fn sum_variable_pay(
    conn: &crate::db::Connection,
    user_id: i64,
    org_id: i64,
    month: i32,
    year: i32,
) -> (f64, Vec<serde_json::Value>) {
    let stmt = match conn.prepare(
        "SELECT id, item_type, label, amount FROM payroll_variable_items
         WHERE user_id = ?1 AND organization_id = ?2 AND month = ?3 AND year = ?4
           AND status = 'approved'",
    ) {
        Ok(s) => s,
        Err(_) => return (0.0, vec![]),
    };
    let rows: Vec<(i64, String, String, f64)> = stmt
        .query_map(crate::params![user_id, org_id, month, year], |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<String>(2)?,
                row.get_idx::<f64>(3)?,
            ))
        });
    let mut total = 0.0;
    let mut items = Vec::new();
    for (id, item_type, label, amount) in rows {
        total += amount;
        items.push(serde_json::json!({
            "id": id,
            "item_type": item_type,
            "label": label,
            "amount": amount,
        }));
    }
    (crate::salary_split::round2(total), items)
}

pub fn sum_approved_reimbursements(
    conn: &crate::db::Connection,
    user_id: i64,
    org_id: i64,
    month: i32,
    year: i32,
) -> f64 {
    conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM reimbursement_claims
         WHERE user_id = ?1 AND organization_id = ?2 AND status = 'approved'
           AND ((payroll_month = ?3 AND payroll_year = ?4)
                OR (claim_month = ?3 AND claim_year = ?4 AND payroll_month IS NULL))",
        crate::params![user_id, org_id, month, year],
        |r| r.get_idx::<f64>(0),
    )
    .unwrap_or(0.0)
}

pub fn is_payroll_hold(conn: &crate::db::Connection, user_id: i64) -> (bool, Option<String>) {
    let row: Option<(i64, Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT payroll_hold, payroll_hold_reason, payroll_hold_until FROM users WHERE id = ?1",
            [user_id],
            |r| {
                Ok((
                    r.get_idx::<i64>(0)?,
                    r.get_idx::<Option<String>>(1)?,
                    r.get_idx::<Option<String>>(2)?,
                ))
            },
        )
        .ok();
    let Some((hold, reason, until)) = row else {
        return (false, None);
    };
    if hold == 0 {
        return (false, None);
    }
    if let Some(ref u) = until {
        if let Ok(d) = chrono::NaiveDate::parse_from_str(u, "%Y-%m-%d") {
            let today = chrono::Utc::now().date_naive();
            if today > d {
                return (false, None);
            }
        }
    }
    (true, reason)
}

pub fn payroll_require_approval(conn: &crate::db::Connection, org_id: i64) -> bool {
    conn.query_row(
        "SELECT value FROM app_settings WHERE organization_id = ?1 AND key = 'payroll_require_approval'",
        [org_id],
        |r| r.get_idx::<String>(0),
    )
    .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
    .unwrap_or(false)
}

pub fn run_status_allows_generate(status: &str) -> bool {
    matches!(status, "approved" | "draft" | "released")
}
