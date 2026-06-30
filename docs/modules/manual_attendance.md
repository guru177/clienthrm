# Manual Attendance

## Overview

Plan-gated module for admins and managers to mark employee attendance manually — used when a deployment does not use in-app face clock-in or biometric devices.

## Plan module

- **Key:** `manual_attendance`
- **Typical pairing:** enable with `attendance` (registers, stats, history) and omit `biometric` for manual-only clients
- **Permissions:**

| Permission | Use |
|------------|-----|
| `view-attendance` | Load daily grid data |
| `mark-attendance` | Create manual entries (single or bulk) |

Users with `manage-attendance` from the `attendance` module can also mark manually.

## Frontend

| Route | Page |
|-------|------|
| `/admin/manual-attendance` | `pages/admin/manual-attendance/index.tsx` |

**Components:** `manual-attendance-grid.tsx`, `manual-attendance-form.tsx`

## Backend

**Handlers:** `handlers/attendance.rs` (`store_manual`, `store_manual_bulk`)

| Method | Path | Permission |
|--------|------|------------|
| POST | `/api/admin/attendance/manual` | mark-attendance or manage-attendance |
| POST | `/api/admin/attendance/manual/bulk` | mark-attendance or manage-attendance |

Records are stored with `source='manual'`.

## Related modules

- [Attendance](attendance.md) — core registers and employee view
- [Biometric](biometric.md) — device punch sync (alternative capture method)
