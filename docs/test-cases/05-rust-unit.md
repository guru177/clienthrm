# Rust Unit Test Cases

Generated: 2026-06-19 16:30

Run: `cd backend && cargo test`

Total: **29** tests

| Location | Test function |
|----------|---------------|
| `db\dialect.rs` | `converts_placeholders` |
| `db\dialect.rs` | `does_not_touch_identifier_suffix` |
| `db\dialect.rs` | `replaces_all_datetime_now` |
| `db\dialect.rs` | `rewrites_datetime_modifier` |
| `db\dialect.rs` | `rewrites_datetime_of_column` |
| `db\dialect.rs` | `rewrites_group_concat` |
| `middleware\auth.rs` | `tenant_token_rejects_platform_audience` |
| `middleware\auth.rs` | `tenant_token_roundtrip_with_audience` |
| `payroll_logic.rs` | `apply_adjustment_list_flat_deduction` |
| `payroll_logic.rs` | `apply_adjustment_percentage_of_gross` |
| `payroll_logic.rs` | `calendar_days_february_leap` |
| `payroll_logic.rs` | `calendar_days_june` |
| `payroll_logic.rs` | `parse_employee_adjustments_map` |
| `payslip_render.rs` | `fmt_inr_formats_currency` |
| `payslip_render.rs` | `html_escape_prevents_xss` |
| `payslip_render.rs` | `render_includes_overtime_row` |
| `signup_otp_email.rs` | `escapes_html_in_email` |
| `signup_otp_email.rs` | `renders_otp_email_with_brand_colors` |
| `subscription_period.rs` | `custom_plan_has_no_expiry` |
| `subscription_period.rs` | `parses_day_and_month_periods` |
| `subscription_period.rs` | `renew_extends_from_current_expiry` |
| `tds_logic.rs` | `financial_year_april_onwards` |
| `tds_logic.rs` | `new_regime_positive_tax_high_income` |
| `tds_logic.rs` | `new_regime_zero_tax_low_income` |
| `workflow_logic.rs` | `conditions_array_rule_fails_on_mismatch` |
| `workflow_logic.rs` | `conditions_object_equals` |
| `workflow_logic.rs` | `contains_operator` |
| `workflow_logic.rs` | `numeric_gte_operator` |
| `workflow_logic.rs` | `trigger_type_variants_leave_approved` |
