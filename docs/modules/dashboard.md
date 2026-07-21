# Dashboard

## Overview

HR analytics home screen — headcount, attendance snapshot, leave summary, payroll highlights, and quick stats for the organization.

## Plan module

- **Key:** `dashboard`
- **Permissions:** `view-dashboard`

## Frontend

| Route | Page |
|-------|------|
| `/admin/dashboard` | `pages/admin/dashboard.tsx` |

Default landing route when user has `view-dashboard` permission.

## Backend

**Handler:** `handlers/analytics.rs`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/admin/dashboard/hr-data` | `view-dashboard` |

Returns aggregated metrics scoped to `organization_id` (users, attendance today, pending leave, etc.).

## Database (read sources)

Reads from: `users`, `attendance`, `leave_requests`, `payslips`, `departments` — no dedicated dashboard table.

## Workflows

1. User opens dashboard after login.
2. Frontend fetches `/api/admin/dashboard/hr-data` once on mount.
3. Cards/charts render org-wide KPIs; links may deep-link to modules (attendance, leave, payroll).

## Related modules

- [Attendance](attendance.md) — today's presence stats
- [Leave](leave.md) — pending approvals count
- [Payroll](payroll.md) — recent payroll status
