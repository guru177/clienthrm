# Projects

## Overview

Project containers for grouping tasks — name, description, status, timeline, and team visibility.

## Plan module

- **Key:** `projects`
- **Permissions:** `view-projects`, `create-projects`, `edit-projects`, `delete-projects`, `manage-project-status`

## Frontend

| Route | Page |
|-------|------|
| `/admin/projects` | `pages/admin/projects/index.tsx` |
| `/admin/projects/create` | `pages/admin/projects/create.tsx` |
| `/admin/projects/:id` | `pages/admin/projects/view.tsx` |
| `/admin/projects/:id/edit` | `pages/admin/projects/edit.tsx` |

## Backend

**Handler:** `handlers/projects.rs`

| Method | Path |
|--------|------|
| GET/POST | `/api/admin/projects` |
| GET/PUT/DELETE | `/api/admin/projects/{id}` |
| GET | `/api/admin/projects/list` |

## Database

| Table | Purpose |
|-------|---------|
| `projects` | Name, status, dates, organization_id |

## Workflows

1. Create project → add tasks linked via `project_id`.
2. Project view shows related tasks and progress.

## Related modules

- [Tasks](tasks.md)
