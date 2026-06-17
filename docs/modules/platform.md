# Platform Admin (SaaS)

> **Full platform documentation:** [docs/PLATFORM.md](../PLATFORM.md) — complete guide with API reference, impersonation flow, deployment, and troubleshooting.

## Quick reference

| Item | Value |
|------|-------|
| Directory | `platform/` |
| Dev URL | `http://localhost:5175` |
| API prefix | `/api/platform/*` |
| Token key | `hrm_platform_token` |
| JWT audience | `aud: "platform"` |

## Screens

| Route | Feature |
|-------|---------|
| `/` | Dashboard stats |
| `/users` | Organizations CRUD + impersonate |
| `/subscription-plans` | Plan catalog + org subscriptions |
| `/ip-tracking` | Live super-admin map |
| `/releases` | Release notes (localStorage) |
| `/login` | Platform auth |

## Key backend files

- `handlers/platform.rs` — auth, orgs, dashboard, IP tracking, impersonate
- `handlers/subscription_plans.rs` — plan CRUD
- `middleware/platform_auth.rs` — platform JWT
- `plan_limits.rs` — module catalog
- `subscription_period.rs` — expiry and renewal

## Key frontend files

- `contexts/PlatformAuthContext.tsx`
- `lib/platform-api.ts`
- `lib/app-urls.ts` — impersonation redirect
- `components/organizations-panel.tsx`

## Impersonation (summary)

1. `POST /api/platform/organizations/{id}/impersonate`
2. Redirect to `{VITE_TENANT_APP_URL}/auth/impersonate?token=...`
3. Tenant app stores JWT and shows impersonation banner

See [PLATFORM.md § Impersonation](../PLATFORM.md#10-impersonation) for the full sequence diagram.

## Default plans

`trial`, `starter`, `professional`, `enterprise` — seeded in `db/migrations.rs`. See [PLATFORM.md § Subscription plans](../PLATFORM.md#9-subscription-plans).

## Related

- [Auth & Onboarding](auth-onboarding.md)
- [Full project doc](../DOCUMENTATION.md)
