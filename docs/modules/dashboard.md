# Dashboard

## Overview

HR analytics home screen — personalized welcome, pastel KPI cards with sparklines, attendance trend, quick actions, upcoming holidays, and department payroll distribution.

## Plan module

- **Key:** `dashboard`
- **Permissions:** `view-dashboard`

## Frontend

| Route | Page |
|-------|------|
| `/admin/dashboard` | `pages/admin/dashboard.tsx` |

Default landing route when user has `view-dashboard` permission.

### Widget layout

1. **Welcome** — `Welcome back, {firstName}` from auth user
2. **KPI row** — Total Employees, Today's Attendance, Pending Requests, Active Projects, Pending Payroll (pastel cards + sparklines)
3. **Middle row** — Today's Status Overview, Attendance Trend (7-day area chart), Quick Actions (leave / attendance / payslips, permission-filtered)
4. **Bottom row** — Upcoming Holidays, Recently Joined Employees (name + department)

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
3. Cards/charts render org-wide KPIs; quick actions deep-link to leave, my attendance, and my payslips when allowed.

## Related modules

- [Org Chart](org-chart.md) — reporting hierarchy (nav item under Dashboard)
- [Attendance](attendance.md) — today's presence stats
- [Leave](leave.md) — pending approvals count
- [Payroll](payroll.md) — recent payroll status
