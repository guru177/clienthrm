# Modules Overview

Canonical catalog of **31 tenant plan modules** (`backend/src/plan_limits.rs` → `MODULE_CATALOG`), plus auth/public surfaces and the platform console.

| Doc | Purpose |
|-----|---------|
| [modules/README.md](modules/README.md) | Per-module index |
| [modules/INTERCONNECTIONS.md](modules/INTERCONNECTIONS.md) | Cross-module data & process graph |
| [WORKFLOWS.md](WORKFLOWS.md) | Automation triggers, actions, fire sites |
| [PLATFORM.md](PLATFORM.md) | SaaS console |
| [DOCUMENTATION.md](DOCUMENTATION.md) | Full project bible |

---

## Tenant plan modules

| Key | Label | UI route(s) | API prefix | Doc |
|-----|-------|-------------|------------|-----|
| `dashboard` | Dashboard | `/admin/dashboard` | `/api/admin/dashboard` | [dashboard](modules/dashboard.md) |
| `users` | Users & Roles | `/admin/users`, `/admin/roles/:id/edit` | `/api/admin/users`, `/roles`, `/permissions` | [users-roles](modules/users-roles.md) |
| `centers` | Centers / Branches | `/admin/centers`, `/admin/settings/work-locations` | `/api/admin/settings/centers` | [centers](modules/centers.md) |
| `departments` | Departments | `/admin/departments` | `/api/admin/departments` | [departments](modules/departments.md) |
| `designations` | Designations | `/admin/designations` | `/api/admin/designations` | [designations](modules/designations.md) |
| `careers` | Job Postings | `/admin/careers`, public `/careers` | `/api/admin/careers`, `/api/public/careers` | [careers](modules/careers.md) |
| `job_applications` | Applications | `/admin/job-applications` | `/api/admin/job-applications` | [job-applications](modules/job-applications.md) |
| `chat` | Team Chat | `/admin/chat` | `/api/admin/chat` | [team-chat](modules/team-chat.md) |
| `attendance` | Attendance | `/admin/attendance`, `/admin/live-locations`, `/admin/team/attendance` | `/api/admin/attendance`, `/api/admin/manager/attendance` | [attendance](modules/attendance.md) |
| `shifts` | Shifts | `/admin/shifts`, roster, daily | `/api/admin/shifts` | [shifts](modules/shifts.md) |
| `biometric` | Biometric Devices | `/admin/biometric` | `/api/admin/biometric` (+ device `:7788`) | [biometric](modules/biometric.md) |
| `manual_attendance` | Manual Attendance | `/admin/manual-attendance` | `POST …/attendance/manual` | [manual_attendance](modules/manual_attendance.md) |
| `leave` | Leave Requests | `/admin/leave-requests` | `/api/admin/leave-requests` | [leave](modules/leave.md) |
| `leave_manage` | Manage Leave | `/admin/leave-requests/manage`, `/admin/team/leave` | `/api/admin/leave-requests/manage`, `/api/admin/manager/leave-requests` | [leave-manage](modules/leave-manage.md) |
| `holidays` | Holidays | `/admin/holidays` | `/api/admin/holidays` | [holidays](modules/holidays.md) |
| `payroll` | Salaries & Payroll | `/admin/salaries`, `/admin/payroll`, `/admin/payroll/advanced` | `/api/admin/payroll`, `/salaries`, `/payslips` | [payroll](modules/payroll.md) |
| `my_payslips` | My Payslips | `/admin/my-payslips` | `/api/admin/me/payslips` | [my-payslips](modules/my-payslips.md) |
| `doctor_reports` | Doctor Reports | `/admin/doctor-reports` | `/api/admin/doctor-reports` | [doctor-reports](modules/doctor-reports.md) |
| `my_doctor_reports` | My Doctor Reports | `/admin/my-doctor-reports` | `/api/admin/me/doctor-reports` | [my-doctor-reports](modules/my-doctor-reports.md) |
| `grocery_benefits` | Grocery Benefits | `/admin/grocery-benefits` | `/api/admin/grocery-benefits`, `/grocery-claims` | [grocery-benefits](modules/grocery-benefits.md) |
| `my_grocery_benefits` | My Grocery Benefits | `/admin/my-grocery-benefits` | `/api/admin/grocery-benefits/my-status` | [my-grocery-benefits](modules/my-grocery-benefits.md) |
| `assets` | Assets & Maintenance | `/admin/assets` | `/api/admin/assets`, allocations, expenses | [assets](modules/assets.md) |
| `my_assets` | My Assets | `/admin/my-assets` | `/api/admin/my-assets` | [my-assets](modules/my-assets.md) |
| `workflows` | Workflows | `/admin/workflows` | `/api/admin/workflows` | [workflows](modules/workflows.md) · [WORKFLOWS.md](WORKFLOWS.md) |
| `tasks` | Tasks & Activities | `/admin/tasks` | `/api/admin/tasks` | [tasks](modules/tasks.md) |
| `projects` | Projects | `/admin/projects` | `/api/admin/projects` | [projects](modules/projects.md) |
| `reports` | Reports | `/admin/reports` | `/api/admin/reports` | [reports](modules/reports.md) |
| `subscription` | Subscription | `/admin/subscription` | `/api/admin/billing` | [subscription](modules/subscription.md) |
| `notifications` | Notifications | `/admin/notifications` | `/api/admin/org-notifications` | [notifications](modules/notifications.md) |
| `support` | Support | `/admin/support` | `/api/admin/support`, `/api/admin/kb` | [support](modules/support.md) |
| `settings` | App Settings | `/admin/settings/*` | `/api/admin/settings`, integrations, 2FA | [settings](modules/settings.md) |

**Auth / onboarding (not plan keys):** [auth-onboarding](modules/auth-onboarding.md) — `/login`, `/signup`, `/api/auth/*`, `/api/public/signup/*`.

**Smoke catalog:** `scripts/test-all-24-modules.py` (one GET probe per module).

---

## Entitlement model

1. Organization has a **subscription plan** (`subscription_plans.modules` JSON).
2. Platform may apply **feature overrides** (`tenant_feature_overrides`).
3. Effective modules → RBAC permission slugs via `permissions_for_module()` in `plan_limits.rs`.
4. Sidebar (`frontend/src/lib/admin-nav.ts`) and `PermissionRoute` hide pages the plan does not include.

---

## Platform console (separate app)

App: `platform/` · API: `/api/platform/*` · Docs: [PLATFORM.md](PLATFORM.md), [modules/platform.md](modules/platform.md).

| Screen | Route | Role |
|--------|-------|------|
| Dashboard | `/` | SaaS KPIs |
| Organizations | `/users`, `/tenants/:id` | Tenant CRUD, impersonate |
| Plans | `/subscription-plans` | Module catalogs & limits |
| Billing / upgrades | `/revenue`, `/upgrade-requests` | Invoices, plan changes |
| Support / KB | `/support` | Tickets & articles |
| Announcements / releases | `/announcements`, `/releases` | Tenant banners & desktop |
| Audit / team / health | `/audit-log`, `/platform-team`, `/system-health` | Ops |

---

## Domain groups (quick mental model)

```
Org structure     users · departments · designations · centers
Time              shifts · attendance · biometric · manual_attendance · live locations
Leave             leave · leave_manage · holidays
Compensation      payroll · my_payslips · (attendance + leave + holidays feed LOP)
Recruitment       careers · job_applications
Work ops          projects · tasks · workflows
Benefits / ops    doctor_* · grocery_* · assets*
Comms             chat · notifications · support
Governance        reports · subscription · settings · dashboard
```

For how data flows between these, see [INTERCONNECTIONS.md](modules/INTERCONNECTIONS.md).
