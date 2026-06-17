# Salaries & Payroll

## Overview

End-to-end compensation: salary components, employee CTC profiles, payroll preview/generation, payslips, advances, statutory deductions (PF/ESI/PT), PDF export, and WhatsApp delivery.

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
| `/admin/my-payslips` | `pages/admin/my-payslips.tsx` |

**Components:** `salary-structure-panel.tsx`, `ctc-salary-panel.tsx`, `salary-tabs-panel.tsx`  
**Lib:** `lib/payslip-pdf.ts` — client PDF generation

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

### Payslips

| Method | Path |
|--------|------|
| GET | `/api/admin/me/payslips` |
| GET | `/api/admin/salaries/employees/{id}/payslips/list` |
| GET | `/api/admin/payslips/{id}/pdf` |
| POST | `/api/admin/payslips/bulk-download` |
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
3. `POST /api/admin/payroll/generate` creates payslip rows.
4. Employees view via My Payslips; HR downloads PDF bulk.

## Related modules

- [Users & Roles](users-roles.md)
- [Attendance](attendance.md), [Leave](leave.md) — LOP inputs
- [Reports](reports.md) — payroll register
