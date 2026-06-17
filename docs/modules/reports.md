# Reports

## Overview

Exportable HR reports: attendance summary, payroll register, payroll component split, and leave balance.

## Plan module

- **Key:** `reports`
- **Permissions:** `view-reports`, `export-reports`

## Frontend

| Route | Page |
|-------|------|
| `/admin/reports` | `pages/admin/reports/index.tsx` |

Typically provides date range filters and CSV/print export per report type.

## Backend

**Handler:** `handlers/reports.rs`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/admin/reports/attendance-summary` | view-reports |
| GET | `/api/admin/reports/payroll-register` | view-reports |
| GET | `/api/admin/reports/payroll-split` | view-reports |
| GET | `/api/admin/reports/leave-balance` | view-reports |

Query parameters usually include `from`, `to`, `department_id`, `user_id` (handler-specific).

## Data sources

| Report | Primary tables |
|--------|----------------|
| Attendance summary | `attendance`, `users`, `shifts` |
| Payroll register | `payslips`, `users` |
| Payroll split | `payslips`, `salary_components` |
| Leave balance | `leave_credits`, `leave_types`, `users` |

## Workflows

1. User selects report type and filters.
2. Frontend fetches GET endpoint → renders table.
3. Export uses client-side CSV or print (export-reports for write actions if added).

## Related modules

- [Attendance](attendance.md)
- [Payroll](payroll.md)
- [Leave](leave.md)
