# Assets & Maintenance

## Overview

Asset inventory, allocation to employees, and expense / maintenance claim review.

## Plan module

- **Key:** `assets`
- **Permissions:** `view-assets`, `manage-assets`

## Frontend

| Route | Page |
|-------|------|
| `/admin/assets` | Inventory, allocations, expenses |

## Backend

**Handler:** `handlers/assets.rs`

| Method | Path | Notes |
|--------|------|-------|
| CRUD | `/api/admin/assets` | Catalog |
| CRUD | `/api/admin/asset-allocations` | Assign to users |
| CRUD / review | `/api/admin/asset-expenses` | Expense claims |

Expense submit fires `asset_expense_submitted` ([WORKFLOWS.md](../WORKFLOWS.md)).

## Database

| Table | Purpose |
|-------|---------|
| `assets` | Inventory |
| `asset_allocations` | User assignments |
| `asset_expenses` | Maintenance / expense claims |

## Related modules

- [My Assets](my-assets.md)
- [Users](users-roles.md)
- [Workflows](workflows.md)
