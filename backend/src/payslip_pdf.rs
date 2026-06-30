//! A4 payslip PDF — clean corporate layout (genpdf).

use genpdf::elements::{Break, LinearLayout, Paragraph, TableLayout};
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

fn navy() -> Color {
    Color::Rgb(7, 27, 58)
}

fn slate() -> Color {
    Color::Rgb(100, 116, 139)
}

fn rule_line() -> impl Element {
    Paragraph::new(" ")
        .padded(Margins::trbl(0, 0, 3, 0))
}

fn section_heading(title: &str) -> impl Element {
    Paragraph::new(title)
        .styled(Style::new().bold().with_font_size(10).with_color(navy()))
        .padded(Margins::trbl(10, 0, 4, 0))
}

fn push_row(table: &mut TableLayout, label: &str, amount: f64, bold: bool) {
    let label_style = if bold {
        Style::new().bold().with_font_size(10).with_color(navy())
    } else {
        Style::new().with_font_size(10).with_color(Color::Rgb(30, 41, 59))
    };
    let amount_style = if bold {
        Style::new().bold().with_font_size(11).with_color(navy())
    } else {
        Style::new().with_font_size(10).with_color(Color::Rgb(30, 41, 59))
    };
    let mut row = table.row();
    row.push_element(
        Paragraph::new(label)
            .styled(label_style)
            .padded(Margins::trbl(4, 0, 4, 4)),
    );
    row.push_element(
        Paragraph::new(fmt_inr(amount))
            .aligned(Alignment::Right)
            .styled(amount_style)
            .padded(Margins::trbl(4, 12, 4, 4)),
    );
    let _ = row.push();
}

fn push_row_if(table: &mut TableLayout, label: &str, amount: f64) {
    if amount.abs() >= 0.005 {
        push_row(table, label, amount, false);
    }
}

fn earning_rows(data: &PayslipRenderData) -> Vec<(&'static str, f64)> {
    let rows = vec![
        ("Basic salary", data.basic),
        ("House rent allowance", data.hra),
        ("Conveyance / transport", data.transport),
        ("Other allowances", data.other),
        ("Overtime", data.ot_amount),
        ("Variable pay", data.variable_pay),
        ("Reimbursements", data.reimbursement),
        ("Salary arrears", data.arrears),
    ];
    let has_detail = rows.iter().any(|(_, a)| a.abs() >= 0.005);
    if has_detail {
        rows
    } else if data.gross.abs() >= 0.005 {
        vec![("Gross salary", data.gross)]
    } else {
        vec![]
    }
}

fn deduction_rows(data: &PayslipRenderData) -> Vec<(String, f64)> {
    let mut rows: Vec<(String, f64)> = vec![
        ("Loss of pay".into(), data.lop),
        ("Late / early penalty".into(), data.shift_penalty),
        ("EPF (employee)".into(), data.pf),
        ("ESI (employee)".into(), data.esi),
        ("Professional tax".into(), data.prof_tax),
        ("Labour welfare".into(), data.lw_employee),
        ("Advance recovery".into(), data.advance),
        ("TDS".into(), data.tds),
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

/// Render payslip as A4 PDF bytes.
pub fn render_payslip_pdf(data: &PayslipRenderData) -> Result<Vec<u8>, String> {
    let fonts = font_family()?;
    let period = format!("{} {}", month_label(data.month), data.year);

    let mut doc = genpdf::Document::new(fonts);
    doc.set_title(format!("Payslip — {} — {}", data.emp_name, period));
    doc.set_paper_size(PaperSize::A4);
    doc.set_minimal_conformance();

    let mut decorator = SimplePageDecorator::new();
    decorator.set_margins(Margins::all(18));
    doc.set_page_decorator(decorator);

    // ── Header ──────────────────────────────────────────────────────────
    let mut header = TableLayout::new(vec![3, 2]);
    let mut header_row = header.row();

    let mut left = LinearLayout::vertical().element(
        Paragraph::new(&data.company_name)
            .styled(Style::new().bold().with_font_size(18).with_color(navy()))
            .padded(Margins::trbl(4, 0, 2, 0)),
    );
    if let Some(addr) = &data.company_address {
        left = left.element(
            Paragraph::new(addr)
                .styled(Style::new().with_font_size(9).with_color(slate())),
        );
    }
    let mut meta = Vec::new();
    if let Some(pan) = &data.pan_number {
        meta.push(format!("PAN {pan}"));
    }
    if let Some(pf) = &data.pf_number {
        meta.push(format!("PF {pf}"));
    }
    if !meta.is_empty() {
        left = left.element(
            Paragraph::new(meta.join("  ·  "))
                .styled(Style::new().with_font_size(8).with_color(slate()))
                .padded(Margins::trbl(2, 0, 0, 0)),
        );
    }

    let right = LinearLayout::vertical()
        .element(
            Paragraph::new("Payslip")
                .aligned(Alignment::Right)
                .styled(Style::new().bold().with_font_size(10).with_color(slate())),
        )
        .element(
            Paragraph::new(&period)
                .aligned(Alignment::Right)
                .styled(Style::new().bold().with_font_size(14).with_color(navy())),
        )
        .element(
            Paragraph::new(format!("Reference  PS-{:05}", data.id))
                .aligned(Alignment::Right)
                .styled(Style::new().with_font_size(8).with_color(slate()))
                .padded(Margins::trbl(2, 0, 4, 0)),
        );

    header_row.push_element(left);
    header_row.push_element(right);
    let _ = header_row.push();

    doc.push(header);
    doc.push(rule_line());
    doc.push(Break::new(0.6));

    // ── Employee + net pay ────────────────────────────────────────────
    let mut emp_info = vec![data.emp_name.clone()];
    if let Some(id) = &data.emp_id {
        emp_info.push(format!("ID {id}"));
    }
    if let Some(d) = &data.dept {
        emp_info.push(d.clone());
    }
    if let Some(d) = &data.designation {
        emp_info.push(d.clone());
    }

    let mut summary = TableLayout::new(vec![3, 2]);
    let mut summary_row = summary.row();
    summary_row.push_element(
        LinearLayout::vertical()
            .element(
                Paragraph::new("Employee")
                    .styled(Style::new().with_font_size(8).bold().with_color(slate())),
            )
            .element(
                Paragraph::new(emp_info.join("  ·  "))
                    .styled(Style::new().with_font_size(11).with_color(Color::Rgb(30, 41, 59)))
                    .padded(Margins::trbl(2, 0, 4, 0)),
            ),
    );
    summary_row.push_element(
        LinearLayout::vertical()
            .element(
                Paragraph::new("Net pay")
                    .aligned(Alignment::Right)
                    .styled(Style::new().with_font_size(8).bold().with_color(slate())),
            )
            .element(
                Paragraph::new(fmt_inr(data.net))
                    .aligned(Alignment::Right)
                    .styled(Style::new().bold().with_font_size(20).with_color(navy()))
                    .padded(Margins::trbl(2, 4, 4, 4)),
            ),
    );
    let _ = summary_row.push();
    doc.push(summary);
    doc.push(rule_line());

    // ── Attendance ──────────────────────────────────────────────────────
    let mut att = TableLayout::new(vec![1, 1, 1, 1]);
    let mut att_row = att.row();
    for (label, val) in [
        ("Working days", data.working),
        ("Present", data.present),
        ("Leave", data.leave),
        ("Holidays", data.holidays),
    ] {
        att_row.push_element(
            LinearLayout::vertical()
                .element(
                    Paragraph::new(label)
                        .aligned(Alignment::Center)
                        .styled(Style::new().with_font_size(8).with_color(slate())),
                )
                .element(
                    Paragraph::new(val.to_string())
                        .aligned(Alignment::Center)
                        .styled(Style::new().bold().with_font_size(12).with_color(navy()))
                        .padded(Margins::trbl(2, 0, 6, 0)),
                ),
        );
    }
    let _ = att_row.push();
    doc.push(att);
    doc.push(rule_line());

    // ── Earnings (stacked, no side-by-side boxes) ───────────────────────
    let earn = earning_rows(data);
    if !earn.is_empty() {
        let mut earn_table = TableLayout::new(vec![5, 2]);
        for (label, amount) in &earn {
            push_row_if(&mut earn_table, label, *amount);
        }
        if earn.len() > 1 || earn[0].0 != "Gross salary" {
            push_row(&mut earn_table, "Gross salary", data.gross, true);
        }
        doc.push(
            LinearLayout::vertical()
                .element(section_heading("Earnings"))
                .element(earn_table),
        );
    }

    // ── Deductions ──────────────────────────────────────────────────────
    let ded = deduction_rows(data);
    if !ded.is_empty() || data.total_ded.abs() >= 0.005 {
        let mut ded_table = TableLayout::new(vec![5, 2]);
        for (label, amount) in &ded {
            push_row_if(&mut ded_table, label, *amount);
        }
        push_row(&mut ded_table, "Total deductions", data.total_ded, true);
        doc.push(
            LinearLayout::vertical()
                .element(section_heading("Deductions"))
                .element(ded_table),
        );
    }

    doc.push(Break::new(1.0));
    doc.push(rule_line());
    doc.push(
        Paragraph::new("Computer-generated payslip — no signature required.")
            .aligned(Alignment::Center)
            .styled(Style::new().with_font_size(8).with_color(slate()))
            .padded(Margins::trbl(4, 0, 2, 0)),
    );
    doc.push(
        Paragraph::new("Raintech HRM")
            .aligned(Alignment::Center)
            .styled(Style::new().with_font_size(8).bold().with_color(navy())),
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
            total_ded: 53_401.0,
            net: 0.0,
            status: "generated".into(),
            working: 22,
            present: 0,
            leave: 0,
            holidays: 0,
            basic: 0.0,
            hra: 0.0,
            transport: 0.0,
            other: 0.0,
            ot_hours: 0.0,
            ot_amount: 0.0,
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
            prof_tax: 1.0,
            advance: 0.0,
            lw_employee: 0.0,
            adjustments_json: "[]".into(),
            emp_name: "Demo Employee 12".into(),
            emp_id: None,
            dept: Some("Operations".into()),
            designation: None,
            company_name: "Raintech Pvt Ltd".into(),
            company_address: Some("Bangalore".into()),
            pan_number: None,
            pf_number: None,
        };
        let pdf = render_payslip_pdf(&data).expect("pdf");
        assert!(pdf.starts_with(b"%PDF"));
        assert!(pdf.len() > 800);
    }
}
