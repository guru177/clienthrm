# Playwright / Browser Test Cases

Generated: 2026-06-19 16:30

Requires Chromium via `cd frontend && npx playwright install chromium`.

## Tenant admin page navigator

- **Script:** `frontend-module-check.mjs`
- **Prefix:** `FM` | **Cases:** 31
- **Run:** `node frontend-module-check.mjs`

## 25-module UI catalog

- **Script:** `test-all-24-modules-ui.mjs`
- **Prefix:** `UI` | **Cases:** 25
- **Run:** `node test-all-24-modules-ui.mjs`

## Targeted E2E (auth/payroll/leave)

- **Script:** `e2e-targeted-flows.mjs`
- **Prefix:** `E2E` | **Cases:** 9
- **Run:** `node e2e-targeted-flows.mjs`

| ID | Name |
| --- | --- |
| E2E-01 | Forgot-password page loads |
| E2E-02 | Forgot-password submit no crash |
| E2E-03 | OTP step UI present |
| E2E-04 | Payroll page loads |
| E2E-05 | Advanced payroll page loads |
| E2E-06 | No NaN currency on advanced payroll |
| E2E-07 | Workflows page loads |
| E2E-08 | Leave requests page loads (workflow trigger source) |
| E2E-00 | Unexpected E2E error |

## Tenant UI browser nav + error probe

- **Script:** `ui-nav-check.mjs`
- **Prefix:** `NAV` | **Cases:** ~28 routes
- **Run:** `node ui-nav-check.mjs`

## Platform admin page navigator

- **Script:** `platform-module-check.mjs`
- **Prefix:** `PFM` | **Cases:** 15
- **Run:** `node platform-module-check.mjs`

## Tenant UI form input flows

- **Script:** `frontend/scripts/ui-input-flow-check.mjs`
- **Prefix:** `UIF` | **Cases:** 14
- **Run:** `node frontend/scripts/ui-input-flow-check.mjs`

| ID | Name |
| --- | --- |
| Auth | Login with email/password |
| Departments | Create (name + description) |
| Designations | Create designation |
| Centers | Create center (address form) |
| Holidays | Create holiday (name + date) |
| Leave | Submit request (type, dates, reason) |
| Tasks | Create task (title, description) |
| Workflows | Create workflow (name + trigger) |
| Projects | Create project |
| Settings | Profile: update phone (personal tab) |
| Attendance | Load today sessions + stats |
| Payroll | Select employee checkbox |
| Dashboard | HR metrics charts load |
| Runner | Unhandled error |

