# Python API Integration Test Cases
Generated: 2026-06-19 16:30
Run: `python scripts/<script>.py` or `run-complete-all-tests.ps1`

## Database health & optimization
- **Script:** `scripts/test-database-health.py`
- **Prefix:** `DB-xx` | **Cases:** 18 (expected 18)
| ID | Name | Run |
| --- | --- | --- |
| DB-01 | Database file exists | `python scripts/test-database-health.py` |
| DB-02 | Database file readable | `python scripts/test-database-health.py` |
| DB-03 | Integrity check | `python scripts/test-database-health.py` |
| DB-04 | Journal mode WAL (recommended) | `python scripts/test-database-health.py` |
| DB-05 | Foreign keys enabled on connection | `python scripts/test-database-health.py` |
| DB-06 | Busy timeout configured | `python scripts/test-database-health.py` |
| DB-07 | Page stats sane | `python scripts/test-database-health.py` |
| DB-08 | Freelist fragmentation acceptable | `python scripts/test-database-health.py` |
| DB-09 | Required performance indexes present | `python scripts/test-database-health.py` |
| DB-10 | Core schema tables exist | `python scripts/test-database-health.py` |
| DB-11 | Seed data present | `python scripts/test-database-health.py` |
| DB-12 | No orphan users (missing org) | `python scripts/test-database-health.py` |
| DB-13 | Primary org users have shift assignments | `python scripts/test-database-health.py` |
| DB-14 | Concurrent read connections (12 threads) | `python scripts/test-database-health.py` |
| DB-15 | User lookup uses index (EXPLAIN) | `python scripts/test-database-health.py` |
| DB-16 | PRAGMA optimize runs without error | `python scripts/test-database-health.py` |
| DB-18 | Payslips advanced payroll columns | `python scripts/test-database-health.py` |
| DB-17 | Backend health endpoint | `python scripts/test-database-health.py` |

## Biometric (iClock + punch pipeline)
- **Script:** `scripts/test-biometric-suite.py`
- **Prefix:** `TC-xx` | **Cases:** 22 (expected 22)
| ID | Name | Run |
| --- | --- | --- |
| TC-01 | Backend health | `python scripts/test-biometric-suite.py` |
| TC-02 | iClock handshake (7788) | `python scripts/test-biometric-suite.py` |
| TC-03 | Admin login | `python scripts/test-biometric-suite.py` |
| TC-04 | Biometric stats API (auth) | `python scripts/test-biometric-suite.py` |
| TC-05 | Punch list API (auth) | `python scripts/test-biometric-suite.py` |
| TC-06 | Unregistered SN not stored | `python scripts/test-biometric-suite.py` |
| TC-07 | First scan = Check In (type 0) | `python scripts/test-biometric-suite.py` |
| TC-08 | Check-in creates open attendance | `python scripts/test-biometric-suite.py` |
| TC-09 | Second scan = Check Out (type 1) | `python scripts/test-biometric-suite.py` |
| TC-10 | Check-out closes session | `python scripts/test-biometric-suite.py` |
| TC-11 | Third scan after checkout = Check In again | `python scripts/test-biometric-suite.py` |
| TC-12 | Re-check-in opens new session | `python scripts/test-biometric-suite.py` |
| TC-13 | Face inout=1 with no open session = Check In (not stuck on out) | `python scripts/test-biometric-suite.py` |
| TC-14 | Unmapped PIN stored (user_id NULL) | `python scripts/test-biometric-suite.py` |
| TC-15 | Exact duplicate punch skipped | `python scripts/test-biometric-suite.py` |
| TC-20 | Multiple attendance sessions same day allowed | `python scripts/test-biometric-suite.py` |
| TC-16 | Out-of-order batch: 13:00 in, 14:00 out, 14:30 in | `python scripts/test-biometric-suite.py` |
| TC-17 | After batch, Guru has open session from last check-in | `python scripts/test-biometric-suite.py` |
| TC-18 | API punch list includes test-day records | `python scripts/test-biometric-suite.py` |
| TC-19 | Mapped punches marked processed | `python scripts/test-biometric-suite.py` |
| TC-21 | Punch API rejects unauthenticated | `python scripts/test-biometric-suite.py` |
| TC-22 | Invalid device mapping rejected | `python scripts/test-biometric-suite.py` |

## SaaS / multi-tenant isolation
- **Script:** `scripts/test-saas-suite.py`
- **Prefix:** `SAAS-xx` | **Cases:** 30 (expected 30)
| ID | Name | Run |
| --- | --- | --- |
| SAAS-01 | API health | `python scripts/test-saas-suite.py` |
| SAAS-02 | Biometric port reachable | `python scripts/test-saas-suite.py` |
| SAAS-03 | Platform admin login | `python scripts/test-saas-suite.py` |
| SAAS-04 | Platform /auth/me | `python scripts/test-saas-suite.py` |
| SAAS-05 | Platform list organizations | `python scripts/test-saas-suite.py` |
| SAAS-06 | Platform subscription plans catalog | `python scripts/test-saas-suite.py` |
| SAAS-07 | Platform dashboard metrics | `python scripts/test-saas-suite.py` |
| SAAS-08 | Platform impersonate org 1 | `python scripts/test-saas-suite.py` |
| SAAS-09 | Impersonation token works on tenant /auth/me | `python scripts/test-saas-suite.py` |
| SAAS-10 | Platform JWT blocked from tenant /admin/* | `python scripts/test-saas-suite.py` |
| SAAS-11 | Tenant login with org_slug | `python scripts/test-saas-suite.py` |
| SAAS-12 | Wrong org_slug login rejected | `python scripts/test-saas-suite.py` |
| SAAS-13 | Tenant JWT blocked from platform routes | `python scripts/test-saas-suite.py` |
| SAAS-14 | Tenant /auth/me returns org context | `python scripts/test-saas-suite.py` |
| SAAS-15 | Cross-tenant user read blocked (org1 cannot read org2 user) | `python scripts/test-saas-suite.py` |
| SAAS-16 | Cross-tenant PIN mapping rejected (org2 user on org1 device) | `python scripts/test-saas-suite.py` |
| SAAS-17 | Tenant settings API (org1) | `python scripts/test-saas-suite.py` |
| SAAS-18 | Biometric module accessible (professional plan) | `python scripts/test-saas-suite.py` |
| SAAS-19 | Punch list scoped to tenant devices | `python scripts/test-saas-suite.py` |
| SAAS-20 | Attendance today API | `python scripts/test-saas-suite.py` |
| SAAS-21 | User list excludes other tenants | `python scripts/test-saas-suite.py` |
| SAAS-22 | Unauthenticated tenant API rejected | `python scripts/test-saas-suite.py` |
| SAAS-23 | Biometric device bound to org 1 | `python scripts/test-saas-suite.py` |
| SAAS-24 | Device punch stored for mapped tenant user | `python scripts/test-saas-suite.py` |
| SAAS-25 | New punch visible in tenant punch API | `python scripts/test-saas-suite.py` |
| SAAS-26 | Platform impersonate org 2 (trial tenant) | `python scripts/test-saas-suite.py` |
| SAAS-27 | Org2 cannot see org1 biometric punches | `python scripts/test-saas-suite.py` |
| SAAS-28 | Org2 device list excludes org1 hardware | `python scripts/test-saas-suite.py` |
| SAAS-29 | Public tenant signup (if enabled) | `python scripts/test-saas-suite.py` |
| SAAS-30 | New tenant isolated after signup | `python scripts/test-saas-suite.py` |

## Platform API (super-admin)
- **Script:** `scripts/test-platform-api-suite.py`
- **Prefix:** `PLAT-xx` | **Cases:** 2 (expected 34)
| ID | Name | Run |
| --- | --- | --- |
| PLAT-01 | Platform login | `python scripts/test-platform-api-suite.py` |
| PLAT-25 | Organization detail (org 1) | `python scripts/test-platform-api-suite.py` |

## Shift + attendance + payroll penalties
- **Script:** `scripts/test-shift-payroll-suite.py`
- **Prefix:** `SP-xx` | **Cases:** 16 (expected 16)
| ID | Name | Run |
| --- | --- | --- |
| SP-01 | Login | `python scripts/test-shift-payroll-suite.py` |
| SP-02 | List shift templates | `python scripts/test-shift-payroll-suite.py` |
| SP-03 | Find Demo Employee 1 | `python scripts/test-shift-payroll-suite.py` |
| SP-04 | User has shift resolved for test day | `python scripts/test-shift-payroll-suite.py` |
| SP-05 | Manual on-time attendance created | `python scripts/test-shift-payroll-suite.py` |
| SP-07 | Manual late+early attendance created | `python scripts/test-shift-payroll-suite.py` |
| SP-10 | Payroll preview with shift penalty | `python scripts/test-shift-payroll-suite.py` |
| SP-06 | On-time: not late, not early | `python scripts/test-shift-payroll-suite.py` |
| SP-08 | Late+early flags match shift rules | `python scripts/test-shift-payroll-suite.py` |
| SP-11 | Shift penalty formula (days × daily wage × factor) | `python scripts/test-shift-payroll-suite.py` |
| SP-12 | Net = gross - total deductions | `python scripts/test-shift-payroll-suite.py` |
| SP-09 | Biometric punch uses shift for late flag | `python scripts/test-shift-payroll-suite.py` |
| SP-13 | Today attendance API returns shift context | `python scripts/test-shift-payroll-suite.py` |
| SP-14 | Daily register attendance_status includes scheduled_off | `python scripts/test-shift-payroll-suite.py` |
| SP-15 | Manual bulk marking API | `python scripts/test-shift-payroll-suite.py` |
| SP-16 | Orphan check-out punch stays unprocessed | `python scripts/test-shift-payroll-suite.py` |

## Payroll + attendance integration
- **Script:** `scripts/test-payroll-attendance-suite.py`
- **Prefix:** `PA-xx` | **Cases:** 18 (expected 18)
| ID | Name | Run |
| --- | --- | --- |
| PA-01 | Tenant login | `python scripts/test-payroll-attendance-suite.py` |
| PA-02 | In-app clock-in API | `python scripts/test-payroll-attendance-suite.py` |
| PA-03 | In-app clock-out API | `python scripts/test-payroll-attendance-suite.py` |
| PA-04 | Today attendance sessions listed | `python scripts/test-payroll-attendance-suite.py` |
| PA-05 | Payroll employees API | `python scripts/test-payroll-attendance-suite.py` |
| PA-06 | Employees with salary structure | `python scripts/test-payroll-attendance-suite.py` |
| PA-07 | Attendance records from in-app + biometric | `python scripts/test-payroll-attendance-suite.py` |
| PA-08 | Biometric attendance synced to payroll table | `python scripts/test-payroll-attendance-suite.py` |
| PA-09 | Present days API vs DB (sample employee) | `python scripts/test-payroll-attendance-suite.py` |
| PA-10 | Sample employee has attendance data | `python scripts/test-payroll-attendance-suite.py` |
| PA-11 | Payroll preview API | `python scripts/test-payroll-attendance-suite.py` |
| PA-12 | Payroll preview calculation consistency | `python scripts/test-payroll-attendance-suite.py` |
| PA-13 | Attendance summary report | `python scripts/test-payroll-attendance-suite.py` |
| PA-14 | Payroll register report | `python scripts/test-payroll-attendance-suite.py` |
| PA-15 | Biometric stats available | `python scripts/test-payroll-attendance-suite.py` |
| PA-16 | Manual mark creates completed attendance for payroll | `python scripts/test-payroll-attendance-suite.py` |
| PA-17 | Payroll preview after attendance sync path | `python scripts/test-payroll-attendance-suite.py` |
| PA-18 | Generate locks payslip after refresh from attendance | `python scripts/test-payroll-attendance-suite.py` |

## HRM core (shift/salary/leave/workflow)
- **Script:** `scripts/test-hrm-core-integration-suite.py`
- **Prefix:** `HI-xx` | **Cases:** 30 (expected 30)
| ID | Name | Run |
| --- | --- | --- |
| HI-01 | Login | `python scripts/test-hrm-core-integration-suite.py` |
| HI-02 | Demo employee with shift + salary | `python scripts/test-hrm-core-integration-suite.py` |
| HI-03 | Employee has salary structure | `python scripts/test-hrm-core-integration-suite.py` |
| HI-04 | Shift user assignment API | `python scripts/test-hrm-core-integration-suite.py` |
| HI-05 | Salary structure API for employee | `python scripts/test-hrm-core-integration-suite.py` |
| HI-06 | Manual on-time attendance | `python scripts/test-hrm-core-integration-suite.py` |
| HI-07 | Manual late+early attendance | `python scripts/test-hrm-core-integration-suite.py` |
| HI-08 | Shift rules: on-time not late/early | `python scripts/test-hrm-core-integration-suite.py` |
| HI-09 | Shift rules: late+early flagged | `python scripts/test-hrm-core-integration-suite.py` |
| HI-10 | Payroll preview includes employee | `python scripts/test-hrm-core-integration-suite.py` |
| HI-11 | Salary flows into payroll (gross > 0) | `python scripts/test-hrm-core-integration-suite.py` |
| HI-12 | Attendance penalties in payroll | `python scripts/test-hrm-core-integration-suite.py` |
| HI-13 | Present days reflect attendance month | `python scripts/test-hrm-core-integration-suite.py` |
| HI-14 | Daily register shows employee attendance | `python scripts/test-hrm-core-integration-suite.py` |
| HI-15 | Create leave-submit workflow | `python scripts/test-hrm-core-integration-suite.py` |
| HI-16 | Create leave-approve workflow | `python scripts/test-hrm-core-integration-suite.py` |
| HI-17 | Leave submit (workflow trigger source) | `python scripts/test-hrm-core-integration-suite.py` |
| HI-18 | Leave submit fires workflow -> task | `python scripts/test-hrm-core-integration-suite.py` |
| HI-19 | Leave approve fires workflow -> task | `python scripts/test-hrm-core-integration-suite.py` |
| HI-20 | Payroll preview stable after leave workflow | `python scripts/test-hrm-core-integration-suite.py` |
| HI-21 | Leave types API | `python scripts/test-hrm-core-integration-suite.py` |
| HI-22 | Leave stats API | `python scripts/test-hrm-core-integration-suite.py` |
| HI-23 | Leave balance report includes employee | `python scripts/test-hrm-core-integration-suite.py` |
| HI-24 | Leave manage list API | `python scripts/test-hrm-core-integration-suite.py` |
| HI-25 | Demo employee login for leave | `python scripts/test-hrm-core-integration-suite.py` |
| HI-26 | Demo employee submits in-month leave | `python scripts/test-hrm-core-integration-suite.py` |
| HI-27 | Admin approves demo in-month leave | `python scripts/test-hrm-core-integration-suite.py` |
| HI-28 | Approved leave reflected in payroll leave_days | `python scripts/test-hrm-core-integration-suite.py` |
| HI-29 | Leave reject flow | `python scripts/test-hrm-core-integration-suite.py` |
| HI-30 | Employee leave list API | `python scripts/test-hrm-core-integration-suite.py` |

## Workflow engine
- **Script:** `scripts/test-workflow-suite.py`
- **Prefix:** `WF-xx` | **Cases:** 13 (expected 13)
| ID | Name | Run |
| --- | --- | --- |
| WF-01 | Tenant login | `python scripts/test-workflow-suite.py` |
| WF-02 | List workflows | `python scripts/test-workflow-suite.py` |
| WF-03 | Create active submit workflow | `python scripts/test-workflow-suite.py` |
| WF-04 | Submit leave triggers workflow | `python scripts/test-workflow-suite.py` |
| WF-05 | create_task action on submit | `python scripts/test-workflow-suite.py` |
| WF-06 | workflow_executions audit row | `python scripts/test-workflow-suite.py` |
| WF-07 | Inactive workflow skipped | `python scripts/test-workflow-suite.py` |
| WF-08 | leave_approved alias trigger | `python scripts/test-workflow-suite.py` |
| WF-09 | Condition filters leave_type | `python scripts/test-workflow-suite.py` |
| WF-10 | Duplicate workflow | `python scripts/test-workflow-suite.py` |
| WF-11 | Toggle workflow | `python scripts/test-workflow-suite.py` |
| WF-12 | Missing workflow returns 404 | `python scripts/test-workflow-suite.py` |
| WF-13 | Unknown action logs execution | `python scripts/test-workflow-suite.py` |

## Payroll compliance & exports
- **Script:** `scripts/test-payroll-compliance-suite.py`
- **Prefix:** `PC-xx` | **Cases:** 22 (expected 22)
| ID | Name | Run |
| --- | --- | --- |
| PC-01 | Tenant login | `python scripts/test-payroll-compliance-suite.py` |
| PC-02 | Payroll employees list | `python scripts/test-payroll-compliance-suite.py` |
| PC-03 | Employee attendance fields | `python scripts/test-payroll-compliance-suite.py` |
| PC-04 | Preview returns ready and skipped | `python scripts/test-payroll-compliance-suite.py` |
| PC-05 | Ready preview rows numeric | `python scripts/test-payroll-compliance-suite.py` |
| PC-06 | Generate payslip | `python scripts/test-payroll-compliance-suite.py` |
| PC-07 | Payslip PDF/HTML | `python scripts/test-payroll-compliance-suite.py` |
| PC-08 | PDF shows Overtime when OT>0 | `python scripts/test-payroll-compliance-suite.py` |
| PC-09 | Unlock+preview gross matches | `python scripts/test-payroll-compliance-suite.py` |
| PC-10 | Unlock+preview net consistent | `python scripts/test-payroll-compliance-suite.py` |
| PC-11 | Payroll checklist | `python scripts/test-payroll-compliance-suite.py` |
| PC-12 | Payroll runs list | `python scripts/test-payroll-compliance-suite.py` |
| PC-13 | Variable pay list | `python scripts/test-payroll-compliance-suite.py` |
| PC-14 | Reimbursements list | `python scripts/test-payroll-compliance-suite.py` |
| PC-15 | Pay groups list | `python scripts/test-payroll-compliance-suite.py` |
| PC-16 | Payroll reminder | `python scripts/test-payroll-compliance-suite.py` |
| PC-17 | Compliance export JSON | `python scripts/test-payroll-compliance-suite.py` |
| PC-18 | Bank NEFT file | `python scripts/test-payroll-compliance-suite.py` |
| PC-19 | Accounting journal export | `python scripts/test-payroll-compliance-suite.py` |
| PC-20 | Variable pay create | `python scripts/test-payroll-compliance-suite.py` |
| PC-21 | Payslips table has OT columns | `python scripts/test-payroll-compliance-suite.py` |
| PC-22 | Skipped rows omit invalid gross | `python scripts/test-payroll-compliance-suite.py` |

## Auth & security
- **Script:** `scripts/test-auth-security-suite.py`
- **Prefix:** `SEC-xx` | **Cases:** 16 (expected 16)
| ID | Name | Run |
| --- | --- | --- |
| SEC-01 | Tenant login | `python scripts/test-auth-security-suite.py` |
| SEC-02 | Platform login | `python scripts/test-auth-security-suite.py` |
| SEC-03 | Platform token rejected on /api/admin | `python scripts/test-auth-security-suite.py` |
| SEC-04 | Tenant token rejected on /api/platform | `python scripts/test-auth-security-suite.py` |
| SEC-05 | Admin route requires auth | `python scripts/test-auth-security-suite.py` |
| SEC-06 | Tampered JWT rejected | `python scripts/test-auth-security-suite.py` |
| SEC-07 | Missing payslip IDOR safe | `python scripts/test-auth-security-suite.py` |
| SEC-08 | Missing user IDOR safe | `python scripts/test-auth-security-suite.py` |
| SEC-09 | Path traversal blocked | `python scripts/test-auth-security-suite.py` |
| SEC-10 | Health endpoint no secrets | `python scripts/test-auth-security-suite.py` |
| SEC-11 | Forgot-password accepts request | `python scripts/test-auth-security-suite.py` |
| SEC-12 | Wrong OTP rejected | `python scripts/test-auth-security-suite.py` |
| SEC-13 | Forgot-password wrong org slug | `python scripts/test-auth-security-suite.py` |
| SEC-14 | Failed login attempts handled | `python scripts/test-auth-security-suite.py` |
| SEC-15 | SQL injection probe safe | `python scripts/test-auth-security-suite.py` |
| SEC-16 | Malformed preview body handled | `python scripts/test-auth-security-suite.py` |
