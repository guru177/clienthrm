# Module Documentation Index

Per-module reference for Raintech HRM. Each document covers purpose, permissions, UI routes, API endpoints, database tables, and typical workflows.

**Hubs**

| Doc | Description |
|-----|-------------|
| [MODULES_OVERVIEW.md](../MODULES_OVERVIEW.md) | Full 31-module catalog + platform map |
| [INTERCONNECTIONS.md](INTERCONNECTIONS.md) | How modules feed each other |
| [WORKFLOWS.md](../WORKFLOWS.md) | Automation engine reference |
| [DOCUMENTATION.md](../DOCUMENTATION.md) | Full project documentation |

---

## Tenant modules

| Module | Plan key | Document |
|--------|----------|----------|
| Auth & Onboarding | — | [auth-onboarding.md](auth-onboarding.md) |
| Dashboard | `dashboard` | [dashboard.md](dashboard.md) |
| Org Chart | `users` | [org-chart.md](org-chart.md) |
| Users & Roles | `users` | [users-roles.md](users-roles.md) |
| Centers | `centers` | [centers.md](centers.md) |
| Branch RBAC | — | [branch-rbac.md](branch-rbac.md) |
| Departments | `departments` | [departments.md](departments.md) |
| Designations | `designations` | [designations.md](designations.md) |
| Job Postings | `careers` | [careers.md](careers.md) |
| Applications | `job_applications` | [job-applications.md](job-applications.md) |
| Team Chat | `chat` | [team-chat.md](team-chat.md) |
| Attendance | `attendance` | [attendance.md](attendance.md) |
| Shifts | `shifts` | [shifts.md](shifts.md) |
| Biometric Devices | `biometric` | [biometric.md](biometric.md) |
| Manual Attendance | `manual_attendance` | [manual_attendance.md](manual_attendance.md) |
| Leave Requests | `leave` | [leave.md](leave.md) |
| Manage Leave | `leave_manage` | [leave-manage.md](leave-manage.md) |
| Holidays | `holidays` | [holidays.md](holidays.md) |
| Salaries & Payroll | `payroll` | [payroll.md](payroll.md) |
| My Payslips | `my_payslips` | [my-payslips.md](my-payslips.md) |
| Doctor Reports | `doctor_reports` | [doctor-reports.md](doctor-reports.md) |
| My Doctor Reports | `my_doctor_reports` | [my-doctor-reports.md](my-doctor-reports.md) |
| Grocery Benefits | `grocery_benefits` | [grocery-benefits.md](grocery-benefits.md) |
| My Grocery Benefits | `my_grocery_benefits` | [my-grocery-benefits.md](my-grocery-benefits.md) |
| Assets & Maintenance | `assets` | [assets.md](assets.md) |
| My Assets | `my_assets` | [my-assets.md](my-assets.md) |
| Workflows | `workflows` | [workflows.md](workflows.md) |
| Tasks | `tasks` | [tasks.md](tasks.md) |
| Projects | `projects` | [projects.md](projects.md) |
| Reports | `reports` | [reports.md](reports.md) |
| Subscription | `subscription` | [subscription.md](subscription.md) |
| Notifications | `notifications` | [notifications.md](notifications.md) |
| Support | `support` | [support.md](support.md) |
| App Settings | `settings` | [settings.md](settings.md) |
| Platform Admin (SaaS) | — | [platform.md](platform.md) · **[full guide](../PLATFORM.md)** |

Catalog source: `backend/src/plan_limits.rs` (`MODULE_CATALOG`).
