# Job Applications

## Overview

Candidate applications linked to job postings. Supports status pipeline, email to candidates, and resume webhook ingestion.

## Plan module

- **Key:** `job_applications`
- **Permissions:** `view-jobs` (read), `edit-jobs` (write actions)

## Frontend

| Route | Page |
|-------|------|
| `/admin/job-applications` | `pages/admin/careers/applications.tsx` |

## Backend

**Handler:** `handlers/job_applications.rs`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/admin/job-applications`, `/stats`, `/list` | view-jobs |
| POST | `/api/admin/job-applications` | edit-jobs |
| GET/DELETE | `/api/admin/job-applications/{id}` | view / edit |
| POST | `/api/admin/job-applications/{id}/update-status` | edit-jobs |
| POST | `/api/admin/job-applications/{id}/send-email` | edit-jobs |
| POST | `/api/webhooks/incoming-resume` | `X-Webhook-Secret` header |

## Database

| Table | Purpose |
|-------|---------|
| `job_applications` | Applicant info, resume path, status, career FK |

## Workflows

### Manual application

Admin creates application from UI → linked to career posting.

### Resume webhook

1. External form posts to `/api/webhooks/incoming-resume`.
2. Requires `WEBHOOK_SECRET` env and matching header.
3. Creates application with resume file in storage.

### Status pipeline

Typical statuses: applied → screening → interview → offered → rejected. Updated via `update-status`.

## Related modules

- [Careers](careers.md)
- [Settings](settings.md) — SMTP for `send-email`
