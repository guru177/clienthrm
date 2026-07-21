# My Payslips

## Overview

Employee self-service view of generated payslips (read-only). Admins generate slips via [Payroll](payroll.md).

## Plan module

- **Key:** `my_payslips`
- **Permissions:** `view-my-payslips`

## Frontend

| Route | Page |
|-------|------|
| `/admin/my-payslips` | Employee payslip list / download |

## Backend

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/admin/me/payslips` | view-my-payslips |

Distribution / email: [PAYSLIP-DISTRIBUTION.md](../PAYSLIP-DISTRIBUTION.md). Workflow trigger `payslip_generated` may email employees when payroll creates slips.

## Database

| Table | Purpose |
|-------|---------|
| `payslips` | Filtered to `user_id = current user` |

## Related modules

- [Payroll](payroll.md) — generation
- [Users](users-roles.md) — employee identity
