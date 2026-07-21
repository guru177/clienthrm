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
| POST | `/api/public/signup/check-availability` | Public | Early slug / company / admin email checks |
| POST | `/api/public/signup/send-otp` | Public | Send email or WhatsApp OTP for signup |
| POST | `/api/public/signup` | Public | Create org + admin (requires OTP unless bypass) |
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

Requires `ALLOW_PUBLIC_SIGNUP=1`. Optional dev flags: `SIGNUP_OTP_DEBUG=1` (return OTP in API response), `SIGNUP_OTP_BYPASS=1` (skip OTP verification — dev only).

1. **Step 1 — Company** (`/signup`): user enters org name, slug, contact, company email/phone, country, timezone.
2. **Availability** — `POST /api/public/signup/check-availability` with `org_slug` and `company_email` (step 1); again with `admin_email` on step 2.
3. **Step 2 — Admin** — name, work email, mobile, password.
4. **Step 3 — OTP** — `POST /api/public/signup/send-otp` (`channel`: `email` or `whatsapp`); user enters code.
5. **Create** — `POST /api/public/signup` with full payload plus `verification_id` and `otp`.
6. Backend creates organization (trial plan), seeds defaults, super-admin user, returns tenant JWT.

Duplicate checks: organization slug, company email (organizations table), and admin work email (users table). Emails must match `local@domain.tld` format.

### Impersonation

1. Platform admin calls `POST /api/platform/organizations/{id}/impersonate`.
2. Receives tenant JWT; frontend opens `/auth/impersonate?token=...`.
3. `ImpersonationBanner` shows elevated session warning.

## Security

- Rate limiting on login, refresh, signup (`rate_limit.rs`).
- JWT audience strictly validated (`aud: tenant`).
- Refresh tokens stored hashed in DB.
