//! A4 payslip PDF — Vertex42-style layout (genpdf).

use genpdf::elements::{
    Break, FrameCellDecorator, FramedElement, LinearLayout, Paragraph, TableLayout,
};
use genpdf::style::{Color, Style};
use genpdf::{Alignment, Element, Margins, PaperSize, SimplePageDecorator};
use std::io::Cursor;

use crate::payslip_render::{fmt_inr, PayslipRenderData, MONTH_NAMES};

fn font_family() -> Result<genpdf::fonts::FontFamily<genpdf::fonts::FontData>, String> {
    let regular = genpdf::fonts::FontData::new(
        include_bytes!("../assets/fonts/Arial.ttf").to_vec(),
        None,
    )
    .map_err(|e| format!("Failed to load font: {e}"))?;
    let bold = genpdf::fonts::FontData::new(
        include_bytes!("../assets/fonts/Arial-Bold.ttf").to_vec(),
        None,
    )
    .map_err(|e| format!("Failed to load bold font: {e}"))?;
    Ok(genpdf::fonts::FontFamily {
        regular: regular.clone(),
        bold: bold.clone(),
        italic: regular,
        bold_italic: bold,
    })
}

fn month_label(month: i32) -> &'static str {
    MONTH_NAMES
        .get((month as usize).saturating_sub(1))
        .copied()
        .unwrap_or("Month")
}

/// Template blue ≈ #4A76A8
fn blue() -> Color {
    Color::Rgb(74, 118, 168)
}

fn dark() -> Color {
    Color::Rgb(30, 30, 30)
}

fn muted() -> Color {
    Color::Rgb(90, 90, 90)
}

fn grey() -> Color {
    Color::Rgb(120, 120, 120)
}

fn dash() -> &'static str {
    "—"
}

fn cell_left(text: &str, style: Style) -> impl Element {
    Paragraph::new(text)
        .styled(style)
        .padded(Margins::trbl(3, 4, 3, 4))
}

fn cell_right(text: &str, style: Style) -> impl Element {
    Paragraph::new(text)
        .aligned(Alignment::Right)
        .styled(style)
        .padded(Margins::trbl(3, 4, 3, 4))
}

fn cell_center(text: &str, style: Style) -> impl Element {
    Paragraph::new(text)
        .aligned(Alignment::Center)
        .styled(style)
        .padded(Margins::trbl(3, 4, 3, 4))
}

/// genpdf cannot fill cell backgrounds; use bold blue labels that read as section headers.
fn section_banner(title: &str) -> impl Element {
    FramedElement::new(
        Paragraph::new(title)
            .aligned(Alignment::Left)
            .styled(Style::new().bold().with_font_size(10).with_color(blue()))
            .padded(Margins::trbl(5, 6, 5, 6)),
    )
}

fn pay_date(data: &PayslipRenderData) -> String {
    // Last calendar day of the pay month (common payslip convention).
    let days = match data.month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            let y = data.year;
            if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 {
                29
            } else {
                28
            }
        }
        _ => 28,
    };
    format!("{}/{}/{}", days, data.month, data.year)
}

fn period_code(data: &PayslipRenderData) -> String {
    format!("M{:02}", data.month)
}

fn emp_address_line(data: &PayslipRenderData) -> Option<String> {
    let mut parts: Vec<&str> = Vec::new();
    if let Some(a) = data.emp_address.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        parts.push(a);
    }
    if let Some(c) = data.emp_city.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        parts.push(c);
    }
    if let Some(s) = data.emp_state.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        parts.push(s);
    }
    if let Some(p) = data.emp_postal.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        parts.push(p);
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(", "))
    }
}

fn payment_method(data: &PayslipRenderData) -> String {
    if data
        .emp_account
        .as_deref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
    {
        let bank = data
            .emp_bank
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Bank transfer");
        format!("Payment Method: {bank}")
    } else {
        "Payment Method: —".into()
    }
}

struct EarnLine {
    label: String,
    hours: String,
    rate: String,
    current: f64,
}

fn round2(n: f64) -> f64 {
    (n * 100.0).round() / 100.0
}

/// Build earnings that sum to `gross`.
///
/// Payslip rows store component amounts *after* LOP, while `gross_salary` is the
/// pre-LOP structure total plus extras (OT / variable / etc.). LOP itself is a
/// deduction. For the PDF we restore full earning lines so CURRENT totals match GROSS PAY.
fn earning_lines(data: &PayslipRenderData) -> Vec<EarnLine> {
    let mut lines: Vec<EarnLine> = Vec::new();

    let push = |lines: &mut Vec<EarnLine>, label: &str, hours: String, rate: String, amount: f64| {
        if amount.abs() >= 0.005 {
            lines.push(EarnLine {
                label: label.into(),
                hours,
                rate,
                current: amount,
            });
        }
    };

    let full_basic = round2(data.basic + data.lop_basic);
    let full_hra = round2(data.hra + data.lop_hra);
    let full_transport = round2(data.transport + data.lop_transport);
    let extras = round2(
        data.ot_amount + data.variable_pay + data.reimbursement + data.arrears,
    );
    let structure_gross = round2((data.gross - extras).max(0.0));
    // Residual covers "other allowances" and any LOP portion not split into basic/hra/transport.
    let full_other = round2((structure_gross - full_basic - full_hra - full_transport).max(0.0));

    let days_label = if data.working > 0 {
        format!("{}d", data.working)
    } else {
        dash().into()
    };

    push(&mut lines, "Basic Pay", days_label, dash().into(), full_basic);
    push(
        &mut lines,
        "House Rent Allowance",
        dash().into(),
        dash().into(),
        full_hra,
    );
    push(
        &mut lines,
        "Conveyance / Transport",
        dash().into(),
        dash().into(),
        full_transport,
    );
    push(
        &mut lines,
        "Other Allowances",
        dash().into(),
        dash().into(),
        full_other,
    );

    if data.ot_amount.abs() >= 0.005 {
        let hours = if data.ot_hours > 0.005 {
            format!("{:.2}", data.ot_hours)
        } else {
            dash().into()
        };
        let rate = if data.ot_hours > 0.005 {
            fmt_inr(data.ot_amount / data.ot_hours)
        } else {
            dash().into()
        };
        push(&mut lines, "Overtime Pay", hours, rate, data.ot_amount);
    }

    push(
        &mut lines,
        "Commission / Bonus",
        dash().into(),
        dash().into(),
        data.variable_pay,
    );
    push(
        &mut lines,
        "Reimbursements / Expenses",
        dash().into(),
        dash().into(),
        data.reimbursement,
    );
    push(
        &mut lines,
        "Salary Arrears",
        dash().into(),
        dash().into(),
        data.arrears,
    );

    let lined: f64 = lines.iter().map(|l| l.current).sum();
    let gap = round2(data.gross - lined);
    if gap.abs() >= 0.005 {
        push(
            &mut lines,
            "Other Earnings",
            dash().into(),
            dash().into(),
            gap,
        );
    }

    if lines.is_empty() && data.gross.abs() >= 0.005 {
        push(
            &mut lines,
            "Gross Salary",
            dash().into(),
            dash().into(),
            data.gross,
        );
    }

    lines
}

fn deduction_lines(data: &PayslipRenderData) -> Vec<(String, f64)> {
    let mut rows: Vec<(String, f64)> = vec![
        ("Loss of Pay".into(), data.lop),
        ("Late / Early Penalty".into(), data.shift_penalty),
        ("EPF (Employee)".into(), data.pf),
        ("ESI (Employee)".into(), data.esi),
        ("Professional Tax".into(), data.prof_tax),
        ("Labour Welfare".into(), data.lw_employee),
        ("Advance Recovery".into(), data.advance),
        ("TDS / Income Tax".into(), data.tds),
    ];

    let adjustments: Vec<serde_json::Value> =
        serde_json::from_str(&data.adjustments_json).unwrap_or_default();
    for adj in &adjustments {
        let label = adj
            .get("label")
            .and_then(|v| v.as_str())
            .unwrap_or("Adjustment")
            .to_string();
        let amount = adj.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
        if amount.abs() < 0.005 {
            continue;
        }
        let kind = adj.get("type").and_then(|v| v.as_str()).unwrap_or("deduction");
        let signed = if kind == "addition" { -amount } else { amount };
        rows.push((label, signed));
    }

    rows.retain(|(_, a)| a.abs() >= 0.005);
    rows
}

fn push_meta_pair(table: &mut TableLayout, headers: &[&str], values: &[&str]) {
    let mut hdr = table.row();
    for h in headers {
        hdr.push_element(cell_center(
            h,
            Style::new().bold().with_font_size(7).with_color(blue()),
        ));
    }
    let _ = hdr.push();

    let mut val = table.row();
    for v in values {
        val.push_element(cell_center(
            v,
            Style::new().with_font_size(9).with_color(dark()),
        ));
    }
    let _ = val.push();
}

/// Render payslip as A4 PDF bytes (Vertex42-style).
pub fn render_payslip_pdf(data: &PayslipRenderData) -> Result<Vec<u8>, String> {
    let fonts = font_family()?;
    let period = format!("{} {}", month_label(data.month), data.year);

    let mut doc = genpdf::Document::new(fonts);
    doc.set_title(format!("Payslip — {} — {}", data.emp_name, period));
    doc.set_paper_size(PaperSize::A4);
    doc.set_minimal_conformance();

    let mut decorator = SimplePageDecorator::new();
    decorator.set_margins(Margins::trbl(16, 18, 16, 18));
    doc.set_page_decorator(decorator);

    // ── Header: company left, PAYSLIP right ─────────────────────────────
    let mut header = TableLayout::new(vec![3, 2]);
    let mut header_row = header.row();

    let mut company = LinearLayout::vertical().element(
        Paragraph::new(&data.company_name)
            .styled(Style::new().bold().with_font_size(20).with_color(blue()))
            .padded(Margins::trbl(0, 0, 2, 0)),
    );
    if let Some(addr) = &data.company_address {
        company = company.element(
            Paragraph::new(addr)
                .styled(Style::new().with_font_size(9).with_color(dark())),
        );
    }
    let mut contact_bits: Vec<String> = Vec::new();
    if let Some(p) = &data.company_phone {
        contact_bits.push(format!("Phone: {p}"));
    }
    if let Some(e) = &data.company_email {
        contact_bits.push(format!("Email: {e}"));
    }
    if !contact_bits.is_empty() {
        company = company.element(
            Paragraph::new(contact_bits.join(", "))
                .styled(Style::new().with_font_size(8).with_color(muted()))
                .padded(Margins::trbl(2, 0, 0, 0)),
        );
    }

    let title = LinearLayout::vertical().element(
        Paragraph::new("PAYSLIP")
            .aligned(Alignment::Right)
            .styled(Style::new().bold().with_font_size(28).with_color(blue()))
            .padded(Margins::trbl(4, 0, 0, 0)),
    );

    header_row.push_element(company);
    header_row.push_element(title);
    let _ = header_row.push();
    doc.push(header);
    doc.push(Break::new(0.8));

    // ── Employee info + pay meta ────────────────────────────────────────
    let mut top = TableLayout::new(vec![5, 6]);
    let mut top_row = top.row();

    let mut emp_block = LinearLayout::vertical()
        .element(section_banner("EMPLOYEE INFORMATION"))
        .element(
            Paragraph::new(&data.emp_name)
                .styled(Style::new().bold().with_font_size(12).with_color(dark()))
                .padded(Margins::trbl(6, 4, 2, 4)),
        );
    if let Some(addr) = emp_address_line(data) {
        emp_block = emp_block.element(
            Paragraph::new(addr)
                .styled(Style::new().with_font_size(9).with_color(muted()))
                .padded(Margins::trbl(0, 4, 1, 4)),
        );
    }
    if let Some(phone) = &data.emp_phone {
        emp_block = emp_block.element(
            Paragraph::new(format!("Phone: {phone}"))
                .styled(Style::new().with_font_size(9).with_color(muted()))
                .padded(Margins::trbl(0, 4, 1, 4)),
        );
    }
    if let Some(email) = &data.emp_email {
        emp_block = emp_block.element(
            Paragraph::new(email)
                .styled(Style::new().with_font_size(9).with_color(muted()))
                .padded(Margins::trbl(0, 4, 2, 4)),
        );
    }
    if let Some(dept) = &data.dept {
        emp_block = emp_block.element(
            Paragraph::new(format!(
                "Department: {dept}{}",
                data.designation
                    .as_ref()
                    .map(|d| format!("  ·  {d}"))
                    .unwrap_or_default()
            ))
            .styled(Style::new().with_font_size(8).with_color(grey()))
            .padded(Margins::trbl(2, 4, 2, 4)),
        );
    }

    let mut meta = TableLayout::new(vec![1, 1, 1, 1]);
    meta.set_cell_decorator(FrameCellDecorator::new(true, true, false));
    push_meta_pair(
        &mut meta,
        &["PAY DATE", "PAY TYPE", "PERIOD", "PAYROLL #"],
        &[
            &pay_date(data),
            "Monthly",
            &period_code(data),
            &format!("PS-{:05}", data.id),
        ],
    );

    let mut meta2 = TableLayout::new(vec![1, 1, 1, 1]);
    meta2.set_cell_decorator(FrameCellDecorator::new(true, true, false));
    let emp_id = data.emp_id.clone().unwrap_or_else(|| dash().into());
    let pan = data
        .emp_pan
        .clone()
        .or_else(|| data.pan_number.clone())
        .unwrap_or_else(|| dash().into());
    let tax = data
        .emp_tax_regime
        .as_deref()
        .map(|t| {
            if t.eq_ignore_ascii_case("old") {
                "Old regime"
            } else {
                "New regime"
            }
        })
        .unwrap_or("—");
    push_meta_pair(
        &mut meta2,
        &["EMPLOYEE ID", "PAN", "TAX REGIME", "ATTENDANCE"],
        &[
            &emp_id,
            &pan,
            tax,
            &format!("{} / {} days", data.present, data.working),
        ],
    );

    let pay_side = LinearLayout::vertical()
        .element(meta)
        .element(Break::new(0.35))
        .element(meta2)
        .element(
            Paragraph::new(payment_method(data))
                .styled(Style::new().with_font_size(9).with_color(dark()))
                .padded(Margins::trbl(6, 2, 0, 2)),
        );

    top_row.push_element(emp_block.padded(Margins::trbl(0, 8, 0, 0)));
    top_row.push_element(pay_side);
    let _ = top_row.push();
    doc.push(top);
    doc.push(Break::new(0.9));

    // ── Earnings table ──────────────────────────────────────────────────
    let earns = earning_lines(data);
    let mut earn_table = TableLayout::new(vec![5, 2, 3, 3, 3]);
    earn_table.set_cell_decorator(FrameCellDecorator::new(true, true, false));

    {
        let mut row = earn_table.row();
        let hs = Style::new().bold().with_font_size(8).with_color(blue());
        row.push_element(cell_left("EARNINGS", hs));
        row.push_element(cell_center("HOURS", hs));
        row.push_element(cell_right("RATE", hs));
        row.push_element(cell_right("CURRENT", hs));
        row.push_element(cell_right("YTD", hs));
        let _ = row.push();
    }

    let body = Style::new().with_font_size(9).with_color(dark());
    for line in &earns {
        let mut row = earn_table.row();
        row.push_element(cell_left(&line.label, body));
        row.push_element(cell_center(&line.hours, body));
        row.push_element(cell_right(&line.rate, body));
        row.push_element(cell_right(&fmt_inr(line.current), body));
        row.push_element(cell_right(dash(), body));
        let _ = row.push();
    }

    {
        let mut row = earn_table.row();
        let bold = Style::new().bold().with_font_size(10).with_color(dark());
        row.push_element(cell_left("GROSS PAY", bold));
        row.push_element(cell_center("", bold));
        row.push_element(cell_right("", bold));
        row.push_element(cell_right(&fmt_inr(data.gross), bold));
        row.push_element(cell_right(dash(), bold));
        let _ = row.push();
    }

    doc.push(earn_table);
    doc.push(Break::new(0.7));

    // ── Deductions table ────────────────────────────────────────────────
    let deds = deduction_lines(data);
    let mut ded_table = TableLayout::new(vec![8, 3, 3]);
    ded_table.set_cell_decorator(FrameCellDecorator::new(true, true, false));

    {
        let mut row = ded_table.row();
        let hs = Style::new().bold().with_font_size(8).with_color(blue());
        row.push_element(cell_left("DEDUCTIONS", hs));
        row.push_element(cell_right("CURRENT", hs));
        row.push_element(cell_right("YTD", hs));
        let _ = row.push();
    }

    for (label, amount) in &deds {
        let mut row = ded_table.row();
        row.push_element(cell_left(label, body));
        row.push_element(cell_right(&fmt_inr(*amount), body));
        row.push_element(cell_right(dash(), body));
        let _ = row.push();
    }

    {
        let mut row = ded_table.row();
        let bold = Style::new().bold().with_font_size(10).with_color(dark());
        row.push_element(cell_left("TOTAL DEDUCTIONS", bold));
        row.push_element(cell_right(&fmt_inr(data.total_ded), bold));
        row.push_element(cell_right(dash(), bold));
        let _ = row.push();
    }

    doc.push(ded_table);
    doc.push(Break::new(0.5));

    // ── Net pay bar ─────────────────────────────────────────────────────
    let mut net_table = TableLayout::new(vec![8, 3, 3]);
    net_table.set_cell_decorator(FrameCellDecorator::new(true, true, false));
    {
        let mut row = net_table.row();
        let bold = Style::new().bold().with_font_size(12).with_color(dark());
        row.push_element(cell_left("NET PAY", bold));
        row.push_element(cell_right(&fmt_inr(data.net), bold));
        row.push_element(cell_right(dash(), bold));
        let _ = row.push();
    }
    doc.push(net_table);

    doc.push(Break::new(1.2));
    doc.push(
        Paragraph::new(
            "If you have any questions about this payslip, please contact your HR / payroll team.",
        )
        .aligned(Alignment::Center)
        .styled(Style::new().with_font_size(8).with_color(muted())),
    );
    if let Some(email) = &data.company_email {
        doc.push(
            Paragraph::new(email)
                .aligned(Alignment::Center)
                .styled(Style::new().with_font_size(8).with_color(blue()))
                .padded(Margins::trbl(2, 0, 0, 0)),
        );
    }
    doc.push(
        Paragraph::new("Computer-generated payslip — no signature required.")
            .aligned(Alignment::Center)
            .styled(Style::new().with_font_size(7).with_color(grey()))
            .padded(Margins::trbl(8, 0, 0, 0)),
    );

    let mut buffer = Cursor::new(Vec::new());
    doc.render(&mut buffer)
        .map_err(|e| format!("PDF render failed: {e}"))?;
    Ok(buffer.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::payslip_render::PayslipRenderData;

    #[test]
    fn pdf_bytes_start_with_pdf_header() {
        let data = PayslipRenderData {
            id: 37,
            month: 6,
            year: 2026,
            gross: 53_400.0,
            total_ded: 5_401.0,
            net: 47_999.0,
            status: "generated".into(),
            working: 22,
            present: 20,
            leave: 1,
            holidays: 1,
            basic: 30_000.0,
            hra: 12_000.0,
            transport: 1_600.0,
            other: 5_000.0,
            ot_hours: 5.0,
            ot_amount: 2_800.0,
            variable_pay: 2_000.0,
            reimbursement: 0.0,
            arrears: 0.0,
            lop: 1_200.0,
            shift_penalty: 0.0,
            lop_basic: 0.0,
            lop_hra: 0.0,
            lop_transport: 0.0,
            pf: 1_800.0,
            esi: 0.0,
            tds: 2_000.0,
            prof_tax: 200.0,
            advance: 201.0,
            lw_employee: 0.0,
            adjustments_json: "[]".into(),
            emp_name: "Demo Employee 12".into(),
            emp_id: Some("EMP012".into()),
            emp_email: Some("demo@example.com".into()),
            emp_phone: Some("+91 98765 43210".into()),
            emp_address: Some("12 MG Road".into()),
            emp_city: Some("Bengaluru".into()),
            emp_state: Some("Karnataka".into()),
            emp_postal: Some("560001".into()),
            emp_account: Some("1234567890".into()),
            emp_bank: Some("HDFC Bank".into()),
            emp_pan: Some("ABCDE1234F".into()),
            emp_tax_regime: Some("new".into()),
            dept: Some("Operations".into()),
            designation: Some("Associate".into()),
            company_name: "Raintech Pvt Ltd".into(),
            company_address: Some("Bengaluru, Karnataka".into()),
            company_phone: Some("+91 80 0000 0000".into()),
            company_email: Some("hr@raintech.in".into()),
            pan_number: None,
            pf_number: None,
        };
        let pdf = render_payslip_pdf(&data).expect("pdf");
        assert!(pdf.starts_with(b"%PDF"));
        assert!(pdf.len() > 800);
    }

    #[test]
    fn earning_lines_sum_to_gross_when_components_are_after_lop() {
        // Mirrors production storage: component columns after LOP, gross before LOP + extras.
        let data = PayslipRenderData {
            id: 1,
            month: 7,
            year: 2026,
            gross: 33_300.0,
            total_ded: 27_096.77,
            net: 6_203.23,
            status: "generated".into(),
            working: 22,
            present: 1,
            leave: 0,
            holidays: 0,
            basic: 2_903.23,
            hra: 0.0,
            transport: 0.0,
            other: 0.0,
            ot_hours: 0.0,
            ot_amount: 0.0,
            variable_pay: 3_300.0,
            reimbursement: 0.0,
            arrears: 0.0,
            lop: 27_096.77,
            shift_penalty: 0.0,
            lop_basic: 27_096.77,
            lop_hra: 0.0,
            lop_transport: 0.0,
            pf: 0.0,
            esi: 0.0,
            tds: 0.0,
            prof_tax: 0.0,
            advance: 0.0,
            lw_employee: 0.0,
            adjustments_json: "[]".into(),
            emp_name: "SerFinal User".into(),
            emp_id: Some("EMP001".into()),
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
        let lines = earning_lines(&data);
        let sum: f64 = lines.iter().map(|l| l.current).sum();
        assert!(
            (sum - data.gross).abs() < 0.02,
            "earnings {sum} should equal gross {}",
            data.gross
        );
        let basic = lines.iter().find(|l| l.label == "Basic Pay").unwrap();
        assert!((basic.current - 30_000.0).abs() < 0.02);
    }
}
