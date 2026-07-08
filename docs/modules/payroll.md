# Salaries & Payroll

## Overview

End-to-end compensation: salary components, employee CTC profiles, payroll preview/generation, payslips, advances, statutory deductions (PF/ESI/PT), **A4 PDF** export, **email distribution**, and WhatsApp delivery.

**How payslip email & PDF work:** [PAYSLIP-DISTRIBUTION.md](../PAYSLIP-DISTRIBUTION.md)

## Plan module

- **Key:** `payroll`
- **Permissions:** `view-payroll`, `manage-payroll`, `export-payroll`

## Frontend

| Route | Page |
|-------|------|
| `/admin/salaries/components` | `pages/admin/salaries/components.tsx` |
| `/admin/salaries/employees` | `pages/admin/salaries/employees.tsx` |
| `/admin/salaries/employees/:id/payslips` | `pages/admin/salaries/payslips-route.tsx` |
| `/admin/payroll` | `pages/admin/payroll/index.tsx` |
| `/admin/payroll/advanced` | `pages/admin/payroll/advanced.tsx` |
| `/admin/my-payslips` | `pages/admin/my-payslips.tsx` |

**Components:** `salary-structure-panel.tsx`, `ctc-salary-panel.tsx`, `salary-tabs-panel.tsx`  
**Lib:** `lib/payslip-pdf.ts` — open PDF, email payslips, bulk ZIP

## Backend

**Handlers:** `handlers/salaries.rs`, `payroll.rs`, `payslips.rs`  
**Logic:** `payroll_logic.rs`, `salary_split.rs`, `statutory_logic.rs`

### Salary components

| Method | Path |
|--------|------|
| GET | `/api/admin/salaries/components/list` |
| POST | `/api/admin/salaries/components` |
| PUT/DELETE | `/api/admin/salaries/components/{id}` |
| GET | `/api/admin/salaries/templates` |
| POST | `/api/admin/salaries/ctc-preview` |

### Per-user salary (also under users)

| Method | Path |
|--------|------|
| GET/POST | `/api/admin/users/{id}/salary-structure` |
| GET/POST/DELETE | `/api/admin/users/{id}/ctc-profile` |
| GET/POST | `/api/admin/users/{id}/advances` |

### Employees list

| Method | Path |
|--------|------|
| GET | `/api/admin/salaries/employees/list` |
| GET | `/api/admin/salaries/employees/filter-options` |

### Payroll run

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/admin/payroll`, `/list`, `/stats`, `/employees` | view-payroll |
| POST | `/api/admin/payroll/preview` | manage-payroll |
| POST | `/api/admin/payroll/generate` | manage-payroll |
| POST | `/api/admin/payslips/{id}/unlock` | manage-payroll |

### Advanced payroll

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/DELETE | `/api/admin/payroll/variable-pay` | Bonus, commission, incentives |
| GET/POST | `/api/admin/payroll/reimbursements` | Employee claims |
| POST | `/api/admin/payroll/reimbursements/{id}/review` | Approve/reject claims |
| GET/POST | `/api/admin/payroll/runs` | Payroll run workflow |
| POST | `/api/admin/payroll/runs/{id}/action` | review / approve / release |
| GET | `/api/admin/payroll/checklist` | Pre-run validation |
| GET | `/api/admin/payroll/reminder` | Monthly reminder status |
| GET | `/api/admin/payroll/compliance-export` | PF ECR, ESI, PT, Form 16 |
| GET | `/api/admin/payroll/bank-file` | NEFT CSV |
| POST | `/api/admin/payroll/mark-paid` | Mark payslips paid |
| GET | `/api/admin/payroll/accounting-export` | Journal CSV |
| GET/POST | `/api/admin/payroll/pay-groups` | Pay groups |
| POST | `/api/admin/users/{id}/payroll-hold` | Salary hold |
| GET/POST | `/api/admin/users/{id}/tax-declaration` | TDS declarations |
| POST | `/api/admin/payslips/{id}/send-email` | Email payslip PDF |
| POST | `/api/admin/payslips/bulk-send-email` | Email all payslips (month or IDs) |

### Payslips

| Method | Path |
|--------|------|
| GET | `/api/admin/me/payslips` |
| GET | `/api/admin/salaries/employees/{id}/payslips/list` |
| GET | `/api/admin/payslips/{id}/pdf` | A4 PDF |
| POST | `/api/admin/payslips/bulk-download` | ZIP of PDFs |
| POST | `/api/admin/payslips/{id}/send-whatsapp` |

## Database

| Table | Purpose |
|-------|---------|
| `salary_components` | Earning/deduction definitions |
| `salary_templates` | Reusable structures |
| `employee_salary_profiles` | CTC, effective date |
| `salary_structure_items` | Component lines per user |
| `employee_advances` | Salary advances / EMI |
| `payslips` | Generated monthly records |

## Workflows

### Configure payroll

1. Define components (Basic, HRA, PF, etc.).
2. Assign CTC profile per employee on Salaries → Employees or User view.
3. `ctc-preview` shows split from `salary_split.rs`.

### Monthly run

1. Select month → `POST /api/admin/payroll/preview`.
2. Review LOP, leave overlap, statutory lines (`payroll_logic`, `statutory_logic`).
3. **Advance recovery:** For employees with active advances, open the salary popup and set **Recover this month** per advance row (defaults to `min(monthly_emi, balance)`). Preview accepts `advance_allocations` (map of `user_id` → `[{ advance_id, amount }]`); values are stored on the draft payslip in `adjustments.advance_allocations`.
4. `POST /api/admin/payroll/generate` creates payslip rows and deducts the chosen per-advance amounts from `employee_advances.balance` (`send_emails: true` optionally emails PDFs). Unlock restores balances from stored allocations.
5. Employees view via **My Payslips**; HR can email, download PDF, or bulk ZIP.

See [Payslip distribution](../PAYSLIP-DISTRIBUTION.md) for SMTP, PDF, and email details.

## Related modules

- [Users & Roles](users-roles.md)
- [Attendance](attendance.md), [Leave](leave.md) — LOP inputs
- [Reports](reports.md) — payroll register
