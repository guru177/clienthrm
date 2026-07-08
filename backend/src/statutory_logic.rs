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
    default_advance_recovery(&list_active_advances(conn, user_id))
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct EmployeeAdvance {
    pub id: i64,
    pub amount: f64,
    pub balance: f64,
    pub monthly_emi: f64,
    pub description: Option<String>,
}

pub fn list_active_advances(conn: &Connection, user_id: i64) -> Vec<EmployeeAdvance> {
    let stmt = match conn.prepare(
        "SELECT id, amount, balance, monthly_emi, description
         FROM employee_advances
         WHERE user_id = ?1 AND is_active = 1 AND balance > 0
         ORDER BY id ASC",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map([user_id], |row| {
        Ok(EmployeeAdvance {
            id: row.get_idx::<i64>(0)?,
            amount: row.get_idx::<f64>(1)?,
            balance: row.get_idx::<f64>(2)?,
            monthly_emi: row.get_idx::<f64>(3)?,
            description: row.get_idx::<Option<String>>(4)?,
        })
    })
}

pub fn default_advance_allocations(advances: &[EmployeeAdvance]) -> Vec<AdvanceAllocation> {
    advances
        .iter()
        .map(|a| AdvanceAllocation {
            advance_id: a.id,
            amount: crate::salary_split::round2(a.monthly_emi.min(a.balance)),
        })
        .filter(|a| a.amount > 0.0)
        .collect()
}

pub fn default_advance_recovery(advances: &[EmployeeAdvance]) -> f64 {
    crate::salary_split::round2(
        default_advance_allocations(advances)
            .iter()
            .map(|a| a.amount)
            .sum(),
    )
}

pub fn validate_advance_allocations(
    advances: &[EmployeeAdvance],
    allocations: &[AdvanceAllocation],
) -> Result<Vec<AdvanceAllocation>, String> {
    let mut validated = Vec::new();
    for alloc in allocations {
        if alloc.amount < 0.0 {
            return Err("Advance recovery amount cannot be negative".into());
        }
        if alloc.amount == 0.0 {
            continue;
        }
        let Some(advance) = advances.iter().find(|a| a.id == alloc.advance_id) else {
            return Err(format!("Unknown advance id {}", alloc.advance_id));
        };
        if alloc.amount > advance.balance + 0.01 {
            return Err(format!(
                "Recovery amount {:.2} exceeds balance {:.2} for advance {}",
                alloc.amount, advance.balance, alloc.advance_id
            ));
        }
        validated.push(AdvanceAllocation {
            advance_id: alloc.advance_id,
            amount: crate::salary_split::round2(alloc.amount),
        });
    }
    Ok(validated)
}

pub fn sum_advance_allocations(allocations: &[AdvanceAllocation]) -> f64 {
    crate::salary_split::round2(allocations.iter().map(|a| a.amount).sum())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AdvanceAllocation {
    pub advance_id: i64,
    pub amount: f64,
}

/// Deduct per-advance amounts on payslip generation.
/// When `allocations` is provided, deducts exactly those amounts (after validation).
/// Otherwise deducts `min(monthly_emi, balance)` per active advance (FIFO by id).
pub fn deduct_advances_for_payslip(
    conn: &Connection,
    user_id: i64,
    now: &str,
    allocations: Option<&[AdvanceAllocation]>,
) -> Result<(f64, Vec<AdvanceAllocation>), String> {
    if let Some(allocs) = allocations {
        if allocs.is_empty() {
            return Ok((0.0, Vec::new()));
        }
        let advances = list_active_advances(conn, user_id);
        let validated = validate_advance_allocations(&advances, allocs)?;
        let mut total = 0.0;
        let mut applied = Vec::new();
        for alloc in validated {
            let balance: f64 = conn
                .query_row(
                    "SELECT balance FROM employee_advances
                     WHERE id = ?1 AND user_id = ?2 AND is_active = 1",
                    crate::params![alloc.advance_id, user_id],
                    |r| r.get_idx::<f64>(0),
                )
                .map_err(|e| e.to_string())?;
            if alloc.amount > balance + 0.01 {
                return Err(format!(
                    "Advance {} balance changed; recovery {:.2} exceeds {:.2}",
                    alloc.advance_id, alloc.amount, balance
                ));
            }
            let new_balance = balance - alloc.amount;
            let is_active = if new_balance > 0.0 { 1 } else { 0 };
            conn.execute(
                "UPDATE employee_advances SET balance = ?1, is_active = ?2, updated_at = ?3 WHERE id = ?4",
                crate::params![new_balance, is_active, now, alloc.advance_id],
            )
            .map_err(|e| e.to_string())?;
            total += alloc.amount;
            applied.push(alloc);
        }
        return Ok((crate::salary_split::round2(total), applied));
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_advances() -> Vec<EmployeeAdvance> {
        vec![
            EmployeeAdvance {
                id: 1,
                amount: 10_000.0,
                balance: 6_000.0,
                monthly_emi: 2_000.0,
                description: Some("Festival".into()),
            },
            EmployeeAdvance {
                id: 2,
                amount: 5_000.0,
                balance: 1_500.0,
                monthly_emi: 2_000.0,
                description: None,
            },
        ]
    }

    #[test]
    fn default_advance_allocations_caps_by_balance() {
        let allocs = default_advance_allocations(&sample_advances());
        assert_eq!(allocs.len(), 2);
        assert_eq!(allocs[0].amount, 2_000.0);
        assert_eq!(allocs[1].amount, 1_500.0);
        assert_eq!(default_advance_recovery(&sample_advances()), 3_500.0);
    }

    #[test]
    fn validate_advance_allocations_rejects_over_balance() {
        let advances = sample_advances();
        let bad = vec![AdvanceAllocation {
            advance_id: 2,
            amount: 2_000.0,
        }];
        assert!(validate_advance_allocations(&advances, &bad).is_err());
    }

    #[test]
    fn validate_advance_allocations_allows_partial() {
        let advances = sample_advances();
        let ok = vec![
            AdvanceAllocation {
                advance_id: 1,
                amount: 500.0,
            },
            AdvanceAllocation {
                advance_id: 2,
                amount: 0.0,
            },
        ];
        let validated = validate_advance_allocations(&advances, &ok).unwrap();
        assert_eq!(validated.len(), 1);
        assert_eq!(validated[0].amount, 500.0);
    }

    #[test]
    fn parse_advance_allocations_from_adjustments_object() {
        let json = r#"{"items":[],"advance_allocations":[{"advance_id":1,"amount":500}]}"#;
        let parsed = parse_advance_allocations(json);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].advance_id, 1);
        assert_eq!(parsed[0].amount, 500.0);
    }
}
