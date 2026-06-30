//! Income tax / TDS computation (India simplified slabs).

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct TaxDeclarations {
    pub section_80c: f64,
    pub section_80d: f64,
    pub other_exemptions: f64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TdsResult {
    pub annual_taxable: f64,
    pub annual_tax: f64,
    pub monthly_tds: f64,
    pub regime: String,
}

pub fn load_declarations(
    conn: &crate::db::Connection,
    user_id: i64,
    financial_year: &str,
) -> (String, TaxDeclarations) {
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT regime, declarations_json FROM employee_tax_declarations
             WHERE user_id = ?1 AND financial_year = ?2",
            crate::params![user_id, financial_year],
            |r| Ok((r.get_idx::<String>(0)?, r.get_idx::<String>(1)?)),
        )
        .ok();
    let Some((regime, json)) = row else {
        return ("new".to_string(), TaxDeclarations::default());
    };
    let decl: TaxDeclarations = serde_json::from_str(&json).unwrap_or_default();
    (regime, decl)
}

pub fn financial_year_for(month: i32, year: i32) -> String {
    if month >= 4 {
        format!("{year}-{}", year + 1)
    } else {
        format!("{}-{year}", year - 1)
    }
}

fn tax_new_regime(annual_income: f64) -> f64 {
    let mut tax = 0.0;
    let slabs: [(f64, f64, f64); 4] = [
        (0.0, 300_000.0, 0.0),
        (300_000.0, 700_000.0, 0.05),
        (700_000.0, 1_000_000.0, 0.10),
        (1_000_000.0, f64::MAX, 0.15),
    ];
    let mut remaining = annual_income;
    for (low, high, rate) in slabs {
        if remaining <= 0.0 {
            break;
        }
        let band = (high - low).min(remaining);
        if annual_income > low {
            let taxable = band.min(annual_income - low);
            tax += taxable * rate;
            remaining -= taxable;
        }
    }
    tax * 1.04 // cess approx
}

fn tax_old_regime(annual_income: f64, decl: &TaxDeclarations, hra_exemption: f64) -> f64 {
    let deductions = decl.section_80c.min(150_000.0)
        + decl.section_80d.min(50_000.0)
        + decl.other_exemptions
        + hra_exemption;
    let taxable = (annual_income - deductions - 50_000.0).max(0.0); // standard deduction
    let mut tax = 0.0;
    let slabs: [(f64, f64, f64); 4] = [
        (0.0, 250_000.0, 0.0),
        (250_000.0, 500_000.0, 0.05),
        (500_000.0, 1_000_000.0, 0.20),
        (1_000_000.0, f64::MAX, 0.30),
    ];
    for (low, high, rate) in slabs {
        if taxable <= low {
            break;
        }
        let band = (high - low).min(taxable - low);
        tax += band * rate;
    }
    tax * 1.04
}

pub fn compute_monthly_tds(
    conn: &crate::db::Connection,
    user_id: i64,
    month: i32,
    year: i32,
    monthly_gross: f64,
    basic_monthly: f64,
) -> TdsResult {
    let fy = financial_year_for(month, year);
    let (regime, decl) = load_declarations(conn, user_id, &fy);

    let hra_rent: f64 = conn
        .query_row(
            "SELECT COALESCE(hra_rent_paid, 0) FROM employee_tax_declarations
             WHERE user_id = ?1 AND financial_year = ?2",
            crate::params![user_id, &fy],
            |r| r.get_idx::<f64>(0),
        )
        .unwrap_or(0.0);
    let hra_exemption = (hra_rent - basic_monthly * 0.1).max(0.0).min(basic_monthly * 0.5);

    let annual_income = monthly_gross * 12.0;
    let annual_tax = if regime == "old" {
        tax_old_regime(annual_income, &decl, hra_exemption)
    } else {
        tax_new_regime(annual_income)
    };
    let monthly_tds = crate::salary_split::round2(annual_tax / 12.0);

    TdsResult {
        annual_taxable: annual_income,
        annual_tax: crate::salary_split::round2(annual_tax),
        monthly_tds,
        regime,
    }
}

pub fn pt_for_state(conn: &crate::db::Connection, state_code: &str, monthly_gross: f64) -> f64 {
    if state_code.is_empty() {
        return 0.0;
    }
    let code = state_code.to_uppercase();
    let row: Option<f64> = conn
        .query_row(
            "SELECT monthly_tax FROM pt_slabs
             WHERE state_code = ?1 AND min_gross <= ?2
               AND (max_gross IS NULL OR max_gross >= ?2)
             ORDER BY min_gross DESC LIMIT 1",
            crate::params![&code, monthly_gross],
            |r| r.get_idx::<f64>(0),
        )
        .ok();
    row.unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn financial_year_april_onwards() {
        assert_eq!(financial_year_for(4, 2026), "2026-2027");
        assert_eq!(financial_year_for(1, 2026), "2025-2026");
    }

    #[test]
    fn new_regime_zero_tax_low_income() {
        let tax = tax_new_regime(250_000.0);
        assert!(tax < 1.0);
    }

    #[test]
    fn new_regime_positive_tax_high_income() {
        let tax = tax_new_regime(1_200_000.0);
        assert!(tax > 10_000.0);
    }
}
