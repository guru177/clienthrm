# Job Postings (Careers)

## Overview

Internal ATS job postings. HR creates openings; candidates apply via admin entry or public listing.

## Plan module

- **Key:** `careers`
- **Permissions:** `view-jobs`, `create-jobs`, `edit-jobs`, `delete-jobs`

## Frontend

| Route | Page |
|-------|------|
| `/admin/careers` | `pages/admin/careers/index.tsx` |

**Components:** `components/careers/career-table.tsx`, `career-form.tsx`, `job-form.tsx`, `job-table.tsx`

## Backend

**Handler:** `handlers/careers.rs`

### Admin API

| Method | Path |
|--------|------|
| GET | `/api/admin/careers`, `/stats`, `/list` |
| POST | `/api/admin/careers` |
| GET/PUT/DELETE | `/api/admin/careers/{id}` |

### Public API

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/public/careers?org_slug=` | None |

Returns active job listings for external career pages.

## Database

| Table | Purpose |
|-------|---------|
| `careers` | Job title, description, status, department, org scope |

## Workflows

1. HR creates posting → status `open`.
2. Public site or embed calls `/api/public/careers`.
3. Applications land in [Job Applications](job-applications.md).

## Related modules

- [Job Applications](job-applications.md)
