# Designations

## Overview

Job titles / ranks (e.g. Software Engineer, Manager). Linked to users for org chart and payroll reporting.

## Plan module

- **Key:** `designations`
- **Permissions:** `view-designations`, `create-designations`, `edit-designations`, `delete-designations`

## Frontend

| Route | Page |
|-------|------|
| `/admin/designations` | `pages/admin/designations/index.tsx` |

## Backend

**Handler:** `handlers/designations.rs`

| Method | Path |
|--------|------|
| GET | `/api/admin/designations`, `/stats`, `/list` |
| POST | `/api/admin/designations` |
| GET/PUT/DELETE | `/api/admin/designations/{id}` |

## Database

| Table | Purpose |
|-------|---------|
| `designations` | `organization_id`, `name`, `level`, etc. |

## Workflows

Standard CRUD table UI. `list` endpoint powers user forms and salary employee filters.

## Related modules

- [Users & Roles](users-roles.md)
