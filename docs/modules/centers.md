# Centers / Branches (Work Locations)

## Overview

Physical or logical work **branches** (stored in `centers` table; UI label is "Branches"). Used for geo attendance, multi-location orgs, payroll filtering, and scoping departments.

## Plan module

- **Key:** `centers`
- **Permissions:** `manage-settings`

## Frontend

| Route | Page |
|-------|------|
| `/admin/centers` | `pages/admin/centers/index.tsx` (labeled **Branches**) |

## Backend

**Handler:** `handlers/centers.rs`

| Method | Path |
|--------|------|
| GET | `/api/admin/settings/centers` |
| POST | `/api/admin/settings/centers` |
| PUT/DELETE | `/api/admin/settings/centers/{id}` |

DELETE is blocked when departments reference the branch.

Alternate paths under `/api/admin/api/settings/centers` for legacy clients.

## Database

| Table | Purpose |
|-------|---------|
| `centers` | `organization_id`, name, address, geo fields, active flag |

## Workflows

1. Admin defines branches on the Branches page.
2. Departments are created per branch (`departments.center_id`).
3. Users select a branch (`work_location`) and a department from that branch only.
4. Attendance / payroll may filter by branch.
5. Branch-scoped admins: see [Branch-scoped RBAC](branch-rbac.md).

## Related modules

- [Departments](departments.md)
- [Branch-scoped RBAC](branch-rbac.md)
- [Settings](settings.md)
- [Attendance](attendance.md)
