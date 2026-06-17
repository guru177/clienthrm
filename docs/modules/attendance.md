# Attendance

## Overview

Track employee presence via manual clock-in/out, optional face capture, and biometric punch import. Provides daily views, stats, and per-user history.

## Plan module

- **Key:** `attendance`
- **Permissions:**

| Permission | Use |
|------------|-----|
| `view-attendance` | Lists, stats, today board |
| `clock-inout` | Self clock-in/out |
| `manage-attendance` | Admin corrections (via shifts/biometric write paths) |
| `mark-attendance` | Manual mark for others |

## Frontend

| Route | Page |
|-------|------|
| `/admin/attendance` | `pages/admin/attendance/index.tsx` |

**Components:** `components/attendance/attendance-table.tsx`, `clock-in-face-dialog.tsx`  
**Hooks:** `hooks/use-biometric-live.ts` (live punch feed integration)

## Backend

**Handlers:** `handlers/attendance.rs`, `attendance_logic.rs`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/admin/attendance` | view-attendance |
| GET | `/api/admin/attendance/list` | view-attendance |
| GET | `/api/admin/attendance/users` | view-attendance |
| GET | `/api/admin/attendance/today` | view-attendance |
| GET | `/api/admin/attendance/stats` | view-attendance |
| POST | `/api/admin/attendance/clock-in` | clock-inout |
| POST | `/api/admin/attendance/clock-out` | clock-inout |

Clock-in may accept photo (stored under `storage/users/`).

## Database

| Table | Purpose |
|-------|---------|
| `attendance` | `user_id`, `clock_in`, `clock_out`, `date`, source, late flags |

## Business logic

- `attendance_logic.rs` — session rules, duplicate punch prevention.
- `shift_logic.rs` — expected in/out from assigned shift (late detection).
- Biometric punches merged via [Biometric](biometric.md) pipeline.

## Workflows

### Employee clock-in

1. User opens Attendance → Clock In.
2. Optional face dialog captures image.
3. `POST /api/admin/attendance/clock-in` creates open session.

### Admin review

Filter by date range, department, user. Stats show present/absent/late counts.

## Related modules

- [Shifts](shifts.md) — expected hours
- [Biometric](biometric.md) — device punches
- [Reports](reports.md) — attendance summary
- [Payroll](payroll.md) — LOP from absent days
