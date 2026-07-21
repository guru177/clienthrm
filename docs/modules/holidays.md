# Holidays

## Overview

Company-wide holiday calendar. Used by attendance, shift logic, and payroll business-day calculations.

## Plan module

- **Key:** `holidays`
- **Permissions:** `view-holidays`, `create-holidays`, `edit-holidays`, `delete-holidays`

## Frontend

| Route | Page |
|-------|------|
| `/admin/holidays` | `pages/admin/holidays/index.tsx` |

## Backend

**Handler:** `handlers/holidays.rs`

| Method | Path |
|--------|------|
| GET | `/api/admin/holidays`, `/list` |
| POST | `/api/admin/holidays` |
| PUT/DELETE | `/api/admin/holidays/{id}` |

## Database

| Table | Purpose |
|-------|---------|
| `holidays` | `organization_id`, `name`, `date`, optional recurring flag |

## Workflows

1. HR adds holidays for the year.
2. Payroll `payroll_logic` excludes holidays from working days.
3. Attendance views may mark holiday dates.

## Related modules

- [Shifts](shifts.md)
- [Payroll](payroll.md)
- [Leave](leave.md)
