# Shifts

## Overview

Define shift templates, assign users to shifts, manage roster calendars, and override daily schedules.

## Plan module

- **Key:** `shifts`
- **Permissions:** `view-attendance` (read), `manage-attendance` (write)

## Frontend

| Route | Page |
|-------|------|
| `/admin/shifts` | `pages/admin/shifts/index.tsx` |
| `/admin/shifts/roster` | `pages/admin/shifts/roster.tsx` |
| `/admin/shifts/daily` | `pages/admin/shifts/daily-schedule.tsx` |

## Backend

**Handlers:** `handlers/shifts.rs`, `shift_logic.rs`

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/admin/shifts` | Shift templates |
| PUT/DELETE | `/api/admin/shifts/{id}` | Update/remove template |
| POST | `/api/admin/shifts/assign-user` | Assign user to template |
| GET | `/api/admin/shifts/roster` | Roster grid |
| GET/POST | `/api/admin/shifts/daily-roster` | Per-day overrides |
| GET | `/api/admin/shifts/user/{id}` | User's current assignment |

## Database

| Table | Purpose |
|-------|---------|
| `shift_templates` | Name, start/end, grace, working days mask |
| `user_shift_assignments` | User ↔ template, effective dates |
| `shift_daily_roster` | Date-specific shift overrides |

## Business logic (`shift_logic.rs`)

- Resolves effective shift for a user on a given date (template + daily roster).
- Working-day bitmask (Mon–Sun).
- Grace minutes for late calculation in attendance.

## Workflows

### Setup shift

1. Create template (e.g. 9:00–18:00, Mon–Fri).
2. Assign employees via Templates & Assign or Roster.
3. Daily Schedule overrides holidays or special shifts.

## Related modules

- [Attendance](attendance.md)
- [Holidays](holidays.md)
- [Payroll](payroll.md) — business days calculation
