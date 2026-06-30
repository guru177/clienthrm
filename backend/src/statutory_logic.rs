//! PF, ESI, Professional Tax, Labour Welfare calculations.

use crate::db::Connection;

#[derive(Debug, Clone)]
pub struct StatutoryConfig {
    pub pf_wage_ceiling: f64,
    pub pf_employee_rate: f64,
    pub pf_employer_rate: f64,
    pub esi_gross_ceiling: f64,
    pub esi_employee_rate: f64,
    pub esi_employer_rate: f64,
    pub esi_admin_rate: f64,
    pub prof_tax_default: f64,
    pub lw_employee: f64,
    pub lw_employer: f64,
}

impl Default for StatutoryConfig {
    fn default() -> Self {
        Self {
            pf_wage_ceiling: 15_000.0,
            pf_employee_rate: 0.12,
            pf_employer_rate: 0.12,
            esi_gross_ceiling: 21_000.0,
            esi_employee_rate: 0.0075,
            esi_employer_rate: 0.0325,
            esi_admin_rate: 0.0,
            prof_tax_default: 200.0,
            lw_employee: 50.0,
            lw_employer: 50.0,
        }
    }
}

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct StatutoryResult {
    pub epf_wages: f64,
    pub pf_employee: f64,
    pub pf_employer: f64,
    pub esi_wages: f64,
    pub esi_employee: f64,
    pub esi_employer: f64,
    pub esi_admin: f64,
    pub prof_tax: f64,
    pub lw_employee: f64,
    pub lw_employer: f64,
    pub advance: f64,
    pub other_deductions: f64,
    pub total_employee: f64,
    pub total_employer: f64,
}

pub fn load_statutory_config(conn: &Connection, org_id: i64) -> StatutoryConfig {
    let mut cfg = StatutoryConfig::default();
    let keys = [
        ("pf_wage_ceiling", &mut cfg.pf_wage_ceiling),
        ("pf_employee_rate", &mut cfg.pf_employee_rate),
        ("pf_employer_rate", &mut cfg.pf_employer_rate),
        ("esi_gross_ceiling", &mut cfg.esi_gross_ceiling),
        ("esi_employee_rate", &mut cfg.esi_employee_rate),
        ("esi_employer_rate", &mut cfg.esi_employer_rate),
        ("esi_admin_rate", &mut cfg.esi_admin_rate),
        ("prof_tax_default", &mut cfg.prof_tax_default),
        ("lw_employee", &mut cfg.lw_employee),
        ("lw_employer", &mut cfg.lw_employer),
    ];
    for (key, slot) in keys {
        if let Ok(v) = conn.query_row(
            "SELECT value FROM app_settings WHERE organization_id = ?1 AND key = ?2",
            crate::params![org_id, key],
            |r| r.get_idx::<String>(0),
        ) {
            if let Ok(parsed) = v.parse::<f64>() {
                *slot = parsed;
            }
        }
    }
    cfg
}

pub fn advance_emi_for_month(conn: &Connection, user_id: i64) -> f64 {
    conn.query_row(
        "SELECT COALESCE(SUM(monthly_emi), 0) FROM employee_advances
         WHERE user_id=?1 AND is_active=1 AND balance > 0",
        [user_id],
        |r| r.get_idx::<f64>(0),
    )
    .unwrap_or(0.0)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AdvanceAllocation {
    pub advance_id: i64,
    pub amount: f64,
}

/// Deduct EMI per advance row (not aggregate applied to every row).
pub fn deduct_advances_for_payslip(
    conn: &Connection,
    user_id: i64,
    now: &str,
) -> Result<(f64, Vec<AdvanceAllocation>), String> {
    let stmt = conn
        .prepare(
            "SELECT id, monthly_emi, balance FROM employee_advances
             WHERE user_id = ?1 AND is_active = 1 AND balance > 0
             ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<(i64, f64, f64)> = stmt.query_map([user_id], |row| {
        Ok((
            row.get_idx::<i64>(0)?,
            row.get_idx::<f64>(1)?,
            row.get_idx::<f64>(2)?,
        ))
    });

    let mut total = 0.0;
    let mut allocations = Vec::new();

    for (advance_id, emi, balance) in rows {
        let deduct = emi.min(balance);
        if deduct <= 0.0 {
            continue;
        }
        let new_balance = balance - deduct;
        let is_active = if new_balance > 0.0 { 1 } else { 0 };
        conn.execute(
            "UPDATE employee_advances SET balance = ?1, is_active = ?2, updated_at = ?3 WHERE id = ?4",
            crate::params![new_balance, is_active, now, advance_id],
        )
        .map_err(|e| e.to_string())?;
        total += deduct;
        allocations.push(AdvanceAllocation {
            advance_id,
            amount: deduct,
        });
    }

    Ok((total, allocations))
}

pub fn parse_advance_allocations(adjustments_json: &str) -> Vec<AdvanceAllocation> {
    let Ok(val) = serde_json::from_str::<serde_json::Value>(adjustments_json) else {
        return Vec::new();
    };
    val.get("advance_allocations")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    Some(AdvanceAllocation {
                        advance_id: item.get("advance_id")?.as_i64()?,
                        amount: item.get("amount")?.as_f64()?,
                    })
                })
                .filter(|a| a.amount > 0.0)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

pub fn merge_advance_allocations(adjustments_json: &str, allocations: &[AdvanceAllocation]) -> String {
    let mut val: serde_json::Value = serde_json::from_str(adjustments_json)
        .unwrap_or_else(|_| serde_json::json!([]));
    if val.is_array() {
        val = serde_json::json!({ "items": val });
    }
    if let Some(obj) = val.as_object_mut() {
        obj.insert(
            "advance_allocations".to_string(),
            serde_json::to_value(allocations).unwrap_or(serde_json::json!([])),
        );
    }
    val.to_string()
}

/// Restore advance balances from stored per-row allocations.
pub fn restore_advances_for_payslip(
    conn: &Connection,
    adjustments_json: &str,
    fallback_total: f64,
    user_id: i64,
    now: &str,
) -> Result<(), String> {
    let allocations = parse_advance_allocations(adjustments_json);
    if !allocations.is_empty() {
        for alloc in allocations {
            conn.execute(
                "UPDATE employee_advances SET balance = balance + ?1, is_active = 1, updated_at = ?2
                 WHERE id = ?3 AND user_id = ?4",
                crate::params![alloc.amount, now, alloc.advance_id, user_id],
            )
            .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    if fallback_total <= 0.0 {
        return Ok(());
    }

    // Legacy payslips without allocation metadata: restore proportionally by EMI share.
    let stmt = conn
        .prepare(
            "SELECT id, monthly_emi FROM employee_advances
             WHERE user_id = ?1 ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, f64)> = stmt.query_map([user_id], |row| {
        Ok((row.get_idx::<i64>(0)?, row.get_idx::<f64>(1)?))
    });
    let emi_sum: f64 = rows.iter().map(|(_, emi)| *emi).sum();
    if emi_sum <= 0.0 {
        if let Some((id, _)) = rows.first() {
            conn.execute(
                "UPDATE employee_advances SET balance = balance + ?1, is_active = 1, updated_at = ?2
                 WHERE id = ?3",
                crate::params![fallback_total, now, id],
            )
            .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    let mut remaining = fallback_total;
    for (i, (advance_id, emi)) in rows.iter().enumerate() {
        let share = if i + 1 == rows.len() {
            remaining
        } else {
            crate::salary_split::round2(fallback_total * (*emi / emi_sum))
        };
        remaining = (remaining - share).max(0.0);
        if share <= 0.0 {
            continue;
        }
        conn.execute(
            "UPDATE employee_advances SET balance = balance + ?1, is_active = 1, updated_at = ?2
             WHERE id = ?3",
            crate::params![share, now, advance_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
