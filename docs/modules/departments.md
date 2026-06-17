# Departments

## Overview

Organizational units within a tenant (e.g. Engineering, HR). Users are assigned to departments; chat may auto-create department channels.

## Plan module

- **Key:** `departments`
- **Permissions:** `view-departments`, `create-departments`, `edit-departments`, `delete-departments`

## Frontend

| Route | Page |
|-------|------|
| `/admin/departments` | `pages/admin/departments/index.tsx` |

## Backend

**Handler:** `handlers/departments.rs`

| Method | Path | Permission (CRUD) |
|--------|------|-----------------|
| GET | `/api/admin/departments` | view |
| GET | `/api/admin/departments/stats` | view |
| GET | `/api/admin/departments/list` | view |
| POST | `/api/admin/departments` | create |
| GET | `/api/admin/departments/{id}` | view |
| PUT | `/api/admin/departments/{id}` | edit |
| DELETE | `/api/admin/departments/{id}` | delete |

## Database

| Table | Columns (key) |
|-------|----------------|
| `departments` | `id`, `organization_id`, `name`, `description`, timestamps |

## Workflows

1. Admin creates department → available in user form dropdowns.
2. Deleting blocked or cascades depending on linked users (handler validates).
3. `list` endpoint used by filters across attendance, payroll, reports.

## Related modules

- [Users & Roles](users-roles.md)
- [Team Chat](team-chat.md) — optional department channels
