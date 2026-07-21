# Subscription

## Overview

Tenant view of current plan, module entitlements, user limits, and upgrade requests to the platform.

## Plan module

- **Key:** `subscription`
- **Permissions:** `manage-subscription`

## Frontend

| Route | Page |
|-------|------|
| `/admin/subscription` | Plan summary / upgrade request |

## Backend

**Handler:** `handlers/tenant_billing.rs`

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/admin/billing/plans` | Catalog |
| GET / POST | `/api/admin/billing/upgrade-request` | Request plan change |

Effective modules: subscription plan JSON + platform `tenant_feature_overrides` (`plan_limits.rs`).

## Related modules

- [Platform](platform.md) / [PLATFORM.md](../PLATFORM.md) — approve upgrades, edit plans
- All modules — gated by plan keys in [MODULES_OVERVIEW.md](../MODULES_OVERVIEW.md)
