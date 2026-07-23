# Users & Roles

## Overview

Employee lifecycle management: create/edit users, profile photos, departments, designations, roles, and RBAC permissions. Includes salary profile shortcuts on user detail pages.

## Plan module

- **Key:** `users`
- **Permissions:**

| Permission | Action |
|------------|--------|
| `view-users` | List and view employees |
| `create-users` | Add employees |
| `edit-users` | Update profiles, assign roles |
| `delete-users` | Deactivate/remove |
| `view-roles` / `create-roles` / `edit-roles` / `delete-roles` | Role CRUD |
| `view-permissions` / `create-permissions` / `edit-permissions` / `delete-permissions` | Permission CRUD |
| `manage-user-roles` | Assign roles to users |
| `manage-permissions` | Attach permissions to roles |

Super admin (`is_super_admin` in DB) receives permission `*`.

## Frontend

| Route | Page |
|-------|------|
| `/admin/users` | `pages/admin/users/index.tsx` |
| `/admin/users/:id` | `pages/admin/users/view.tsx` |
| `/admin/users/:id/edit` | `pages/admin/users/edit.tsx` |
| `/admin/roles/:id/edit` | `pages/admin/roles/edit.tsx` |

**Components:** `components/users/user-table.tsx`, `components/roles/role-form.tsx`, `components/roles/role-table.tsx`

## Backend

**Handlers:** `handlers/users.rs`, `handlers/roles.rs`, `handlers/permissions.rs`

### Users API

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/admin/users` | `view-users` |
| GET | `/api/admin/users/stats` | `view-users` |
| GET | `/api/admin/users/list` | `view-users` |
| POST | `/api/admin/users` | `create-users` |
| GET | `/api/admin/users/{id}` | `view-users` |
| PUT/POST | `/api/admin/users/{id}` | `edit-users` |
| DELETE | `/api/admin/users/{id}` | `delete-users` |

Profile update supports multipart form (photo → `storage/users/{uuid}.jpg`).

### Roles API

| Method | Path |
|--------|------|
| GET/POST | `/api/admin/roles` |
| GET/PUT/DELETE | `/api/admin/roles/{id}` |
| GET | `/api/admin/roles/stats`, `/list` |

### Permissions API

| Method | Path |
|--------|------|
| GET/POST | `/api/admin/permissions` |
| GET/PUT/DELETE | `/api/admin/permissions/{id}` |
| GET | `/api/admin/permissions/list` |

### Salary shortcuts (on user)

| Method | Path |
|--------|------|
| GET/POST | `/api/admin/users/{id}/salary-structure` |
| GET/POST/DELETE | `/api/admin/users/{id}/ctc-profile` |
| GET/POST | `/api/admin/users/{id}/advances` |

## Database

| Table | Purpose |
|-------|---------|
| `users` | Employee records |
| `roles` | Named role per org |
| `permissions` | Permission slugs |
| `role_user` | User ↔ role |
| `permission_role` | Role ↔ permission |
| `departments`, `designations` | FK on users |

## Workflows

### Add employee

1. Admin opens Users → Create and sets name, email, and a temporary password.
2. `POST /api/admin/users` creates the account (plan `max_users` enforced).
3. Welcome email is sent with **login email + temporary password**, login link, and instruction to change the password under **Settings → Password** after first login.
4. Optional `user_created` workflow may also notify / create tasks.

### Role editing

1. Open role from Users module or `/admin/roles/:id/edit`.
2. Toggle permission checkboxes → `PUT /api/admin/roles/{id}`.

### Cross-tenant safety

User updates validate `organization_id`; role assignment cannot escalate across tenants.

### Branch scope

See [Branch-scoped RBAC](branch-rbac.md). Org admins get `access-all-centers`; branch admins are limited via `user_centers` / work branch.

## Related modules

- [Org Chart](org-chart.md) — reporting tree with designation + role badges
- [Departments](departments.md), [Designations](designations.md), [Branch RBAC](branch-rbac.md)
- [Payroll](payroll.md) — CTC on user profile
- [Settings](settings.md) — profile/password for self
