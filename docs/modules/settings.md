# App Settings

## Overview

Organization configuration: branding, SMTP, timezone, payroll defaults, leave policy, work centers, and user profile/password/appearance.

## Plan module

- **Key:** `settings` (and `centers` for work locations)
- **Permissions:** `manage-settings`

Some routes (profile, password) require only authentication — no `manage-settings`.

## Frontend

| Route | Page | Permission |
|-------|------|------------|
| `/admin/settings/app` | `pages/admin/settings/app-settings.tsx` | manage-settings |
| `/admin/settings/leave-types` | `pages/admin/settings/leave-types.tsx` | manage-settings |
| `/admin/settings/profile` | `pages/admin/settings/profile.tsx` | any user |
| `/admin/settings/password` | `pages/admin/settings/password.tsx` | any user |
| `/admin/settings/appearance` | `pages/admin/settings/appearance.tsx` | any user |

## Backend

**Handlers:** `handlers/settings.rs`, `handlers/centers.rs`, `handlers/leave_types.rs`, `handlers/leave_credits.rs`

### App settings

| Method | Path |
|--------|------|
| GET/POST | `/api/admin/settings/app` |
| POST | `/api/admin/settings/app/logo` |
| PUT | `/api/admin/settings/password` |
| PATCH/POST | `/api/admin/settings/profile` |

### Leave configuration

| Method | Path |
|--------|------|
| GET/POST | `/api/admin/settings/leave-types` |
| PUT | `/api/admin/settings/leave-types/{id}` |
| GET/PUT | `/api/admin/settings/leave-policy` |
| GET/POST/DELETE | `/api/admin/leave-credits` |

### Centers

See [Centers](centers.md).

## Database

| Table | Purpose |
|-------|---------|
| `app_settings` | Key/value per `organization_id` (SMTP, timezone, company name, etc.) |

Logo stored in `storage/` and referenced in settings JSON.

## Workflows

### Configure SMTP

1. App Settings → mail host, port, credentials.
2. Used by job application emails and notifications.

### Branding

Upload logo → `POST /api/admin/settings/app/logo` → displayed in sidebar via `AppLogo`.

## Related modules

- [Centers](centers.md)
- [Leave](leave.md)
- [Job Applications](job-applications.md) — email sending
