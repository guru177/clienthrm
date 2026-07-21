# Reports

## Overview

Exportable HR reports: attendance summary, **attendance register** (book-style matrix), payroll register, payroll component split, and leave balance.

## Plan module

- **Key:** `reports`
- **Permissions:** `view-reports`, `export-reports`

## Frontend

| Route | Page |
|-------|------|
| `/admin/reports` | `pages/admin/reports/index.tsx` |

Tabs:

- **Attendance** — monthly summary (present / late / early exit)
- **Attendance Register** — date-range matrix with Excel export (`components/reports/attendance-register-report.tsx`)
- **Payroll Register**, **Salary Split** (colour-coded CTC + LOP component split with Excel export), **Leave Balance**

## Backend

**Handler:** `handlers/reports.rs`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/admin/reports/attendance-summary` | view-reports |
| GET | `/api/admin/reports/attendance-register` | view-reports |
| GET | `/api/admin/reports/daily-attendance` | view-attendance / manage-attendance |
| GET | `/api/admin/reports/employee-attendance-log` | view-attendance / manage-attendance |
| GET | `/api/admin/reports/payroll-register` | view-reports |
| GET | `/api/admin/reports/payroll-split` | view-reports |
| GET | `/api/admin/reports/leave-balance` | view-reports |

### Attendance register

**`GET /api/admin/reports/attendance-register`**

Query parameters:

| Param | Required | Description |
|-------|----------|-------------|
| `start_date` | Yes | `YYYY-MM-DD` |
| `end_date` | Yes | `YYYY-MM-DD` (max 93 days from start) |
| `department_id` | No | Filter by department |
| `search` | No | Name, email, phone, or department name |

Response includes `dates[]`, `employees[]` (each with `days` map and `present_days`), `daily_totals` per date, and `legend`.

**Cell codes** (register marks):

| Code | Meaning |
|------|---------|
| `P` | Present (closed attendance session) |
| `A` | Absent (scheduled working day, no attendance) |
| `L` | Approved leave |
| `O` | Scheduled off / week off |
| `H` | Org holiday |
| `•` | Open session (clocked in, no clock-out) |

Status logic matches the daily attendance register (shifts, leave, holidays). Biometric punches are synced for the range before building the matrix.

**Excel export:** client-side via `xlsx-js-style` on the Attendance Register tab. Colours match the on-screen legend (P green, A red, L blue, O grey, H amber, • orange). Includes styled header, frozen employee columns, alternating rows, daily-present footer, and legend. Filename: `attendance-register_{start}_to_{end}.xlsx`.

### Salary split

**`GET /api/admin/reports/payroll-split?month=&year=`**

Per-employee rows from live payroll preview (`build_employee_payroll`). **Columns are dynamic** — driven by active org `salary_components` earning definitions (`earning_columns[]`), plus per-employee `earnings` and `lop_by_component` maps keyed by component id.

Fixed columns: Emp-Name, DOB, DOJ, Yrly CTC, CTC Monthly, Gross-Pay, LOP Days.

For each earning component in `earning_columns`:

| UI / Excel | API |
|------------|-----|
| Component name (green/yellow by bucket) | `earnings["{component_id}"]` |
| LOP {name} (red header) | `lop_by_component["{component_id}"]` |

`kind` on each column: `earn` (Basic, HRA) or `yellow` (Conveyance, Special, custom allowances) — from `bucket_component` logic.

Response includes `totals.earnings` and `totals.lop_by_component` maps.

**UI:** `components/reports/salary-split-report.tsx` — dynamic grid + total row.

**Excel export:** `lib/salary-split-excel.ts` — same dynamic layout and colours. Filename: `salary-split_YYYY-MM.xlsx`.

## Data sources

| Report | Primary tables |
|--------|----------------|
| Attendance summary | `attendance`, `users`, `shifts` |
| Attendance register | `attendance`, `users`, `leave_requests`, `holidays`, `shifts`, `departments` |
| Payroll register | `payslips`, `users` |
| Payroll split | `users`, salary structures, `component_lop_breakdown` |
| Leave balance | `leave_credits`, `leave_types`, `users` |

## Workflows

1. User selects report type and filters.
2. Frontend fetches GET endpoint → renders table or matrix.
3. Attendance Register: click **Load**, then **Export Excel** (uses `export-reports` or `view-reports`).
4. Salary Split: select month/year, then **Export Excel**.

## Related modules

- [Attendance](attendance.md)
- [Payroll](payroll.md)
- [Leave](leave.md)
