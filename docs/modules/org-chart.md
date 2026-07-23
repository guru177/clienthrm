# Org Chart

## Overview

Visual reporting hierarchy for the tenant. Every employee (Admin, HR, Manager, Head, Employee, etc.) appears as a person card. **Tree edges** come from reporting managers; **job titles** come from designations; **colored badges** come from RBAC roles.

## Plan module

- Reuses **`users`** (`view-users`). No separate plan key.

## Frontend

| Route | Page |
|-------|------|
| `/admin/org-chart` | `pages/admin/org-chart/index.tsx` |

Nav item sits directly under **Dashboard**. Filters: branch, role, designation, search. Classic top-down hierarchy; click name → user profile. Chart auto-fits the viewport.

## Backend

**Handler:** `handlers/org_chart.rs`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/admin/org-chart` | `view-users` |

Query params: `center_id`, `role_id`, `designation_id`, `search`.

Response includes nested `forest`, `needs_reporting_line` (cycle/broken links), `stats`, and filter option lists.

Parent key: `COALESCE(reporting_manager_id, manager_id)`. Branch scope via `append_users_branch_filter` + optional `center_id`.

Branch filters still include **branchless HQ** users (no work location / centers) and **reporting ancestors** outside the filtered branch, so the Admin / top-of-tree root is not clipped from the chart.

The UI is an interactive canvas: drag to pan, scroll to zoom, Fit to frame the tree. Use the pencil on a card (requires `edit-users`) to change that person’s **Reports to**.

## How the hierarchy works

The chart is a classic top-down tree. Edges come only from **Reports to** (`reporting_manager_id`). RBAC roles (Admin / HR / Manager / …) can change freely — they only show as badges and never redraw the tree.

On **Add staff**, set **Reports to** to the person above them. Leave empty for a top-level root.

| Field | Source | Chart use |
|-------|--------|-----------|
| Reports to | `users.reporting_manager_id` (fallback `manager_id`) | Parent/child edges |
| Designation | `designations` | Title under name |
| RBAC role | `roles` + `role_user` | Badge(s) only |
| Department / branch | `departments`, centers | Filters + subtitle |

## Related modules

- [Users & Roles](users-roles.md)
- [Designations](designations.md)
- [Branch RBAC](branch-rbac.md)
- [Dashboard](dashboard.md)
