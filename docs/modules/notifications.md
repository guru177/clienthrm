# Notifications

## Overview

Organization-wide (or department / designation) broadcast notifications. Admins compose messages; all users see an inbox bell. Workflows can also insert notifications.

## Plan module

- **Key:** `notifications`
- **Permissions:** `manage-org-notifications` (send / admin)

Inbox read is available to authenticated users via `/api/admin/org-notifications` (audience-filtered).

## Frontend

| Route | Page |
|-------|------|
| `/admin/notifications` | Compose / sent admin |
| Header bell | `components/org-notifications-panel.tsx` |

## Backend

**Handler:** `handlers/org_notifications.rs`

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/admin/org-notifications` | Inbox (limit 50) |
| GET | `/api/admin/org-notifications/unread-count` | Badge |
| GET | `/api/admin/org-notifications/sent` | Admin sent list |
| POST | `/api/admin/org-notifications` | Create broadcast |
| POST | `…/{id}/read`, `…/{id}/dismiss` | User actions |

Audience: `all` | `department` | `designation`.

## Database

| Table | Purpose |
|-------|---------|
| `org_notifications` | Title, body, severity, audience, image |
| `org_notification_reads` | Per-user read / dismiss |

## Related modules

- [Workflows](workflows.md) — `notification` action
- [Settings](settings.md) — branding / SMTP adjacency
- Platform announcements — separate tenant banner channel
