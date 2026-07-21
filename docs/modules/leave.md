# Leave Management

## Overview

Leave types, annual credits, employee self-service requests, and manager approval workflow.

## Plan module

- **Key:** `leave`
- **Permissions:**

| Permission | Use |
|------------|-----|
| `view-leave-requests` | Own / team list |
| `create-leave-requests` | Submit request |
| `manage-leave-requests` | Admin list, remarks |
| `approve-leave-requests` | Approve |
| `reject-leave-requests` | Reject |

## Frontend

| Route | Page |
|-------|------|
| `/admin/leave-requests` | `pages/admin/leave-requests/index.tsx` |
| `/admin/leave-requests/manage` | `pages/admin/leave-requests/manage.tsx` |
| `/admin/settings/leave-types` | `pages/admin/settings/leave-types.tsx` |

**Components:** `leave-request-form.tsx`, `leave-request-table.tsx`, `admin-leave-request-table.tsx`  
**Lib:** `lib/leave-types.ts`

## Backend

**Handlers:** `handlers/leave_types.rs`, `leave_credits.rs`, `leave_requests.rs`

### Leave types & policy (settings)

| Method | Path |
|--------|------|
| GET | `/api/admin/leave-types` |
| GET/POST | `/api/admin/settings/leave-types` |
| PUT | `/api/admin/settings/leave-types/{id}` |
| GET/PUT | `/api/admin/settings/leave-policy` |
| GET/POST/DELETE | `/api/admin/leave-credits` |

### Leave requests

| Method | Path | Permission |
|--------|------|------------|
| GET/POST | `/api/admin/leave-requests` | view / create |
| GET | `/api/admin/leave-requests/list`, `/stats` | view |
| DELETE | `/api/admin/leave-requests/{id}` | own cancel (no perm) |
| GET | `/api/admin/leave-requests/manage`, `/manage/list`, `/manage/stats` | manage |
| POST | `/api/admin/leave-requests/{id}/approve` | approve |
| POST | `/api/admin/leave-requests/{id}/reject` | reject |
| PUT | `/api/admin/leave-requests/{id}/remarks` | manage |

## Database

| Table | Purpose |
|-------|---------|
| `leave_types` | Name, paid/unpaid, quota rules |
| `leave_credits` | Per-user balances by type/year |
| `leave_requests` | Dates, status, approver, remarks |

## Workflows

### Employee request

1. Select type, date range, reason → `POST /api/admin/leave-requests`.
2. Status `pending` until manager acts.

### Manager approval

1. Manage Leave page lists all pending.
2. Approve deducts credit (via `payroll_logic` / leave overlap rules).
3. Rejected requests store reason in remarks.

## Related modules

- [Manage Leave](leave-manage.md) — approve / reject
- [Holidays](holidays.md) — excluded from leave days
- [Payroll](payroll.md) — LOP for unpaid leave
- [Reports](reports.md) — leave balance report
- [Settings](settings.md) — leave types configuration
- [Workflows](workflows.md) — leave submitted / approved / rejected triggers
