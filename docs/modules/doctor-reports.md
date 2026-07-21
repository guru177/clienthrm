# Doctor Reports

## Overview

Clinical / doctor visit reports (SOAP-style) for employees: create, edit, publish. Publishing can email the employee and fire workflows.

## Plan module

- **Key:** `doctor_reports`
- **Permissions:** `view-doctor-reports`, `create-doctor-reports`, `edit-doctor-reports`, `delete-doctor-reports`

## Frontend

| Route | Page |
|-------|------|
| `/admin/doctor-reports` | List / manage |
| `/admin/doctor-reports/*` | Create / view / edit |

## Backend

**Handler:** `handlers/doctor_reports.rs`

| Method | Path | Notes |
|--------|------|-------|
| CRUD | `/api/admin/doctor-reports` | Org-scoped |
| — | Publish path | Sets published status → email + `doctor_report_published` workflow |

Attachments may use storage under doctor-report paths (S3 dual-write when configured).

## Database

| Table | Purpose |
|-------|---------|
| `doctor_reports` | Employee, doctor, date, notes, status, files |

## Related modules

- [My Doctor Reports](my-doctor-reports.md) — employee read
- [Users](users-roles.md) — employee / doctor users
- [Workflows](workflows.md) — on publish
