# Grocery Benefits

## Overview

Admin configuration of grocery subsidy benefits and review of employee claims.

## Plan module

- **Key:** `grocery_benefits`
- **Permissions:** `view-grocery-benefits`, `manage-grocery-benefits`

## Frontend

| Route | Page |
|-------|------|
| `/admin/grocery-benefits` | Benefits + claims admin |

## Backend

**Handler:** `handlers/grocery_benefits.rs`

| Method | Path | Notes |
|--------|------|-------|
| CRUD | `/api/admin/grocery-benefits` | Benefit definitions |
| CRUD / review | `/api/admin/grocery-claims` | Claim pipeline |

Claim submit fires `grocery_claim_submitted` ([WORKFLOWS.md](../WORKFLOWS.md)).

## Database

| Table | Purpose |
|-------|---------|
| `grocery_benefits` | Org benefit rules |
| `grocery_claims` | Per-user claims by month |

## Related modules

- [My Grocery Benefits](my-grocery-benefits.md)
- [Users](users-roles.md)
- [Workflows](workflows.md)
- [Payroll](payroll.md) — optional compensation adjacency
