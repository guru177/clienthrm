# Tasks & Activities

## Overview

Task tracking with assignees, due dates, status updates, and optional project linkage.

## Plan module

- **Key:** `tasks`
- **Permissions:** `view-tasks`, `create-tasks`, `edit-tasks`, `delete-tasks`, `assign-tasks`, `update-task-status`

## Frontend

| Route | Page |
|-------|------|
| `/admin/tasks` | `pages/admin/tasks/index.tsx` |
| `/admin/tasks/create` | `pages/admin/tasks/create.tsx` |
| `/admin/tasks/:id` | `pages/admin/tasks/view.tsx` |
| `/admin/tasks/:id/edit` | `pages/admin/tasks/edit.tsx` |

## Backend

**Handler:** `handlers/tasks.rs`

| Method | Path | Permission |
|--------|------|------------|
| GET/POST | `/api/admin/tasks` | view / create |
| GET/PUT/DELETE | `/api/admin/tasks/{id}` | view / edit / delete |
| POST | `/api/admin/tasks/{id}/status` | update-task-status |

## Database

| Table | Purpose |
|-------|---------|
| `tasks` | Title, description, assignee, status, due_date, project_id, org |

## Workflows

1. Create task with assignee and priority.
2. Assignee updates status via detail page or `POST .../status`.
3. Filter/list on index by status, assignee, project.

## Related modules

- [Projects](projects.md)
