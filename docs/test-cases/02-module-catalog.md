# 25-Module Catalog Test Cases

Generated: 2026-06-19 16:30

## API catalog (`test-all-24-modules.py`)

Run: `python scripts/test-all-24-modules.py`

| ID | Name |
| --- | --- |
| M0-01 | Catalog defines exactly 25 modules |
| M0-02 | UI route map covers all 25 modules |
| M0-03 | Platform modules catalog API returns 25 keys |
| M0-04 | Platform catalog keys match tenant MODULE_CATALOG order |
| M0-05 | Tenant admin login |
| M0-06 | Tenant plan exposes module list |
| M0-07 | Manual attendance bulk mark API |

## Per-module API routes (MOD-xx)

| ID | Module | Endpoint |
|----|--------|----------|
| MOD-01 | Dashboard | `/api/admin/dashboard/hr-data` |
| MOD-02 | Users & Roles | `/api/admin/users/list` |
| MOD-03 | Centers | `/api/admin/api/settings/centers` |
| MOD-04 | Departments | `/api/admin/departments/list` |
| MOD-05 | Designations | `/api/admin/designations/list` |
| MOD-06 | Job Postings | `/api/admin/careers/list` |
| MOD-07 | Applications | `/api/admin/job-applications/list` |
| MOD-08 | Team Chat | `/api/admin/chat/spaces` |
| MOD-09 | Attendance | `/api/admin/attendance/today` |
| MOD-10 | Shifts | `/api/admin/shifts` |
| MOD-11 | Biometric Devices | `/api/admin/biometric/devices` |
| MOD-12 | Manual Attendance | `/api/admin/reports/daily-attendance?date=2026-06-17` |
| MOD-13 | Leave Requests | `/api/admin/leave-requests/list` |
| MOD-14 | Manage Leave | `/api/admin/leave-requests/manage/list` |
| MOD-15 | Holidays | `/api/admin/holidays/list` |
| MOD-16 | Salaries & Payroll | `/api/admin/payroll/list` |
| MOD-17 | My Payslips | `/api/admin/me/payslips` |
| MOD-18 | Workflows | `/api/admin/workflows/list` |
| MOD-19 | Tasks & Activities | `/api/admin/tasks/list` |
| MOD-20 | Projects | `/api/admin/projects/list` |
| MOD-21 | Reports | `/api/admin/reports/attendance-summary` |
| MOD-22 | Subscription | `/api/admin/billing/plans` |
| MOD-23 | Notifications | `/api/admin/org-notifications` |
| MOD-24 | Support | `/api/admin/support/tickets` |
| MOD-25 | App Settings | `/api/admin/settings/app` |

## UI catalog (`test-all-24-modules-ui.mjs`)

Run: `node scripts/test-all-24-modules-ui.mjs`

| ID | Page |
| --- | --- |
