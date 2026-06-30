//! Retroactive salary revision arrears.

#[derive(Debug, Clone, serde::Serialize)]
pub struct ArrearsResult {
    pub amount: f64,
    pub months: Vec<ArrearsMonthLine>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ArrearsMonthLine {
    pub month: i32,
    pub year: i32,
    pub delta: f64,
    pub note: String,
}

/// Compare current effective salary vs gross on already-generated payslips in past 12 months.
pub fn arrears_for_user(
    conn: &crate::db::Connection,
    user_id: i64,
    org_id: i64,
    as_of_month: i32,
    as_of_year: i32,
) -> ArrearsResult {
    let cal_days = crate::payroll_logic::calendar_days_in_month(as_of_month, as_of_year);
    let month_end = format!("{}-{:02}-{}", as_of_year, as_of_month, cal_days);
    let Some(current) = crate::salary_logic::load_user_salary(conn, user_id, &month_end) else {
        return ArrearsResult {
            amount: 0.0,
            months: vec![],
        };
    };
    let current_gross = current.gross;

    let stmt = match conn.prepare(
        "SELECT p.month, p.year, p.gross_salary FROM payslips p
         INNER JOIN users u ON u.id = p.user_id AND u.organization_id = ?1
         WHERE p.user_id = ?2 AND p.status = 'generated'
           AND (p.year < ?3 OR (p.year = ?3 AND p.month < ?4))
         ORDER BY p.year DESC, p.month DESC LIMIT 12",
    ) {
        Ok(s) => s,
        Err(_) => {
            return ArrearsResult {
                amount: 0.0,
                months: vec![],
            }
        }
    };

    let rows: Vec<(i32, i32, f64)> = stmt
        .query_map(crate::params![org_id, user_id, as_of_year, as_of_month], |row| {
            Ok((
                row.get_idx::<i32>(0)?,
                row.get_idx::<i32>(1)?,
                row.get_idx::<f64>(2)?,
            ))
        });

    let mut months = Vec::new();
    let mut total = 0.0;
    for (m, y, old_gross) in rows {
        let delta = crate::salary_split::round2((current_gross - old_gross).max(0.0));
        if delta > 0.0 {
            total += delta;
            months.push(ArrearsMonthLine {
                month: m,
                year: y,
                delta,
                note: format!("Revision arrears for {m:02}/{y}"),
            });
        }
    }
    total = crate::salary_split::round2(total);

    ArrearsResult { amount: total, months }
}
