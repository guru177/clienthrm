# Manage Leave

## Overview

Approval queue for leave requests: company admins and reporting managers approve or reject employee leave. Complements employee self-service in [Leave](leave.md).

## Plan module

- **Key:** `leave_manage`
- **Permissions:** `manage-leave-requests`, `approve-leave-requests`, `reject-leave-requests`

## Frontend

| Route | Page |
|-------|------|
| `/admin/leave-requests/manage` | Admin manage queue |
| `/admin/team/leave` | Manager team leave |

## Backend

**Handlers:** `handlers/leave_requests.rs`, `handlers/manager.rs`

| Method | Path | Notes |
|--------|------|-------|
| GET/POST | `/api/admin/leave-requests/manage/*` | Org-wide manage |
| GET/POST | `/api/admin/manager/leave-requests/*` | Reporting-line scope |

Approve / reject fire workflow triggers `leave_request_approved` / `leave_request_rejected` (see [WORKFLOWS.md](../WORKFLOWS.md)).

## Database

| Table | Purpose |
|-------|---------|
| `leave_requests` | Status transitions pending → approved / rejected |
| `leave_credits` | Balance adjustments on approve |

## Related modules

- [Leave](leave.md) — employee submit
- [Holidays](holidays.md) — calendar context
- [Payroll](payroll.md) — approved leave vs LOP
- [Workflows](workflows.md) — automation on approve/reject
