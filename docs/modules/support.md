# Support

## Overview

Tenant helpdesk: open support tickets and read knowledge-base articles. Platform operators reply in the SaaS console.

## Plan module

- **Key:** `support`
- **Permissions:** `view-support`

## Frontend

| Route | Page |
|-------|------|
| `/admin/support` | Tickets + KB |

## Backend

| Method | Path | Notes |
|--------|------|-------|
| CRUD | `/api/admin/support/tickets` | Tenant tickets |
| GET | `/api/admin/kb` | Published KB articles |

Platform side: `/api/platform/…` support handlers — see [PLATFORM.md](../PLATFORM.md).

## Database

| Table | Purpose |
|-------|---------|
| `platform_support_tickets` | Ticket thread |
| `platform_kb_articles` | Knowledge base |

## Related modules

- [Platform](platform.md)
- [Settings](settings.md)
