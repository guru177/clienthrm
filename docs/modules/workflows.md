# Workflows

## Overview

Configurable event-driven automation: when something happens in HR (leave, attendance, payroll, …), run actions (tasks, notifications, email, WhatsApp, webhooks).

**Full reference:** [WORKFLOWS.md](../WORKFLOWS.md) (triggers, actions, fire sites, recipes).  
**Cross-module graph:** [INTERCONNECTIONS.md](INTERCONNECTIONS.md).

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

**Handlers / logic:** `handlers/workflows.rs`, `workflow_logic.rs`, `jobs/workflow_events_worker.rs`

| Method | Path | Permission |
|--------|------|------------|
| GET/POST | `/api/admin/workflows` | view / create |
| GET/PUT/DELETE | `/api/admin/workflows/{id}` | view / edit / delete |
| POST | `/api/admin/workflows/{id}/toggle` | toggle-workflows |
| POST | `/api/admin/workflows/{id}/duplicate` | create-workflows |

## Database

| Table | Purpose |
|-------|---------|
| `workflows` | Trigger, conditions, actions JSON, enabled |
| `workflow_executions` | Run history |

## Typical workflow

1. Admin creates workflow (pick trigger + actions).
2. Toggle active.
3. Domain event fires → matching workflows execute.
4. Inspect executions for audit.

## Related modules

- [Tasks](tasks.md) — `create_task`
- [Notifications](notifications.md) — `notification`
- [Leave](leave.md) / [Leave manage](leave-manage.md) — leave triggers
- [Attendance](attendance.md) / [Biometric](biometric.md) — clock-in / late
- [Payroll](payroll.md) — `payslip_generated`
- [Settings](settings.md) — SMTP / WhatsApp
