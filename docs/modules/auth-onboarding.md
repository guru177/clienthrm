# Auth & Onboarding

## Overview

Handles tenant authentication (login, refresh, logout, signup), JWT issuance, and first-run organization onboarding. Not gated by subscription plan modules — all authenticated users depend on this layer.

## Frontend

| Route | Page | Access |
|-------|------|--------|
| `/login` | `pages/auth/login.tsx` | Guest only |
| `/signup` | `pages/auth/signup.tsx` | Guest only (if backend allows) |
| `/auth/impersonate` | `pages/auth/impersonate.tsx` | Platform impersonation callback |
| `/onboarding` | `pages/onboarding/index.tsx` | Authenticated, incomplete onboarding |

**Key files**

- `contexts/AuthContext.tsx` — token storage (`hrm_token`), `/api/auth/me`, permissions, plan
- `lib/axios.ts` — Bearer interceptor, 401 redirect
- `lib/impersonation.ts` — impersonation session flags

## Backend

**Handlers:** `handlers/auth.rs`, `handlers/settings.rs` (onboarding)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | Public | Email + password (+ optional `org_slug`) |
| POST | `/api/auth/refresh` | Public | Rotate access token via refresh cookie/body |
| GET | `/api/auth/me` | JWT | User, roles, permissions, org plan |
| POST | `/api/auth/presence` | JWT | Super-admin online heartbeat |
| POST | `/api/auth/logout` | JWT | Revoke refresh token |
| POST | `/api/public/signup` | Public | Create org + admin (env-gated) |
| POST | `/api/onboarding/complete` | JWT | Mark org onboarding done |

## JWT claims (tenant)

| Claim | Purpose |
|-------|---------|
| `sub` | User ID |
| `email` | Login email |
| `organization_id` | Tenant scope |
| `org_slug` | Org identifier for login |
| `is_super_admin` | Hint only — verified from DB on each request |
| `aud` | Must be `"tenant"` |

## Database

| Table | Purpose |
|-------|---------|
| `users` | Credentials, org membership |
| `organizations` | Tenant record, plan, onboarding flag |
| `jwt_refresh_tokens` | Refresh token rotation |

## Workflows

### Login

1. User submits email/password (+ org slug if multi-org email collision).
2. Backend validates bcrypt hash, loads permissions and plan.
3. Returns access JWT + sets refresh token.
4. Frontend stores token, redirects to default admin route.

### Signup (public)

1. `POST /api/public/signup` with org name, admin details.
2. Creates organization, default roles, super admin user.
3. Disabled in production unless `ALLOW_PUBLIC_SIGNUP=1`.

### Impersonation

1. Platform admin calls `POST /api/platform/organizations/{id}/impersonate`.
2. Receives tenant JWT; frontend opens `/auth/impersonate?token=...`.
3. `ImpersonationBanner` shows elevated session warning.

## Security

- Rate limiting on login, refresh, signup (`rate_limit.rs`).
- JWT audience strictly validated (`aud: tenant`).
- Refresh tokens stored hashed in DB.
