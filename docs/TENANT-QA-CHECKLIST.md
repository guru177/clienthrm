# Tenant Admin Portal — Manual QA Checklist

Use this checklist before releases. Test org: `mashuptech` · Admin: `admin@mashuptech.in` / `password`

**Automated baseline:** `powershell -NoProfile -File scripts/run-all-tests.ps1`

---

## 1. Authentication & access

| # | Test | Steps | Expected | Pass |
|---|------|-------|----------|------|
| 1.1 | Login | `/login` → email + password + org slug | Redirect to dashboard | ☐ |
| 1.2 | Wrong password | Invalid password | Error message, no token | ☐ |
| 1.3 | Wrong org slug | Valid user, wrong slug | Rejected | ☐ |
| 1.4 | Session persist | Refresh page after login | Stays logged in | ☐ |
| 1.5 | Logout | User menu → logout | Redirect to login | ☐ |
| 1.6 | Unauthorized route | User without permission → restricted URL | `/unauthorized` | ☐ |
| 1.7 | Profile settings | `/admin/settings/profile` | Loads, save phone/name | ☐ |
| 1.8 | Password change | `/admin/settings/password` | Updates password | ☐ |

---

## 2. Dashboard

| # | Test | Expected | Pass |
|---|------|----------|------|
| 2.1 | HR metrics load | Cards/charts show data, no API 500 | ☐ |
| 2.2 | Plan-gated user | Trial user sees allowed modules only | ☐ |

---

## 3. Users & roles

| # | Test | Expected | Pass |
|---|------|----------|------|
| 3.1 | User list | Paginated list loads | ☐ |
| 3.2 | Create user | New employee appears in list | ☐ |
| 3.3 | Edit user | Department/designation saved | ☐ |
| 3.4 | User detail | View page shows salary tabs if permitted | ☐ |
| 3.5 | Role edit | Permissions save correctly | ☐ |
| 3.6 | Max users limit | Blocked at plan `max_users` | ☐ |

---

## 4. Organization structure

| Module | Create | Edit | Delete | List | Pass |
|--------|--------|------|--------|------|------|
| Departments | ☐ | ☐ | ☐ | ☐ | |
| Designations | ☐ | ☐ | ☐ | ☐ | |
| Centers | ☐ | ☐ | ☐ | ☐ | |

---

## 5. Attendance & shifts

| # | Test | Expected | Pass |
|---|------|----------|------|
| 5.1 | Clock in | Active session on Today tab | ☐ |
| 5.2 | Clock out | Session closed, duration shown | ☐ |
| 5.3 | Attendance list | Filters by date/user work | ☐ |
| 5.4 | Manual entry (admin) | Record created | ☐ |
| 5.5 | Shift templates | Create/edit template | ☐ |
| 5.6 | Shift roster | Assign user to shift | ☐ |
| 5.7 | Daily schedule | Day view loads | ☐ |

---

## 6. Biometric

| # | Test | Expected | Pass |
|---|------|----------|------|
| 6.1 | Device list | Org devices visible | ☐ |
| 6.2 | PIN mapping | Map employee to device PIN | ☐ |
| 6.3 | Live punch feed | WebSocket shows new punch | ☐ |
| 6.4 | Punch → attendance | Punch reflects in attendance | ☐ |

---

## 7. Leave & holidays

| # | Test | Expected | Pass |
|---|------|----------|------|
| 7.1 | Submit leave (employee) | Request pending | ☐ |
| 7.2 | Manage leave list | All pending visible to manager | ☐ |
| 7.3 | Approve leave | Status approved, quota updated | ☐ |
| 7.4 | Reject leave | Status rejected with reason | ☐ |
| 7.5 | Delete own pending | Employee can cancel pending | ☐ |
| 7.6 | Holiday CRUD | Create/edit/delete holiday | ☐ |
| 7.7 | Leave types settings | `/admin/settings/leave-types` | ☐ |

---

## 8. Payroll & salaries

| # | Test | Expected | Pass |
|---|------|----------|------|
| 8.1 | Salary components | Create earning/deduction component | ☐ |
| 8.2 | Employee salary structure | Assign CTC/components to user | ☐ |
| 8.3 | Payroll preview | Preview for month loads | ☐ |
| 8.4 | Payroll generate | Payslips created | ☐ |
| 8.5 | Payslip PDF | PDF downloads/opens | ☐ |
| 8.6 | My payslips | Employee sees own payslips only | ☐ |
| 8.7 | Unlock payslip (admin) | Employee can view after unlock | ☐ |

---

## 9. Careers & applications

| # | Test | Expected | Pass |
|---|------|----------|------|
| 9.1 | Job posting CRUD | Create/edit/toggle active | ☐ |
| 9.2 | Applications inbox | Applications list loads | ☐ |
| 9.3 | Application status | Update status/notes | ☐ |

---

## 10. Workflows, tasks, projects

| # | Test | Expected | Pass |
|---|------|----------|------|
| 10.1 | Create workflow | Saved with trigger type | ☐ |
| 10.2 | Toggle workflow | Active/inactive switch | ☐ |
| 10.3 | Leave triggers workflow | Action runs on approve | ☐ |
| 10.4 | Task CRUD | Create, edit status, assign | ☐ |
| 10.5 | Project CRUD | Create, edit, link tasks | ☐ |

---

## 11. Reports

| # | Test | Expected | Pass |
|---|------|----------|------|
| 11.1 | Attendance summary | Export/view data | ☐ |
| 11.2 | Payroll register | Month data loads | ☐ |
| 11.3 | Leave balance | Per-user balances | ☐ |

---

## 12. Team chat

| # | Test | Expected | Pass |
|---|------|----------|------|
| 12.1 | Channel list | Spaces load (plan must include `chat`) | ☐ |
| 12.2 | Send message | Message appears in thread | ☐ |
| 12.3 | DM | Direct message to colleague | ☐ |
| 12.4 | Reactions / pins | Emoji reaction works | ☐ |
| 12.5 | File upload | Attachment sends | ☐ |

---

## 13. Settings & subscription

| # | Test | Expected | Pass |
|---|------|----------|------|
| 13.1 | App settings | Logo, org name, policies save | ☐ |
| 13.2 | Subscription page | Current plan + upgrade options | ☐ |
| 13.3 | Upgrade request | Submit request, shows pending | ☐ |

---

## 14. Notifications (company admin)

| # | Test | Expected | Pass |
|---|------|----------|------|
| 14.1 | Compose text notification | Send to all employees | ☐ |
| 14.2 | Department targeting | Only dept employees receive | ☐ |
| 14.3 | Banner upload | Image shows in preview + inbox | ☐ |
| 14.4 | Bell inbox | Employees see unread badge | ☐ |
| 14.5 | Mark read / dismiss | Badge count decreases | ☐ |
| 14.6 | Delivery history grid | 3-column responsive grid | ☐ |

---

## 15. Platform announcements (read-only)

| # | Test | Expected | Pass |
|---|------|----------|------|
| 15.1 | Megaphone icon | Active announcements listed | ☐ |
| 15.2 | Auto popup | Modal on login for unread | ☐ |
| 15.3 | Banner image | Image fits without crop | ☐ |
| 15.4 | Dismiss | Stays dismissed after refresh | ☐ |

---

## 16. Support

| # | Test | Expected | Pass |
|---|------|----------|------|
| 16.1 | Knowledge base | Articles load | ☐ |
| 16.2 | Create ticket | Ticket appears in list | ☐ |
| 16.3 | Ticket thread | Reply saves | ☐ |

---

## 17. Security & multi-tenant

| # | Test | Expected | Pass |
|---|------|----------|------|
| 17.1 | Cross-tenant API | Org A token cannot read Org B user | ☐ |
| 17.2 | Expired subscription | Login blocked or read-only | ☐ |
| 17.3 | Platform JWT on tenant | Returns 401 | ☐ |
| 17.4 | File access | Storage URLs require auth token | ☐ |

---

## 18. Signup (if enabled)

| # | Test | Expected | Pass |
|---|------|----------|------|
| 18.1 | Check availability | Slug/email availability API | ☐ |
| 18.2 | Email OTP | OTP received / debug in dev | ☐ |
| 18.3 | Complete signup | New org + admin created | ☐ |
| 18.4 | Duplicate email | Rejected with clear error | ☐ |

---

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| QA | | | ☐ Pass ☐ Fail |
| Dev | | | |
| Product | | | |

**Notes:**

---

*Generated for Raintech HRM tenant portal. Update when modules change.*
