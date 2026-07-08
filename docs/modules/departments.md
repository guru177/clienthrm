# Departments

## Overview

Organizational units within a tenant branch (e.g. Engineering, HR). Each department belongs to exactly one **branch** (`centers` table). Users are assigned to departments within their branch; chat may auto-create department channels.

## Plan module

- **Key:** `departments`
- **Permissions:** `view-departments`, `create-departments`, `edit-departments`, `delete-departments`

## Frontend

| Route | Page |
|-------|------|
| `/admin/departments` | `pages/admin/departments/index.tsx` |

Department form requires a branch. List supports branch filter and shows a Branch column.

## Backend

**Handler:** `handlers/departments.rs`

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/admin/departments` | Optional `?center_id=` |
| GET | `/api/admin/departments/stats` | Optional `?center_id=` |
| GET | `/api/admin/departments/list` | Optional `?center_id=`, pagination |
| POST | `/api/admin/departments` | Requires `center_id` |
| GET | `/api/admin/departments/{id}` | Includes `center` object |
| PUT | `/api/admin/departments/{id}` | Requires `center_id` |
| DELETE | `/api/admin/departments/{id}` | |

## Database

| Table | Columns (key) |
|-------|----------------|
| `departments` | `id`, `organization_id`, `center_id` (FK → `centers`), `name`, `slug`, `description`, timestamps |

Unique slug per `(organization_id, center_id, slug)`.

## Workflows

1. Admin creates a branch under **Branches**, then creates departments under that branch.
2. User form filters departments by selected branch (`work_location`).
3. Branches cannot be deleted while departments reference them.
4. `list` endpoint used by filters across attendance, payroll, reports.

## Related modules

- [Centers / Branches](centers.md)
- [Users & Roles](users-roles.md)
- [Team Chat](team-chat.md) — optional department channels
