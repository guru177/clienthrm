# Centers (Work Locations)

## Overview

Physical or logical work centers / branches. Used for geo attendance, multi-location orgs, and settings.

## Plan module

- **Key:** `centers`
- **Permissions:** `manage-settings`

## Frontend

| Route | Page |
|-------|------|
| `/admin/centers` | `pages/admin/centers/index.tsx` |

## Backend

**Handler:** `handlers/centers.rs`

| Method | Path |
|--------|------|
| GET | `/api/admin/settings/centers` |
| POST | `/api/admin/settings/centers` |
| PUT/DELETE | `/api/admin/settings/centers/{id}` |

Alternate paths under `/api/admin/api/settings/centers` for legacy clients.

## Database

| Table | Purpose |
|-------|---------|
| `centers` | `organization_id`, name, address, geo coordinates, active flag |

## Workflows

1. Admin defines centers in Centers page.
2. Users or attendance rules may reference center for location-based clock-in (face/geo dialogs in attendance UI).

## Related modules

- [Settings](settings.md)
- [Attendance](attendance.md)
