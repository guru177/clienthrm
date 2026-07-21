# Branch-scoped RBAC

## Overview

In addition to permission slugs (e.g. `view-users`), admins can be limited to one or more **branches** (`centers`). Org-wide admins keep `access-all-centers`.

## Model

| Piece | Role |
|-------|------|
| Permission `access-all-centers` | Bypass branch filters (granted to `admin` / `administrator` only) |
| Table `user_centers` | Branches a user may **administer** |
| Fallback | If `user_centers` is empty → use numeric `users.work_location` |
| Role `branch-admin` | Operational admin modules **without** `access-all-centers` |

Employee membership for list filtering:

- `users.work_location` (center id as string), and/or
- `departments.center_id` via `users.department_id`, and/or
- rows in `user_centers`

## Auth payload

`GET /api/auth/me` and login include:

```json
"branch_scope": {
  "all_centers": true,
  "center_ids": []
}
```

When `all_centers` is false, `center_ids` lists allowed branch ids.

## How to set up a branch admin

1. Create branches under **Branches**.
2. Create / edit a user: set **Branch** (`work_location`) and optionally **Managed branches**.
3. Assign role **Branch Admin** (or any role with user/attendance/leave perms but **not** `access-all-centers`).
4. That user only sees users, departments, centers, attendance, and leave inside their scope.

## Enforced today

| Area | Behavior |
|------|----------|
| Users list / stats / show / CRUD | Branch filter + write guards |
| Departments list / create / update | Scoped by `center_id` |
| Centers list / update / delete | Scoped; **create** requires org-wide access |
| Attendance org list | Filtered for branch-scoped viewers |
| Leave manage list | Filtered for branch-scoped approvers |
| Payroll index / stats / employees / preview / generate / unlock | Employee-scoped |
| Payroll advanced (variable pay, reimbursements) | Lists + store gated |
| Reports (attendance summary, OOZ, payroll register, leave balance, daily + monthly registers) | Employee-scoped |
| Shifts roster + assign user | Scoped (templates stay org-wide) |
| Chat user directory | Scoped (existing memberships unchanged) |
| Assets allocations / expenses / allocate | People-linked rows scoped (inventory org-wide) |
| Grocery benefits + claims | Admin lists + enroll gated |
| Doctor reports (admin path) | Scoped to employee branch |
| Frontend `AuthContext` | `branchScope`, `canAccessAllCenters()`, `canAccessCenter(id)` |
| User edit UI | “Managed branches” checkboxes (org-wide admins) |

## Intentionally org-wide

| Area | Why |
|------|-----|
| Workflow definitions / executions | Org automation catalog; runtime targets still use org users |
| Shift **templates** CRUD | Shared schedule templates |
| Pay groups / payroll runs metadata | Org payroll process control |
| Asset **inventory** CRUD | Shared pool; allocations are scoped |
| Self-service (`my_*`) | Always own records |

## Related

- [Centers / Branches](centers.md)
- [Users & Roles](users-roles.md)
- [Departments](departments.md)
