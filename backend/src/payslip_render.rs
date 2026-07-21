//! HTML payslip renderer retained for reference; production uses PDF (`payslip_pdf`).
#![allow(dead_code)]

use crate::db::Connection;

pub(crate) const MONTH_NAMES: [&str; 12] = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

pub struct PayslipRenderData {
    pub id: i64,
    pub month: i32,
    pub year: i32,
    pub gross: f64,
    pub total_ded: f64,
    pub net: f64,
    pub status: String,
    pub working: i64,
    pub present: i64,
    pub leave: i64,
    pub holidays: i64,
    pub basic: f64,
    pub hra: f64,
    pub transport: f64,
    pub other: f64,
    pub ot_hours: f64,
    pub ot_amount: f64,
    pub variable_pay: f64,
    pub reimbursement: f64,
    pub arrears: f64,
    pub lop: f64,
    pub shift_penalty: f64,
    pub lop_basic: f64,
    pub lop_hra: f64,
    pub lop_transport: f64,
    pub pf: f64,
    pub esi: f64,
    pub tds: f64,
    pub prof_tax: f64,
    pub advance: f64,
    pub lw_employee: f64,
    pub adjustments_json: String,
    pub emp_name: String,
    pub emp_id: Option<String>,
    pub emp_email: Option<String>,
    pub emp_phone: Option<String>,
    pub emp_address: Option<String>,
    pub emp_city: Option<String>,
    pub emp_state: Option<String>,
    pub emp_postal: Option<String>,
    pub emp_account: Option<String>,
    pub emp_bank: Option<String>,
    pub emp_pan: Option<String>,
    pub emp_tax_regime: Option<String>,
    pub dept: Option<String>,
    pub designation: Option<String>,
    pub company_name: String,
    pub company_address: Option<String>,
    pub company_phone: Option<String>,
    pub company_email: Option<String>,
    pub pan_number: Option<String>,
    pub pf_number: Option<String>,
}

fn setting(conn: &Connection, org_id: i64, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE organization_id = ?1 AND key = ?2",
        crate::params![org_id, key],
        |r| r.get_idx::<String>(0),
    )
    .ok()
    .filter(|s: &String| !s.trim().is_empty())
}

pub fn load_payslip(conn: &Connection, payslip_id: i64, org_id: i64) -> Option<PayslipRenderData> {
    let base = conn
        .query_row(
            "SELECT p.id, p.month, p.year, p.gross_salary, p.total_deductions, p.net_salary, p.status,
                    p.working_days, p.present_days, p.leave_days, p.holiday_days,
                    p.basic_salary, p.hra, p.transport_allowance, p.other_allowances,
                    COALESCE(p.ot_hours, 0), COALESCE(p.ot_amount, 0),
                    COALESCE(p.variable_pay_amount, 0), COALESCE(p.reimbursement_amount, 0),
                    COALESCE(p.arrears_amount, 0),
                    COALESCE(p.lop_deduction, 0), COALESCE(p.shift_penalty, 0),
                    COALESCE(p.lop_basic, 0), COALESCE(p.lop_hra, 0), COALESCE(p.lop_transport, 0),
                    COALESCE(p.pf_deduction, 0), COALESCE(p.esi_deduction, 0), COALESCE(p.tds, 0),
                    COALESCE(p.prof_tax, 0), COALESCE(p.advance_deduction, 0), COALESCE(p.lw_employee, 0),
                    COALESCE(p.adjustments, '[]'),
                    u.name, u.employee_id, u.email, u.phone, u.address, u.city, u.state, u.postal_code,
                    u.account_number, u.bank_name, u.pan_number, u.tax_regime,
                    d.name, des.name
             FROM payslips p
             JOIN users u ON u.id = p.user_id
             LEFT JOIN departments d ON d.id = u.department_id AND d.organization_id = u.organization_id
             LEFT JOIN designations des ON des.id = u.designation_id AND des.organization_id = u.organization_id
             WHERE p.id=?1 AND u.organization_id=?2",
            crate::params![payslip_id, org_id],
            |r| {
                Ok((
                    r.get_idx::<i64>(0)?,
                    r.get_idx::<i32>(1)?,
                    r.get_idx::<i32>(2)?,
                    r.get_idx::<f64>(3)?,
                    r.get_idx::<f64>(4)?,
                    r.get_idx::<f64>(5)?,
                    r.get_idx::<String>(6)?,
                    r.get_idx::<i64>(7).unwrap_or(0),
                    r.get_idx::<i64>(8).unwrap_or(0),
                    r.get_idx::<i64>(9).unwrap_or(0),
                    r.get_idx::<i64>(10).unwrap_or(0),
                    r.get_idx::<f64>(11).unwrap_or(0.0),
                    r.get_idx::<f64>(12).unwrap_or(0.0),
                    r.get_idx::<f64>(13).unwrap_or(0.0),
                    r.get_idx::<f64>(14).unwrap_or(0.0),
                    r.get_idx::<f64>(15).unwrap_or(0.0),
                    r.get_idx::<f64>(16).unwrap_or(0.0),
                    r.get_idx::<f64>(17).unwrap_or(0.0),
                    r.get_idx::<f64>(18).unwrap_or(0.0),
                    r.get_idx::<f64>(19).unwrap_or(0.0),
                    r.get_idx::<f64>(20).unwrap_or(0.0),
                    r.get_idx::<f64>(21).unwrap_or(0.0),
                    r.get_idx::<f64>(22).unwrap_or(0.0),
                    r.get_idx::<f64>(23).unwrap_or(0.0),
                    r.get_idx::<f64>(24).unwrap_or(0.0),
                    r.get_idx::<f64>(25).unwrap_or(0.0),
                    r.get_idx::<f64>(26).unwrap_or(0.0),
                    r.get_idx::<f64>(27).unwrap_or(0.0),
                    r.get_idx::<f64>(28).unwrap_or(0.0),
                    r.get_idx::<f64>(29).unwrap_or(0.0),
                    r.get_idx::<f64>(30).unwrap_or(0.0),
                    r.get_idx::<String>(31)?,
                    r.get_idx::<String>(32)?,
                    r.get_idx::<Option<String>>(33)?,
                    r.get_idx::<Option<String>>(34)?,
                    r.get_idx::<Option<String>>(35)?,
                    r.get_idx::<Option<String>>(36)?,
                    r.get_idx::<Option<String>>(37)?,
                    r.get_idx::<Option<String>>(38)?,
                    r.get_idx::<Option<String>>(39)?,
                    r.get_idx::<Option<String>>(40)?,
                    r.get_idx::<Option<String>>(41)?,
                    r.get_idx::<Option<String>>(42)?,
                    r.get_idx::<Option<String>>(43)?,
                    r.get_idx::<Option<String>>(44)?,
                    r.get_idx::<Option<String>>(45)?,
                ))
            },
        )
        .ok()?;

    Some(PayslipRenderData {
        id: base.0,
        month: base.1,
        year: base.2,
        gross: base.3,
        total_ded: base.4,
        net: base.5,
        status: base.6,
        working: base.7,
        present: base.8,
        leave: base.9,
        holidays: base.10,
        basic: base.11,
        hra: base.12,
        transport: base.13,
        other: base.14,
        ot_hours: base.15,
        ot_amount: base.16,
        variable_pay: base.17,
        reimbursement: base.18,
        arrears: base.19,
        lop: base.20,
        shift_penalty: base.21,
        lop_basic: base.22,
        lop_hra: base.23,
        lop_transport: base.24,
        pf: base.25,
        esi: base.26,
        tds: base.27,
        prof_tax: base.28,
        advance: base.29,
        lw_employee: base.30,
        adjustments_json: base.31,
        emp_name: base.32,
        emp_id: base.33,
        emp_email: base.34,
        emp_phone: base.35,
        emp_address: base.36,
        emp_city: base.37,
        emp_state: base.38,
        emp_postal: base.39,
        emp_account: base.40,
        emp_bank: base.41,
        emp_pan: base.42,
        emp_tax_regime: base.43,
        dept: base.44,
        designation: base.45,
        company_name: setting(conn, org_id, "company_name")
            .or_else(|| setting(conn, org_id, "app_name"))
            .unwrap_or_else(|| "Company".into()),
        company_address: setting(conn, org_id, "business_location")
            .or_else(|| setting(conn, org_id, "company_address")),
        company_phone: setting(conn, org_id, "company_phone")
            .or_else(|| setting(conn, org_id, "support_phone")),
        company_email: setting(conn, org_id, "company_email")
            .or_else(|| setting(conn, org_id, "mail_from_address"))
            .or_else(|| setting(conn, org_id, "support_email")),
        pan_number: setting(conn, org_id, "pan_number"),
        pf_number: setting(conn, org_id, "pf_number"),
    })
}

pub fn fmt_inr(n: f64) -> String {
    let sign = if n < 0.0 { "-" } else { "" };
    let abs = n.abs();
    let whole = abs.floor() as i64;
    let frac = ((abs - whole as f64) * 100.0).round() as i64;
    let s = whole.to_string();
    let mut out = String::new();
    let chars: Vec<char> = s.chars().collect();
    for (i, ch) in chars.iter().enumerate() {
        if i > 0 && (chars.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(*ch);
    }
    format!("{sign}₹{out}.{frac:02}")
}

fn row(label: &str, amount: f64, muted: bool) -> String {
    if amount.abs() < 0.005 {
        return String::new();
    }
    let cls = if muted { "muted" } else { "" };
    format!(
        "<tr class=\"{cls}\"><td>{label}</td><td class=\"num\">{}</td></tr>",
        fmt_inr(amount)
    )
}

pub fn render_payslip_html(data: &PayslipRenderData, for_print: bool) -> String {
    let month_label = MONTH_NAMES
        .get((data.month as usize).saturating_sub(1))
        .copied()
        .unwrap_or("Month");

    let adjustments: Vec<serde_json::Value> =
        serde_json::from_str(&data.adjustments_json).unwrap_or_default();
    let mut adj_rows = String::new();
    for adj in &adjustments {
        let label = adj.get("label").and_then(|v| v.as_str()).unwrap_or("Adjustment");
        let amount = adj.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
        if amount.abs() < 0.005 {
            continue;
        }
        let kind = adj.get("type").and_then(|v| v.as_str()).unwrap_or("deduction");
        let signed = if kind == "addition" { amount } else { -amount };
        adj_rows.push_str(&row(label, signed, false));
    }

    let emp_meta = [
        data.emp_id.as_ref().map(|id| format!("ID: {id}")),
        data.dept.as_ref().map(|d| d.clone()),
        data.designation.as_ref().map(|d| d.clone()),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" · ");

    let company_meta = [
        data.pan_number.as_ref().map(|p| format!("PAN: {p}")),
        data.pf_number.as_ref().map(|p| format!("PF: {p}")),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" · ");

    let print_btn = if for_print {
        r#"<div class="toolbar no-print">
  <button onclick="window.print()">Print / Save as PDF</button>
</div>"#
    } else {
        ""
    };

    let auto_print = if for_print {
        ""
    } else {
        ""
    };

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Payslip — {emp} — {month_label} {year}</title>
<style>
  :root {{
    --navy: #071b3a;
    --blue: #1e4a8a;
    --soft: #eef4fc;
    --border: #d8e3f3;
    --text: #0f172a;
    --muted: #64748b;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; padding: 24px; background: #f1f5f9; color: var(--text);
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
  }}
  .toolbar {{ margin-bottom: 16px; }}
  .toolbar button {{
    background: var(--navy); color: #fff; border: 0; border-radius: 10px;
    padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer;
  }}
  .payslip-sheet {{
    max-width: 820px; margin: 0 auto; background: #fff; border-radius: 16px;
    overflow: hidden; box-shadow: 0 20px 50px rgba(7,27,58,.12);
    border: 1px solid var(--border);
  }}
  .header {{
    background: linear-gradient(135deg, var(--navy), var(--blue));
    color: #fff; padding: 28px 32px;
  }}
  .header-top {{ display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; }}
  .company {{ font-size: 22px; font-weight: 700; letter-spacing: -.02em; }}
  .company-sub {{ margin-top: 6px; font-size: 12px; opacity: .85; line-height: 1.5; max-width: 360px; }}
  .badge {{
    background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.22);
    border-radius: 999px; padding: 8px 14px; font-size: 12px; font-weight: 600;
    white-space: nowrap;
  }}
  .hero {{
    margin-top: 22px; display: grid; grid-template-columns: 1.2fr .8fr; gap: 16px;
  }}
  .employee-card, .net-card {{
    background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.16);
    border-radius: 14px; padding: 16px 18px;
  }}
  .label {{ font-size: 11px; text-transform: uppercase; letter-spacing: .08em; opacity: .75; }}
  .employee-name {{ font-size: 20px; font-weight: 700; margin-top: 6px; }}
  .employee-meta {{ margin-top: 6px; font-size: 12px; opacity: .88; }}
  .net-amount {{ font-size: 30px; font-weight: 800; margin-top: 8px; }}
  .body {{ padding: 28px 32px 32px; }}
  .stats {{
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;
  }}
  .stat {{
    background: var(--soft); border: 1px solid var(--border); border-radius: 12px; padding: 14px;
  }}
  .stat .value {{ font-size: 22px; font-weight: 700; color: var(--navy); }}
  .stat .name {{ font-size: 11px; color: var(--muted); margin-top: 4px; text-transform: uppercase; letter-spacing: .06em; }}
  .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }}
  .panel {{
    border: 1px solid var(--border); border-radius: 14px; overflow: hidden;
  }}
  .panel h3 {{
    margin: 0; padding: 12px 16px; background: var(--soft); font-size: 13px;
    text-transform: uppercase; letter-spacing: .08em; color: var(--navy);
  }}
  table {{ width: 100%; border-collapse: collapse; }}
  td {{ padding: 10px 16px; border-top: 1px solid #edf2f7; font-size: 13px; }}
  td.num {{ text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }}
  tr.total td {{ background: #f8fbff; font-weight: 700; color: var(--navy); }}
  tr.muted td {{ color: var(--muted); font-size: 12px; }}
  .footer {{
    margin-top: 22px; padding-top: 16px; border-top: 1px dashed var(--border);
    display: flex; justify-content: space-between; gap: 16px; color: var(--muted); font-size: 11px;
  }}
  @media print {{
    body {{ background: #fff; padding: 0; }}
    .no-print {{ display: none !important; }}
    .payslip-sheet {{ box-shadow: none; border: 0; border-radius: 0; max-width: none; }}
    @page {{ size: A4; margin: 12mm; }}
  }}
</style>
</head>
<body>
{print_btn}
<article class="payslip-sheet">
  <header class="header">
    <div class="header-top">
      <div>
        <div class="company">{company}</div>
        <div class="company-sub">{company_addr}{company_meta}</div>
      </div>
      <div class="badge">Payslip · {month_label} {year}</div>
    </div>
    <div class="hero">
      <div class="employee-card">
        <div class="label">Employee</div>
        <div class="employee-name">{emp}</div>
        <div class="employee-meta">{emp_meta}</div>
      </div>
      <div class="net-card">
        <div class="label">Net Pay</div>
        <div class="net-amount">{net}</div>
        <div class="employee-meta">Status: {status} · #{id}</div>
      </div>
    </div>
  </header>
  <section class="body">
    <div class="stats">
      <div class="stat"><div class="value">{working}</div><div class="name">Working Days</div></div>
      <div class="stat"><div class="value">{present}</div><div class="name">Present</div></div>
      <div class="stat"><div class="value">{leave}</div><div class="name">Leave</div></div>
      <div class="stat"><div class="value">{holidays}</div><div class="name">Holidays</div></div>
    </div>
    <div class="grid">
      <div class="panel">
        <h3>Earnings</h3>
        <table>
          {earn_rows}
          <tr class="total"><td>Gross Salary</td><td class="num">{gross}</td></tr>
        </table>
      </div>
      <div class="panel">
        <h3>Deductions</h3>
        <table>
          {ded_rows}
          {adj_rows}
          <tr class="total"><td>Total Deductions</td><td class="num">{total_ded}</td></tr>
        </table>
      </div>
    </div>
    <div class="footer">
      <span>Computer-generated payslip. No signature required.</span>
      <span>Generated by Raintech HRM</span>
    </div>
  </section>
</article>
{auto_print}
</body>
</html>"#,
        company = html_escape(&data.company_name),
        company_addr = data
            .company_address
            .as_ref()
            .map(|a| format!("{}<br/>", html_escape(a)))
            .unwrap_or_default(),
        company_meta = html_escape(&company_meta),
        emp = html_escape(&data.emp_name),
        emp_meta = html_escape(&emp_meta),
        month_label = month_label,
        year = data.year,
        status = html_escape(&data.status),
        id = data.id,
        net = fmt_inr(data.net),
        working = data.working,
        present = data.present,
        leave = data.leave,
        holidays = data.holidays,
        earn_rows = format!(
            "{}{}{}{}{}{}{}{}",
            row("Basic Salary", data.basic, false),
            row("House Rent Allowance", data.hra, false),
            row("Conveyance / Transport", data.transport, false),
            row("Other Allowances", data.other, false),
            if data.ot_hours > 0.0 {
                row(
                    &format!("Overtime ({:.1} hrs)", data.ot_hours),
                    data.ot_amount,
                    false,
                )
            } else {
                row("Overtime", data.ot_amount, false)
            },
            row("Variable Pay", data.variable_pay, false),
            row("Reimbursements", data.reimbursement, false),
            row("Salary Arrears", data.arrears, false),
        ),
        ded_rows = format!(
            "{}{}{}{}{}{}{}{}{}{}",
            row("LOP — Basic", data.lop_basic, true),
            row("LOP — HRA", data.lop_hra, true),
            row("LOP — Conveyance", data.lop_transport, true),
            row("Loss of Pay (Total)", data.lop, false),
            row("Late / Early Penalty", data.shift_penalty, false),
            row("EPF (Employee)", data.pf, false),
            row("ESI (Employee)", data.esi, false),
            row("Professional Tax", data.prof_tax, false),
            row("Labour Welfare", data.lw_employee, false),
            row("Advance Recovery", data.advance, false),
        ) + &row("TDS", data.tds, false),
        adj_rows = adj_rows,
        gross = fmt_inr(data.gross),
        total_ded = fmt_inr(data.total_ded),
        print_btn = print_btn,
        auto_print = auto_print,
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub fn payslip_filename(data: &PayslipRenderData) -> String {
    let month_label = MONTH_NAMES
        .get((data.month as usize).saturating_sub(1))
        .copied()
        .unwrap_or("Month");
    let safe_name: String = data
        .emp_name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    format!(
        "Payslip_{}_{}_{}_{}.pdf",
        safe_name, month_label, data.year, data.id
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn html_escape_prevents_xss() {
        assert!(html_escape("<script>").contains("&lt;"));
        assert!(!html_escape("<script>").contains('<'));
    }

    #[test]
    fn render_includes_overtime_row() {
        let data = PayslipRenderData {
            id: 1,
            month: 6,
            year: 2026,
            gross: 50_000.0,
            total_ded: 5_000.0,
            net: 45_000.0,
            status: "generated".into(),
            working: 22,
            present: 20,
            leave: 0,
            holidays: 0,
            basic: 20_000.0,
            hra: 8_000.0,
            transport: 2_000.0,
            other: 5_000.0,
            ot_hours: 10.0,
            ot_amount: 15_000.0,
            variable_pay: 0.0,
            reimbursement: 0.0,
            arrears: 0.0,
            lop: 0.0,
            shift_penalty: 0.0,
            lop_basic: 0.0,
            lop_hra: 0.0,
            lop_transport: 0.0,
            pf: 0.0,
            esi: 0.0,
            tds: 0.0,
            prof_tax: 0.0,
            advance: 0.0,
            lw_employee: 0.0,
            adjustments_json: "[]".into(),
            emp_name: "Test User".into(),
            emp_id: None,
            emp_email: None,
            emp_phone: None,
            emp_address: None,
            emp_city: None,
            emp_state: None,
            emp_postal: None,
            emp_account: None,
            emp_bank: None,
            emp_pan: None,
            emp_tax_regime: None,
            dept: None,
            designation: None,
            company_name: "Acme".into(),
            company_address: None,
            company_phone: None,
            company_email: None,
            pan_number: None,
            pf_number: None,
        };
        let html = render_payslip_html(&data, false);
        assert!(html.contains("Overtime"));
        assert!(html.contains("15,000.00") || html.contains("15000"));
    }

    #[test]
    fn fmt_inr_formats_currency() {
        assert!(fmt_inr(1234.5).contains("₹"));
        assert!(fmt_inr(1234.5).contains("1,234.50"));
    }
}
