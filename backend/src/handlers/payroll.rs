use actix_web::{web, HttpRequest, HttpResponse};
use chrono::Datelike;
use serde::Deserialize;
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::payroll_logic;
use crate::tenant::{center_in_organization, org_id_from_claims};

#[derive(Debug, Deserialize)]
pub struct PayrollMonthQuery {
    pub month: Option<i32>,
    pub year: Option<i32>,
    pub department_id: Option<i64>,
    pub center_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct PayrollPreviewRequest {
    pub month: i32,
    pub year: i32,
    pub employee_ids: Vec<i64>,
    pub adjustments: Option<serde_json::Value>,
    pub advance_allocations: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct PayrollGenerateRequest {
    pub month: i32,
    pub year: i32,
    pub payslip_ids: Vec<i64>,
    pub common_adjustments: Option<Vec<serde_json::Value>>,
    /// When true, email each successfully generated payslip to the employee.
    pub send_emails: Option<bool>,
}

fn fetch_user_base(conn: &crate::db::Connection, user_id: i64, org_id: i64) -> Option<serde_json::Value> {
    conn.query_row(
        "SELECT u.id, u.name, u.email, u.photo, u.department_id, d.name, u.work_location
         FROM users u LEFT JOIN departments d ON d.id = u.department_id
         WHERE u.id=?1 AND u.deleted_at IS NULL AND u.organization_id = ?2",
        crate::params![user_id, org_id],
        |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
                "email": row.get_idx::<Option<String>>(2)?,
                "photo": row.get_idx::<Option<String>>(3)?,
                "department_id": row.get_idx::<Option<i64>>(4)?,
                "department_name": row.get_idx::<Option<String>>(5)?,
                "work_location": row.get_idx::<Option<String>>(6)?,
            }))
        },
    )
    .ok()
}

/// Sync unprocessed biometric punches for the payroll month (includes +1 day for overnight clock-outs).
pub fn prepare_attendance_for_payroll(
    conn: &crate::db::Connection,
    org_id: i64,
    month: i32,
    year: i32,
) {
    let cal_days = payroll_logic::calendar_days_in_month(month, year);
    let start = format!("{}-{:02}-01", year, month);
    let end = format!("{}-{:02}-{}", year, month, cal_days);
    let end_extended = chrono::NaiveDate::parse_from_str(&end, "%Y-%m-%d")
        .map(|d| (d + chrono::Duration::days(1)).format("%Y-%m-%d").to_string())
        .unwrap_or(end);
    crate::handlers::biometric::sync_org_biometric_punches_between(conn, org_id, &start, &end_extended);
}

pub fn build_employee_payroll(
    conn: &crate::db::Connection,
    user_id: i64,
    org_id: i64,
    month: i32,
    year: i32,
    month_ctx: Option<&crate::payroll_month_context::MonthContext>,
) -> Option<serde_json::Value> {
    let mut emp = fetch_user_base(conn, user_id, org_id)?;
    let (working_days, present_days, leave_days, paid_holidays) =
        if let Some(ctx) = month_ctx {
            let (a_start, a_end) = ctx.active_range(user_id);
            let working = if a_end < a_start {
                0
            } else {
                ctx.working_days_between(user_id, a_start, a_end)
            };
            let present = ctx.present_dates(user_id, a_start, a_end).len() as i64;
            let leave = ctx.approved_leave_dates(user_id, a_start, a_end).len() as i64;
            let holidays = ctx.paid_holiday_dates(user_id, a_start, a_end).len() as i64;
            (working, present, leave, holidays)
        } else {
            (
                payroll_logic::working_days_for_user(conn, user_id, month, year),
                payroll_logic::employee_present_business_days(conn, user_id, month, year),
                payroll_logic::employee_leave_business_days(conn, user_id, month, year),
                payroll_logic::paid_holidays_for_user(conn, user_id, month, year),
            )
        };
    let cal_days = payroll_logic::calendar_days_in_month(month, year);
    let month_end = format!("{}-{:02}-{}", year, month, cal_days);

    let obj = match emp.as_object_mut() {
        Some(o) => o,
        None => return Some(emp),
    };
    obj.insert("working_days".to_string(), serde_json::json!(working_days));
    obj.insert("calendar_days".to_string(), serde_json::json!(cal_days));
    obj.insert("present_days".to_string(), serde_json::json!(present_days));
    obj.insert("leave_days".to_string(), serde_json::json!(leave_days));
    obj.insert("paid_holidays".to_string(), serde_json::json!(paid_holidays));

    let Some(salary) = crate::salary_logic::load_user_salary(conn, user_id, &month_end) else {
        obj.insert("has_salary_structure".to_string(), serde_json::json!(false));
        obj.insert(
            "payroll_error".to_string(),
            serde_json::json!("No salary structure configured for this period"),
        );
        return Some(emp);
    };

    let gross = salary.gross;
    obj.insert(
        "salary_effective_from".to_string(),
        serde_json::json!(salary.effective_from),
    );
    let lop_base = salary.lop_gross();
    let (lop, lop_breakdown) = if let Some(ctx) = month_ctx {
        let lop_days = ctx.total_lop_days(user_id);
        let working_divisor = working_days.max(1) as f64;
        if lop_days <= 0.0 {
            (0.0, payroll_logic::LopBreakdown::default())
        } else {
            let breakdown =
                payroll_logic::component_lop_breakdown(&salary, lop_days, working_divisor);
            (breakdown.total, breakdown)
        }
    } else {
        payroll_logic::lop_amount_for_user_month(conn, user_id, month, year, working_days)
    };
    let lop_days = lop_breakdown.days;

    let basic_after_lop = crate::salary_split::round2((salary.basic - lop_breakdown.basic).max(0.0));
    let gross_after_lop = lop_breakdown.net_after_lop;

    let comp = crate::salary_split::load_component_split_config(conn, org_id);
    let profile = crate::salary_split::load_employee_profile(conn, user_id, &month_end);
    let use_ctc_profile = profile.is_some();
    let use_component_deductions =
        use_ctc_profile || salary.source == "salary_structure_items";

    let pf_applicable = profile
        .as_ref()
        .map(|p| p.pf_applicable)
        .unwrap_or(true)
        && comp.has_pf;
    let esi_applicable = profile
        .as_ref()
        .map(|p| p.esi_applicable)
        .unwrap_or(true)
        && comp.has_esi;

    let statutory_cfg = crate::statutory_logic::load_statutory_config(conn, org_id);
    let active_advances = crate::statutory_logic::list_active_advances(conn, user_id);
    let advance = crate::statutory_logic::default_advance_recovery(&active_advances);

    let (penalty_days, suggested_shift_penalty) =
        crate::salary_logic::suggested_shift_penalty_for_month(
            conn,
            user_id,
            org_id,
            month,
            year,
            lop_base,
            working_days,
        );
    // Penalties are applied manually at payroll generation (excuses / HR discretion).
    let shift_penalty = 0.0;

    let ot = crate::overtime_logic::overtime_for_user_month(
        conn,
        user_id,
        org_id,
        month,
        year,
        salary.basic,
        gross,
        working_days,
    );
    let (variable_pay, variable_items) =
        crate::payroll_extras::sum_variable_pay(conn, user_id, org_id, month, year);
    let reimbursement =
        crate::payroll_extras::sum_approved_reimbursements(conn, user_id, org_id, month, year);
    let arrears = crate::arrears_logic::arrears_for_user(conn, user_id, org_id, month, year);
    let extra_earnings = ot.amount + variable_pay + reimbursement + arrears.amount;
    let gross_with_extras = crate::salary_split::round2(gross + extra_earnings);
    let gross_after_lop_with_extras =
        crate::salary_split::round2(gross_after_lop + extra_earnings);

    let (on_hold, hold_reason) = crate::payroll_extras::is_payroll_hold(conn, user_id);

    let deduction_lines = if use_component_deductions {
        crate::salary_split::build_payroll_deduction_lines(
            &comp,
            &statutory_cfg,
            basic_after_lop,
            gross_after_lop_with_extras,
            advance,
            pf_applicable,
            esi_applicable,
        )
    } else {
        Vec::new()
    };

    let mut statutory = if use_component_deductions {
        crate::salary_split::statutory_result_from_lines(&deduction_lines)
    } else {
        crate::statutory_logic::StatutoryResult {
            pf_employee: salary.pf,
            esi_employee: salary.esi,
            other_deductions: salary.tds + salary.other_deductions,
            total_employee: salary.fixed_deductions,
            ..Default::default()
        }
    };

    let work_state: String = conn
        .query_row(
            "SELECT COALESCE(work_state, work_location, '') FROM users WHERE id = ?1",
            [user_id],
            |r| r.get_idx::<String>(0),
        )
        .unwrap_or_default();
    if !work_state.is_empty() {
        let pt = crate::tds_logic::pt_for_state(conn, &work_state, gross_after_lop_with_extras);
        if pt > 0.0 {
            statutory.prof_tax = pt;
        }
    }
    let tds_calc = crate::tds_logic::compute_monthly_tds(
        conn,
        user_id,
        month,
        year,
        gross_after_lop_with_extras,
        basic_after_lop,
    );
    if tds_calc.monthly_tds > 0.0 {
        statutory.other_deductions = tds_calc.monthly_tds;
    }
    statutory.total_employee = statutory.pf_employee
        + statutory.esi_employee
        + statutory.prof_tax
        + statutory.lw_employee
        + statutory.advance
        + statutory.other_deductions;

    let total_deductions = if use_component_deductions {
        statutory.total_employee + lop
    } else {
        salary.fixed_deductions + lop
    };

    let mut comp_list: Vec<serde_json::Value> = if use_component_deductions {
        salary
            .components
            .iter()
            .filter(|c| c.get("type").and_then(|v| v.as_str()) == Some("earning"))
            .cloned()
            .collect()
    } else {
        salary.components.clone()
    };

    for line in &lop_breakdown.lines {
        comp_list.push(serde_json::json!({
            "component_id": line.component_id,
            "name": line.name,
            "type": "deduction",
            "amount": line.amount,
        }));
    }
    if lop_breakdown.lines.is_empty() && lop > 0.0 {
        comp_list.push(serde_json::json!({"name": "LOP (Absent)", "type": "deduction", "amount": lop}));
    }

    if use_component_deductions {
        for line in deduction_lines {
            comp_list.push(serde_json::json!({
                "component_id": line.component_id,
                "name": line.name,
                "type": "deduction",
                "amount": line.amount,
            }));
        }
    }

    if ot.amount > 0.0 {
        comp_list.push(serde_json::json!({
            "name": "Overtime",
            "type": "earning",
            "amount": ot.amount,
            "hours": ot.hours,
        }));
    }
    for item in &variable_items {
        comp_list.push(serde_json::json!({
            "name": item.get("label").and_then(|v| v.as_str()).unwrap_or("Variable Pay"),
            "type": "earning",
            "amount": item.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0),
        }));
    }
    if reimbursement > 0.0 {
        comp_list.push(serde_json::json!({
            "name": "Reimbursements",
            "type": "earning",
            "amount": reimbursement,
        }));
    }
    if arrears.amount > 0.0 {
        comp_list.push(serde_json::json!({
            "name": "Salary Arrears",
            "type": "earning",
            "amount": arrears.amount,
        }));
    }
    if tds_calc.monthly_tds > 0.0 {
        comp_list.push(serde_json::json!({
            "name": "TDS",
            "type": "deduction",
            "amount": tds_calc.monthly_tds,
        }));
    }

    let net = if on_hold {
        0.0
    } else {
        (gross_with_extras - total_deductions).max(0.0)
    };

    let _employer_cost_json = serde_json::json!({
        "employer_pf": statutory.pf_employer,
        "employer_esi": statutory.esi_employer,
        "employer_total": statutory.total_employer,
        "gross_with_extras": gross_with_extras,
    });

    let payroll_detail = serde_json::json!({
        "lop_breakdown": lop_breakdown,
        "statutory": statutory,
        "gross_after_lop": gross_after_lop_with_extras,
        "basic_after_lop": basic_after_lop,
        "use_statutory": use_ctc_profile,
        "use_component_deductions": use_component_deductions,
        "source": salary.source,
        "overtime": ot,
        "variable_items": variable_items,
        "arrears": arrears,
        "tds": tds_calc,
        "on_hold": on_hold,
        "hold_reason": hold_reason,
    });

    obj.insert("has_salary_structure".to_string(), serde_json::json!(true));
    obj.insert("salary_source".to_string(), serde_json::json!(salary.source));
    obj.insert("absent_days".to_string(), serde_json::json!(lop_days));
    obj.insert("lop_days".to_string(), serde_json::json!(lop_days));
    obj.insert("penalty_days".to_string(), serde_json::json!(penalty_days));
    obj.insert(
        "suggested_shift_penalty".to_string(),
        serde_json::json!(suggested_shift_penalty),
    );
    obj.insert("shift_penalty".to_string(), serde_json::json!(shift_penalty));
    obj.insert("gross_salary".to_string(), serde_json::json!(gross_with_extras));
    obj.insert("gross_after_lop".to_string(), serde_json::json!(gross_after_lop_with_extras));
    obj.insert("ot_hours".to_string(), serde_json::json!(ot.hours));
    obj.insert("ot_amount".to_string(), serde_json::json!(ot.amount));
    obj.insert("variable_pay".to_string(), serde_json::json!(variable_pay));
    obj.insert("reimbursement_amount".to_string(), serde_json::json!(reimbursement));
    obj.insert("arrears_amount".to_string(), serde_json::json!(arrears.amount));
    obj.insert("payroll_hold".to_string(), serde_json::json!(on_hold));
    obj.insert("payroll_hold_reason".to_string(), serde_json::json!(hold_reason));
    obj.insert(
        "active_advances".to_string(),
        serde_json::to_value(&active_advances).unwrap_or(serde_json::json!([])),
    );
    obj.insert("lop_gross".to_string(), serde_json::json!(lop_base));
    obj.insert("net_salary".to_string(), serde_json::json!(net));
    obj.insert("payroll_detail".to_string(), payroll_detail.clone());
    obj.insert(
        "salary_structure".to_string(),
        serde_json::json!({
            "gross_salary": gross_with_extras,
            "gross_after_lop": gross_after_lop_with_extras,
            "total_deductions": total_deductions,
            "lop_deduction": lop,
            "lop_breakdown": lop_breakdown,
            "shift_penalty": shift_penalty,
            "suggested_shift_penalty": suggested_shift_penalty,
            "penalty_days": penalty_days,
            "ot_hours": ot.hours,
            "ot_amount": ot.amount,
            "variable_pay": variable_pay,
            "reimbursement_amount": reimbursement,
            "arrears_amount": arrears.amount,
            "pf_deduction": if use_component_deductions { statutory.pf_employee } else { salary.pf },
            "esi_deduction": if use_component_deductions { statutory.esi_employee } else { salary.esi },
            "prof_tax": statutory.prof_tax,
            "advance_deduction": statutory.advance,
            "net_salary": net,
            "components": comp_list,
            "statutory": statutory,
        }),
    );

    if let Ok((pid, status)) = conn.query_row(
        "SELECT id, status FROM payslips WHERE user_id=?1 AND month=?2 AND year=?3",
        crate::params![user_id, month, year],
        |row| Ok((row.get_idx::<i64>(0)?, row.get_idx::<String>(1)?)),
    ) {
        obj.insert("payslip_id".to_string(), serde_json::json!(pid));
        obj.insert("payslip_status".to_string(), serde_json::json!(status));
    }

    Some(emp)
}

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    let mut sql = String::from(
        "SELECT p.* FROM payslips p
             INNER JOIN users u ON u.id = p.user_id AND u.organization_id = ?1
             WHERE 1=1",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    crate::branch_scope::append_users_branch_filter(&mut sql, &mut params, &scope, "u");
    sql.push_str(" ORDER BY p.year DESC, p.month DESC LIMIT 100");
    let items: Vec<crate::models::payslip::Payslip> = conn
        .prepare(&sql)
        .map(|stmt| stmt.query_map(&params, crate::models::payslip::Payslip::from_row))
        .unwrap_or_default();
    HttpResponse::Ok().json(ApiResponse::success(items))
}

pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    index(pool, req).await
}

pub async fn stats(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<PayrollMonthQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);

    let now = chrono::Utc::now();
    let month = query.month.unwrap_or(now.month() as i32);
    let year = query.year.unwrap_or(now.year());
    let paid_holidays = payroll_logic::total_paid_holidays_for_month(&conn, org_id, month, year);
    let cal_days = payroll_logic::calendar_days_in_month(month, year);
    let start = format!("{}-{:02}-01", year, month);
    let end = format!("{}-{:02}-{}", year, month, cal_days);

    let mut emp_sql = String::from(
        "SELECT COUNT(*) FROM users u
         WHERE u.deleted_at IS NULL AND u.is_super_admin=0 AND (u.is_external IS NULL OR u.is_external = 0) AND u.organization_id=?1",
    );
    let mut emp_params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    crate::branch_scope::append_users_branch_filter(&mut emp_sql, &mut emp_params, &scope, "u");
    let total_employees: i64 = conn
        .query_row(&emp_sql, &emp_params, |r| r.get_idx::<i64>(0))
        .unwrap_or(0);
    let approved_leave_days =
        payroll_logic::approved_leave_business_days_in_month(&conn, org_id, month, year, &scope);

    let mut present_sql = String::from(
        "SELECT COUNT(DISTINCT a.user_id || '-' || a.date) FROM attendance a
             INNER JOIN users u ON u.id = a.user_id AND u.organization_id = ?3
             WHERE a.date >= ?1 AND a.date <= ?2 AND a.deleted_at IS NULL AND a.clock_out IS NOT NULL",
    );
    let mut present_params: Vec<crate::db::ParamValue> = vec![
        crate::db::into_param_value(start.clone()),
        crate::db::into_param_value(end.clone()),
        crate::db::into_param_value(org_id),
    ];
    crate::branch_scope::append_users_branch_filter(&mut present_sql, &mut present_params, &scope, "u");
    let present_days_total: i64 = conn
        .query_row(&present_sql, &present_params, |r| r.get_idx::<i64>(0))
        .unwrap_or(0);

    let mut slip_sql = String::from(
        "SELECT COUNT(*) FROM payslips p
             INNER JOIN users u ON u.id = p.user_id AND u.organization_id = ?3
             WHERE p.month=?1 AND p.year=?2 AND p.status='generated'",
    );
    let mut slip_params: Vec<crate::db::ParamValue> = vec![
        crate::db::into_param_value(month),
        crate::db::into_param_value(year),
        crate::db::into_param_value(org_id),
    ];
    crate::branch_scope::append_users_branch_filter(&mut slip_sql, &mut slip_params, &scope, "u");

    let mut gross_sql = String::from(
        "SELECT COALESCE(SUM(p.gross_salary),0) FROM payslips p
             INNER JOIN users u ON u.id = p.user_id AND u.organization_id = ?3
             WHERE p.month=?1 AND p.year=?2 AND p.status='generated'",
    );
    let mut gross_params: Vec<crate::db::ParamValue> = vec![
        crate::db::into_param_value(month),
        crate::db::into_param_value(year),
        crate::db::into_param_value(org_id),
    ];
    crate::branch_scope::append_users_branch_filter(&mut gross_sql, &mut gross_params, &scope, "u");

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "total_employees": total_employees,
        "approved_leaves": approved_leave_days,
        "present_days_total": present_days_total,
        "paid_holidays": paid_holidays,
        "total": conn.query_row(&slip_sql, &slip_params, |r| r.get_idx::<i64>(0)).unwrap_or(0),
        "total_gross": conn.query_row(&gross_sql, &gross_params, |r| r.get_idx::<f64>(0)).unwrap_or(0.0),
    })))
}

pub async fn employees(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<PayrollMonthQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);

    let now = chrono::Utc::now();
    let month = query.month.unwrap_or(now.month() as i32);
    let year = query.year.unwrap_or(now.year());

    let mut sql = String::from(
        "SELECT u.id FROM users u WHERE u.deleted_at IS NULL AND u.is_super_admin=0 AND (u.is_external IS NULL OR u.is_external = 0) AND u.organization_id = ?",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    if let Some(dept_id) = query.department_id {
        sql.push_str(" AND u.department_id=?");
        params.push(crate::db::into_param_value(dept_id));
    }
    if let Some(center_id) = query.center_id {
        if !center_in_organization(&conn, center_id, org_id) {
            return HttpResponse::BadRequest().json(ApiError::new("Center not found"));
        }
        if let Err(resp) = crate::branch_scope::ensure_center_allowed(&scope, Some(center_id)) {
            return resp;
        }
        sql.push_str(
            " AND (
                TRIM(COALESCE(u.work_location, '')) = CAST(? AS TEXT)
                OR u.department_id IN (SELECT d.id FROM departments d WHERE d.center_id = ? AND d.organization_id = ?)
              )",
        );
        params.push(crate::db::into_param_value(center_id));
        params.push(crate::db::into_param_value(center_id));
        params.push(crate::db::into_param_value(org_id));
    }
    let mut conditions = Vec::new();
    crate::branch_scope::push_users_branch_condition_qmark(&mut conditions, &mut params, &scope, "u");
    for c in conditions {
        sql.push_str(" AND ");
        sql.push_str(&c);
    }

    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return HttpResponse::Ok().json(ApiResponse::success(Vec::<serde_json::Value>::new())),
    };
    let user_ids: Vec<i64> = stmt
        .query_map(&params, |row| row.get_idx::<i64>(0));

    // Do not sync biometric punches on list reads — the biometric worker (or
    // generate/preview paths) owns that. Sync-on-read made payroll page open slow.
    let month_ctx =
        crate::payroll_month_context::MonthContext::prefetch(&conn, org_id, &user_ids, month, year);

    let items: Vec<serde_json::Value> = user_ids
        .into_iter()
        .filter_map(|uid| {
            build_employee_payroll(&conn, uid, org_id, month, year, Some(&month_ctx))
        })
        .collect();

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// Recompute draft payslip figures from current attendance/leave/salary data.
fn payslip_extras_from_emp(emp: &serde_json::Value) -> (f64, f64, f64, f64, f64) {
    (
        emp.get("ot_hours").and_then(|v| v.as_f64()).unwrap_or(0.0),
        emp.get("ot_amount").and_then(|v| v.as_f64()).unwrap_or(0.0),
        emp.get("variable_pay").and_then(|v| v.as_f64()).unwrap_or(0.0),
        emp.get("reimbursement_amount")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0),
        emp.get("arrears_amount").and_then(|v| v.as_f64()).unwrap_or(0.0),
    )
}

fn refresh_draft_payslip(
    conn: &crate::db::Connection,
    payslip_id: i64,
    user_id: i64,
    org_id: i64,
    month: i32,
    year: i32,
    existing_adj: &str,
    now: &str,
) -> Result<(), String> {
    let Some(emp) = build_employee_payroll(conn, user_id, org_id, month, year, None) else {
        return Err("Could not rebuild payroll data".into());
    };
    if !emp
        .get("has_salary_structure")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        return Err("Employee has no salary structure".into());
    }

    let gross = emp.get("gross_salary").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let mut net = emp.get("net_salary").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let mut total_deductions = emp
        .get("salary_structure")
        .and_then(|v| v.get("total_deductions"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let working_days = emp.get("working_days").and_then(|v| v.as_i64()).unwrap_or(0);
    let present_days = emp.get("present_days").and_then(|v| v.as_i64()).unwrap_or(0);
    let leave_days = emp.get("leave_days").and_then(|v| v.as_i64()).unwrap_or(0);
    let paid_holidays = emp.get("paid_holidays").and_then(|v| v.as_i64()).unwrap_or(0);
    let lop = emp
        .get("salary_structure")
        .and_then(|v| v.get("lop_deduction"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let shift_penalty = emp.get("shift_penalty").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let ss = emp.get("salary_structure");
    let lop_bd = ss.and_then(|v| v.get("lop_breakdown"));
    let lop_basic = lop_bd.and_then(|v| v.get("basic")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let lop_hra = lop_bd.and_then(|v| v.get("hra")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let lop_transport = lop_bd
        .and_then(|v| v.get("conveyance"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let lop_other = lop_bd.and_then(|v| v.get("special")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let pf = ss.and_then(|v| v.get("pf_deduction")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let esi = ss.and_then(|v| v.get("esi_deduction")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let prof_tax = ss.and_then(|v| v.get("prof_tax")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let default_advance = ss
        .and_then(|v| v.get("advance_deduction"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let lw_employee = ss
        .and_then(|v| v.get("statutory"))
        .and_then(|v| v.get("lw_employee"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let tds = ss
        .and_then(|v| v.get("statutory"))
        .and_then(|v| v.get("other_deductions"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let payroll_detail = emp
        .get("payroll_detail")
        .map(|v| v.to_string())
        .unwrap_or_else(|| "{}".into());
    let (ot_hours, ot_amount, variable_pay, reimbursement, arrears) = payslip_extras_from_emp(&emp);

    let cal_days = payroll_logic::calendar_days_in_month(month, year);
    let month_end = format!("{}-{:02}-{}", year, month, cal_days);
    let salary = crate::salary_logic::load_user_salary(conn, user_id, &month_end);
    let (basic, hra, transport, other) = if let Some(ref s) = salary {
        (
            crate::salary_split::round2((s.basic - lop_basic).max(0.0)),
            crate::salary_split::round2((s.hra - lop_hra).max(0.0)),
            crate::salary_split::round2((s.transport - lop_transport).max(0.0)),
            crate::salary_split::round2((s.other_earnings - lop_other).max(0.0)),
        )
    } else {
        (0.0, 0.0, 0.0, 0.0)
    };

    let active_advances = crate::statutory_logic::list_active_advances(conn, user_id);
    let stored_allocs = crate::statutory_logic::parse_advance_allocations(existing_adj);
    let (advance, net, total_deductions) = if stored_allocs.is_empty() {
        (default_advance, net, total_deductions)
    } else {
        match payroll_logic::apply_advance_override(
            default_advance,
            net,
            total_deductions,
            &active_advances,
            Some(&stored_allocs),
        ) {
            Ok((adv, n, td, _)) => (adv, n, td),
            Err(e) => return Err(e),
        }
    };

    let updated = conn
        .execute(
            "UPDATE payslips SET working_days=?1, present_days=?2, leave_days=?3, holiday_days=?4,
             basic_salary=?5, hra=?6, transport_allowance=?7, other_allowances=?8, gross_salary=?9,
             lop_deduction=?10, lop_basic=?11, lop_hra=?12, lop_transport=?13, lop_other=?14,
             shift_penalty=?15, pf_deduction=?16, esi_deduction=?17, tds=?18, prof_tax=?19,
             advance_deduction=?20, lw_employee=?21, total_deductions=?22, net_salary=?23,
             payroll_detail=?24, ot_hours=?25, ot_amount=?26, variable_pay_amount=?27,
             reimbursement_amount=?28, arrears_amount=?29, updated_at=?30
             WHERE id=?31 AND status='draft'
               AND user_id IN (SELECT id FROM users WHERE organization_id = ?32)",
            crate::params![
                working_days,
                present_days,
                leave_days,
                paid_holidays,
                basic,
                hra,
                transport,
                other,
                gross,
                lop,
                lop_basic,
                lop_hra,
                lop_transport,
                lop_other,
                shift_penalty,
                pf,
                esi,
                tds,
                prof_tax,
                advance,
                lw_employee,
                total_deductions,
                net,
                payroll_detail,
                ot_hours,
                ot_amount,
                variable_pay,
                reimbursement,
                arrears,
                now,
                payslip_id,
                org_id,
            ],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err("Draft payslip not found or already generated".into());
    }
    Ok(())
}

pub async fn preview(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<PayrollPreviewRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let adj_map = payroll_logic::parse_employee_adjustments(&body.adjustments);
    let advance_alloc_map = payroll_logic::parse_advance_allocation_map(&body.advance_allocations);
    let mut previews = Vec::new();

    prepare_attendance_for_payroll(&conn, org_id, body.month, body.year);

    let month_ctx = crate::payroll_month_context::MonthContext::prefetch(
        &conn,
        org_id,
        &body.employee_ids,
        body.month,
        body.year,
    );

    for user_id in &body.employee_ids {
        if let Err(_) = crate::branch_scope::require_user_in_scope(&conn, *user_id, org_id, &scope) {
            previews.push(serde_json::json!({
                "user_id": user_id,
                "status": "out_of_branch_scope",
                "has_salary_structure": false,
            }));
            continue;
        }
        let Some(emp) = build_employee_payroll(
            &conn,
            *user_id,
            org_id,
            body.month,
            body.year,
            Some(&month_ctx),
        ) else {
            continue;
        };

        if !emp
            .get("has_salary_structure")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            previews.push(serde_json::json!({
                "user_id": user_id,
                "user_name": emp.get("name").and_then(|v| v.as_str()).unwrap_or("Employee"),
                "skipped": true,
                "reason": emp.get("payroll_error").and_then(|v| v.as_str()).unwrap_or("No salary structure"),
            }));
            continue;
        }

        let gross = emp.get("gross_salary").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let mut net = emp.get("net_salary").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let mut total_deductions = emp
            .get("salary_structure")
            .and_then(|v| v.get("total_deductions"))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let name = emp.get("name").and_then(|v| v.as_str()).unwrap_or("Employee");
        let working_days = emp.get("working_days").and_then(|v| v.as_i64()).unwrap_or(0);
        let present_days = emp.get("present_days").and_then(|v| v.as_i64()).unwrap_or(0);
        let leave_days = emp.get("leave_days").and_then(|v| v.as_i64()).unwrap_or(0);
        let paid_holidays = emp.get("paid_holidays").and_then(|v| v.as_i64()).unwrap_or(0);
        let lop = emp
            .get("salary_structure")
            .and_then(|v| v.get("lop_deduction"))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let shift_penalty = emp.get("shift_penalty").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let ss = emp.get("salary_structure");
        let lop_bd = ss.and_then(|v| v.get("lop_breakdown"));
        let lop_basic = lop_bd.and_then(|v| v.get("basic")).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let lop_hra = lop_bd.and_then(|v| v.get("hra")).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let lop_transport = lop_bd.and_then(|v| v.get("conveyance")).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let lop_other = lop_bd.and_then(|v| v.get("special")).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let pf = ss.and_then(|v| v.get("pf_deduction")).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let esi = ss.and_then(|v| v.get("esi_deduction")).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let prof_tax = ss.and_then(|v| v.get("prof_tax")).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let default_advance = ss.and_then(|v| v.get("advance_deduction")).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let lw_employee = ss
            .and_then(|v| v.get("statutory"))
            .and_then(|v| v.get("lw_employee"))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let tds = ss
            .and_then(|v| v.get("statutory"))
            .and_then(|v| v.get("other_deductions"))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let payroll_detail = emp.get("payroll_detail").map(|v| v.to_string()).unwrap_or_else(|| "{}".into());
        let (ot_hours, ot_amount, variable_pay, reimbursement, arrears) = payslip_extras_from_emp(&emp);

        let cal_days = payroll_logic::calendar_days_in_month(body.month, body.year);
        let month_end = format!("{}-{:02}-{}", body.year, body.month, cal_days);
        let salary = crate::salary_logic::load_user_salary(&conn, *user_id, &month_end);
        let (basic, hra, transport, other) = if let Some(ref s) = salary {
            (
                crate::salary_split::round2((s.basic - lop_basic).max(0.0)),
                crate::salary_split::round2((s.hra - lop_hra).max(0.0)),
                crate::salary_split::round2((s.transport - lop_transport).max(0.0)),
                crate::salary_split::round2((s.other_earnings - lop_other).max(0.0)),
            )
        } else {
            (0.0, 0.0, 0.0, 0.0)
        };

        let user_adjs = adj_map.get(user_id).map(|v| v.as_slice()).unwrap_or(&[]);
        let (adj_net, adj_ded, mut adj_json) =
            payroll_logic::apply_adjustment_list(gross, net, total_deductions, user_adjs);
        net = adj_net;
        total_deductions = adj_ded;

        let active_advances = crate::statutory_logic::list_active_advances(&conn, *user_id);
        let user_overrides = advance_alloc_map.get(user_id).map(|v| v.as_slice());
        let (advance, advance_allocs) = match payroll_logic::apply_advance_override(
            default_advance,
            net,
            total_deductions,
            &active_advances,
            user_overrides,
        ) {
            Ok((adv, n, td, allocs)) => {
                net = n;
                total_deductions = td;
                (adv, allocs)
            }
            Err(e) => {
                previews.push(serde_json::json!({
                    "user_id": user_id,
                    "user_name": name,
                    "skipped": true,
                    "reason": e,
                }));
                continue;
            }
        };
        adj_json = crate::statutory_logic::merge_advance_allocations(&adj_json, &advance_allocs);

        let existing: Option<(i64, String)> = conn
            .query_row(
                "SELECT p.id, p.status FROM payslips p
                 INNER JOIN users u ON u.id = p.user_id AND u.organization_id = ?4
                 WHERE p.user_id=?1 AND p.month=?2 AND p.year=?3
                 ORDER BY p.id DESC LIMIT 1",
                crate::params![user_id, body.month, body.year, org_id],
                |row| Ok((row.get_idx::<i64>(0)?, row.get_idx::<String>(1)?)),
            ).ok();

        if let Some((pid, ref status)) = existing {
            if status == "generated" {
                previews.push(serde_json::json!({
                    "id": pid,
                    "user_id": user_id,
                    "user_name": name,
                    "skipped": true,
                    "reason": "Payslip already generated — unlock before re-previewing",
                }));
                continue;
            }
        }

        let payslip_id = if let Some((pid, _)) = existing {
            let _ = conn.execute(
                "UPDATE payslips SET working_days=?1, present_days=?2, leave_days=?3, holiday_days=?4,
                 basic_salary=?5, hra=?6, transport_allowance=?7, other_allowances=?8, gross_salary=?9,
                 lop_deduction=?10, lop_basic=?11, lop_hra=?12, lop_transport=?13, lop_other=?14,
                 shift_penalty=?15, pf_deduction=?16, esi_deduction=?17, tds=?18, prof_tax=?19,
                 advance_deduction=?20, lw_employee=?21, total_deductions=?22, net_salary=?23,
                 adjustments=?24, payroll_detail=?25, ot_hours=?26, ot_amount=?27, variable_pay_amount=?28,
                 reimbursement_amount=?29, arrears_amount=?30, status='draft', updated_at=?31
                 WHERE id=?32 AND status='draft'
                   AND user_id IN (SELECT id FROM users WHERE organization_id = ?33)",
                crate::params![
                    working_days, present_days, leave_days, paid_holidays,
                    basic, hra, transport, other, gross, lop, lop_basic, lop_hra, lop_transport, lop_other,
                    shift_penalty, pf, esi, tds, prof_tax, advance, lw_employee,
                    total_deductions, net, adj_json, payroll_detail,
                    ot_hours, ot_amount, variable_pay, reimbursement, arrears,
                    &now, pid, org_id,
                ],
            );
            pid
        } else {
            if let Err(e) = conn.execute(
                "INSERT INTO payslips (user_id, month, year, working_days, present_days, leave_days, holiday_days,
                 basic_salary, hra, transport_allowance, other_allowances, gross_salary, lop_deduction,
                 lop_basic, lop_hra, lop_transport, lop_other, shift_penalty, pf_deduction, esi_deduction, tds,
                 prof_tax, advance_deduction, lw_employee, total_deductions, net_salary, adjustments, payroll_detail,
                 ot_hours, ot_amount, variable_pay_amount, reimbursement_amount, arrears_amount,
                 organization_id, status, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33,?34,'draft',?35,?35)",
                crate::params![
                    user_id, body.month, body.year, working_days, present_days, leave_days,
                    paid_holidays, basic, hra, transport, other, gross, lop, lop_basic, lop_hra, lop_transport, lop_other,
                    shift_penalty, pf, esi, tds, prof_tax, advance, lw_employee,
                    total_deductions, net, adj_json, payroll_detail,
                    ot_hours, ot_amount, variable_pay, reimbursement, arrears,
                    org_id, &now,
                ],
            ) {
                log::error!("Failed to insert draft payslip for user_id={user_id}: {e}");
                continue;
            }
            match conn.query_row(
                "SELECT p.id FROM payslips p
                 INNER JOIN users u ON u.id = p.user_id AND u.organization_id = ?4
                 WHERE p.user_id = ?1 AND p.month = ?2 AND p.year = ?3
                 ORDER BY p.id DESC LIMIT 1",
                crate::params![user_id, body.month, body.year, org_id],
                |row| row.get_idx::<i64>(0),
            ) {
                Ok(id) => id,
                Err(_) => continue,
            }
        };

        if payslip_id <= 0 {
            continue;
        }

        previews.push(serde_json::json!({
            "id": payslip_id,
            "user_id": user_id,
            "user_name": name,
            "working_days": working_days,
            "present_days": present_days,
            "leave_days": leave_days,
            "absent_days": emp.get("absent_days").and_then(|v| v.as_i64()).unwrap_or(0),
            "penalty_days": emp.get("penalty_days").and_then(|v| v.as_i64()).unwrap_or(0),
            "shift_penalty": shift_penalty,
            "suggested_shift_penalty": emp
                .get("suggested_shift_penalty")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0),
            "lop_gross": emp.get("lop_gross").and_then(|v| v.as_f64()).unwrap_or(0.0),
            "gross_salary": gross,
            "total_deductions": total_deductions,
            "net_salary": net,
            "skipped": false,
        }));
    }

    HttpResponse::Ok().json(ApiResponse::success(previews))
}

pub async fn generate(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<PayrollGenerateRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut generated = 0i64;
    let mut skipped = 0i64;
    let mut results = Vec::new();
    let mut generated_ids: Vec<i64> = Vec::new();

    let month = body.month;
    let year = body.year;

    if crate::payroll_extras::payroll_require_approval(&conn, org_id) {
        let run_status: Option<String> = conn
            .query_row(
                "SELECT status FROM payroll_runs WHERE organization_id = ?1 AND month = ?2 AND year = ?3
                 ORDER BY id DESC LIMIT 1",
                crate::params![org_id, month, year],
                |r| r.get_idx::<String>(0),
            )
            .ok();
        let approved = run_status
            .as_deref()
            .map(crate::payroll_extras::run_status_allows_generate)
            .unwrap_or(false);
        if !approved {
            return HttpResponse::BadRequest().json(ApiError::new(
                "Payroll run must be approved before generation. Create a run and approve it first.",
            ));
        }
    }

    prepare_attendance_for_payroll(&conn, org_id, month, year);

    for payslip_id in &body.payslip_ids {
        let row: Option<(f64, f64, f64, String, i64, f64)> = conn
            .query_row(
                "SELECT p.gross_salary, p.net_salary, p.total_deductions, COALESCE(p.adjustments,'[]'),
                        p.user_id, COALESCE(p.advance_deduction, 0)
                 FROM payslips p
                 INNER JOIN users u ON u.id = p.user_id AND u.organization_id = ?2
                 WHERE p.id = ?1 AND p.status = 'draft' AND p.month = ?3 AND p.year = ?4",
                crate::params![payslip_id, org_id, month, year],
                |r| Ok((r.get_idx::<f64>(0)?, r.get_idx::<f64>(1)?, r.get_idx::<f64>(2)?, r.get_idx::<String>(3)?, r.get_idx::<i64>(4)?, r.get_idx::<f64>(5)?)),
            ).ok();

        let Some((_, _, _, existing_adj, user_id, _advance)) = row else {
            skipped += 1;
            results.push(serde_json::json!({"id": payslip_id, "status": "not_found"}));
            continue;
        };

        if let Err(_) = crate::branch_scope::require_user_in_scope(&conn, user_id, org_id, &scope) {
            skipped += 1;
            results.push(serde_json::json!({"id": payslip_id, "status": "out_of_branch_scope"}));
            continue;
        }

        if refresh_draft_payslip(
            &conn,
            *payslip_id,
            user_id,
            org_id,
            month,
            year,
            &existing_adj,
            &now,
        )
        .is_err()
        {
            skipped += 1;
            results.push(serde_json::json!({"id": payslip_id, "status": "refresh_failed"}));
            continue;
        }

        let refreshed: Option<(f64, f64, f64, String, f64)> = conn
            .query_row(
                "SELECT p.gross_salary, p.net_salary, p.total_deductions, COALESCE(p.adjustments,'[]'),
                        COALESCE(p.advance_deduction, 0)
                 FROM payslips p
                 INNER JOIN users u ON u.id = p.user_id AND u.organization_id = ?2
                 WHERE p.id = ?1 AND p.status = 'draft' AND p.month = ?3 AND p.year = ?4",
                crate::params![payslip_id, org_id, month, year],
                |r| {
                    Ok((
                        r.get_idx::<f64>(0)?,
                        r.get_idx::<f64>(1)?,
                        r.get_idx::<f64>(2)?,
                        r.get_idx::<String>(3)?,
                        r.get_idx::<f64>(4)?,
                    ))
                },
            )
            .ok();

        let Some((gross, mut net, mut total_deductions, existing_adj, advance)) = refreshed else {
            skipped += 1;
            results.push(serde_json::json!({"id": payslip_id, "status": "not_found"}));
            continue;
        };

        let mut adj_json = existing_adj.clone();
        if let Some(ref common) = body.common_adjustments {
            if !common.is_empty() {
                let (adj_net, adj_ded, merged_json) = payroll_logic::finalize_payslip_adjustments(
                    gross,
                    net,
                    total_deductions,
                    &existing_adj,
                    common,
                );
                net = adj_net;
                total_deductions = adj_ded;
                adj_json = merged_json;
            }
        }

        let mut advance_deducted = false;
        let stored_allocs = crate::statutory_logic::parse_advance_allocations(&adj_json);
        let allocs_ref = if stored_allocs.is_empty() {
            None
        } else {
            Some(stored_allocs.as_slice())
        };
        if (advance > 0.0 || allocs_ref.is_some()) && user_id > 0 {
            match crate::statutory_logic::deduct_advances_for_payslip(
                &conn,
                user_id,
                &now,
                allocs_ref,
            ) {
                Ok((deducted_total, allocs)) if !allocs.is_empty() => {
                    if advance > 0.0 && (deducted_total - advance).abs() > 0.02 {
                        skipped += 1;
                        results.push(serde_json::json!({
                            "id": payslip_id,
                            "status": "advance_deduction_failed",
                            "error": format!(
                                "Advance recovery {:.2} does not match payslip {:.2}",
                                deducted_total, advance
                            ),
                        }));
                        continue;
                    }
                    adj_json = crate::statutory_logic::merge_advance_allocations(&adj_json, &allocs);
                    advance_deducted = true;
                }
                Ok(_) => {}
                Err(e) => {
                    skipped += 1;
                    results.push(serde_json::json!({
                        "id": payslip_id,
                        "status": "advance_deduction_failed",
                        "error": e,
                    }));
                    continue;
                }
            }
        }

        let updated = conn.execute(
            "UPDATE payslips SET net_salary=?1, total_deductions=?2, adjustments=?3,
             status='generated', generated_at=?4, updated_at=?4
             WHERE id=?5 AND status='draft'
               AND user_id IN (SELECT id FROM users WHERE organization_id = ?6)",
            crate::params![net, total_deductions, &adj_json, &now, payslip_id, org_id],
        );
        if updated.unwrap_or(0) > 0 {
            generated += 1;
            generated_ids.push(*payslip_id);
            results.push(serde_json::json!({"id": payslip_id, "status": "generated", "net_salary": net}));
            let payslip_ctx = serde_json::json!({
                "payslip_id": payslip_id,
                "user_id": user_id,
                "month": month,
                "year": year,
                "net_salary": net,
                "gross_salary": gross,
                "organization_id": org_id,
                "created_by": claims.sub,
            });
            crate::workflow_logic::trigger(&conn, org_id, "payslip_generated", &payslip_ctx);
            crate::tenant_webhooks::dispatch(&conn, org_id, "payslip.generated", &payslip_ctx);
        } else {
            if advance_deducted {
                let _ = crate::statutory_logic::restore_advances_for_payslip(
                    &conn, &adj_json, 0.0, user_id, &now,
                );
            }
            skipped += 1;
            results.push(serde_json::json!({"id": payslip_id, "status": "skipped"}));
        }
    }

    let email_result = if body.send_emails.unwrap_or(false) && !generated_ids.is_empty() {
        let pool_bg = pool.clone();
        let ids = generated_ids.clone();
        tokio::spawn(async move {
            let Ok(conn) = pool_bg.get_for_tenant(org_id) else {
                log::error!("Payslip email background task: database unavailable");
                return;
            };
            let batch = crate::payslip_email::bulk_send_payslip_emails(&conn, org_id, &ids);
            log::info!(
                "Payslip email batch complete: sent={} skipped={} errors={}",
                batch.sent,
                batch.skipped,
                batch.errors.len()
            );
        });
        Some(serde_json::json!({
            "queued": true,
            "count": generated_ids.len(),
        }))
    } else {
        None
    };

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "message": format!("Generated {} payslips ({} skipped)", generated, skipped),
        "generated": generated,
        "skipped": skipped,
        "results": results,
        "email": email_result,
    })))
}

/// POST /api/admin/payslips/{id}/unlock — revert generated payslip to draft
pub async fn unlock_payslip(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let id = path.into_inner();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let payslip_row: Option<(i64, f64, i32, i32, String)> = conn
        .query_row(
            "SELECT p.user_id, COALESCE(p.advance_deduction, 0), p.month, p.year, COALESCE(p.adjustments, '[]')
             FROM payslips p
             INNER JOIN users u ON u.id = p.user_id AND u.organization_id = ?2
             WHERE p.id = ?1 AND p.status = 'generated'",
            crate::params![id, org_id],
            |r| Ok((r.get_idx::<i64>(0)?, r.get_idx::<f64>(1)?, r.get_idx::<i32>(2)?, r.get_idx::<i32>(3)?, r.get_idx::<String>(4)?)),
        ).ok();

    let Some((user_id, advance, month, year, adjustments)) = payslip_row else {
        return HttpResponse::NotFound().json(ApiError::new("Generated payslip not found"));
    };

    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Err(resp) = crate::branch_scope::require_user_in_scope(&conn, user_id, org_id, &scope) {
        return resp;
    }

    let updated = conn.execute(
        "UPDATE payslips SET status='draft', generated_at=NULL, updated_at=?1
         WHERE id=?2 AND status='generated'
           AND user_id IN (SELECT id FROM users WHERE organization_id = ?3)",
        crate::params![&now, id, org_id],
    );
    if updated.unwrap_or(0) == 0 {
        return HttpResponse::NotFound().json(ApiError::new("Generated payslip not found"));
    }

    if advance > 0.0 {
        if let Err(e) = crate::statutory_logic::restore_advances_for_payslip(
            &conn,
            &adjustments,
            advance,
            user_id,
            &now,
        ) {
            log::error!("Failed to restore advances for payslip {}: {}", id, e);
            return HttpResponse::InternalServerError().json(ApiError::new(
                "Payslip unlocked but advance balance restore failed — contact support",
            ));
        }
    }

    match refresh_draft_payslip(&conn, id, user_id, org_id, month, year, &adjustments, &now) {
        Ok(()) => {}
        Err(e) => {
            log::warn!("Payslip {} unlocked but refresh failed: {}", id, e);
        }
    }

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "message": "Payslip unlocked and draft refreshed from latest attendance/leave data",
    })))
}
