# Workflows

## Overview

Configurable automation workflows (triggers, steps, conditions) for HR processes. Supports enable/disable, duplication, and execution history.

## Plan module

- **Key:** `workflows`
- **Permissions:** `view-workflows`, `create-workflows`, `edit-workflows`, `delete-workflows`, `toggle-workflows`

## Frontend

| Route | Page |
|-------|------|
| `/admin/workflows` | `pages/admin/workflows/index.tsx` |
| `/admin/workflows/create` | `pages/admin/workflows/create.tsx` |
| `/admin/workflows/:id` | `pages/admin/workflows/view.tsx` |
| `/admin/workflows/:id/edit` | `pages/admin/workflows/edit.tsx` |

## Backend

**Handler:** `handlers/workflows.rs`

| Method | Path | Permission |
|--------|------|------------|
| GET/POST | `/api/admin/workflows` | view / create |
| GET/PUT/DELETE | `/api/admin/workflows/{id}` | view / edit / delete |
| POST | `/api/admin/workflows/{id}/toggle` | toggle-workflows |
| POST | `/api/admin/workflows/{id}/duplicate` | create-workflows |

## Database

| Table | Purpose |
|-------|---------|
| `workflows` | Name, definition JSON, active flag, org |
| `workflow_executions` | Run history, status, timestamps |

## Workflows

1. Admin designs workflow (steps stored as JSON in `workflows` table).
2. Toggle active → `toggle` endpoint.
3. Executions logged in `workflow_executions` for audit.

## Related modules

- [Tasks](tasks.md) — operational work items
- [Leave](leave.md) — approval flows may intersect conceptually
