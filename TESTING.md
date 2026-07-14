# HR Daddy / HRM — Testing Guide

Phased coverage for the full stack. Prerequisites, commands, and pass bars match the comprehensive testing plan.

## Prerequisites

| Service | URL / port | Check |
|---------|------------|--------|
| PostgreSQL | `127.0.0.1:5433` | `docker compose up -d` |
| Rust API | `http://127.0.0.1:3001` | `GET /api/health` → `status: ok` |
| Tenant app | `http://127.0.0.1:5174` | Vite proxy `/api` → backend |
| Platform app | `http://127.0.0.1:5175` | Vite proxy `/api` → backend |

Default local credentials (override with env):

```text
HRM_EMAIL=info@retaildaddy.in
HRM_PASSWORD=Guru!1234
HRM_ORG=mashuptech
PLATFORM_ADMIN_EMAIL=admin@retaildaddy.in
PLATFORM_ADMIN_PASSWORD=LocalTest123!
```

Shared helpers live in [`scripts/test_helpers.py`](scripts/test_helpers.py).

---

## Phase 0 — Release gate (always first)

```powershell
python scripts/local-smoke-test.py
python scripts/pre-production-check.py
python scripts/module-create-test.py
```

Expect: infrastructure, auth, module GETs, user CRUD, and create smoke for department/designation/center/holiday/role/user.

---

## Phase 1 — Security

```powershell
python scripts/test-auth-security-suite.py
python scripts/test-gap-coverage-suite.py   # 2FA, chat write, storage IDOR
```

Requires: `pip install pyotp` for TOTP enable/disable cases.

---

## Phases 2–6 — Domain (auth, time, leave, payroll)

```powershell
python scripts/test-signup-flow-suite.py
python scripts/test-biometric-suite.py
python scripts/test-shift-payroll-suite.py
python scripts/test-hrm-core-integration-suite.py
python scripts/test-payroll-attendance-suite.py
python scripts/test-payroll-compliance-suite.py
cd backend; cargo test
```

---

## Phases 7–8 — Modules + platform

```powershell
python scripts/test-workflow-suite.py
python scripts/test-all-24-modules.py
python scripts/test-validation-suite.py
python scripts/test-saas-suite.py
python scripts/test-platform-api-suite.py
node scripts/platform-module-check.mjs   # needs platform on :5175
node scripts/frontend-module-check.mjs   # needs tenant on :5174
```

---

## Phase 9 — Frontend

```powershell
cd frontend
npm test                 # Vitest (also runs in PR CI)
npm run test:e2e         # Playwright specs
```

PR CI (`.github/workflows/test.yml`) runs Vitest plus `frontend-module-check.mjs` and `e2e-targeted-flows.mjs`.

---

## Phase 10 — Electron + production API

```powershell
cd frontend
npm run electron:build:hoteldaddy
# Installer: frontend/release-hoteldaddy/HR-Daddy-HotelDaddy-Setup-*.exe (~104 MB verified)

python scripts/test-production-api.py
# Default target: https://hrm-api.hoteldaddy.in/api
# Public paths always run. Authenticated checks need:
#   PROD_HRM_EMAIL / PROD_HRM_PASSWORD / PROD_HRM_ORG
#   PROD_PLATFORM_EMAIL / PROD_PLATFORM_PASSWORD
# Without those env vars, login checks are SKIPPED (not failed).
```

---

## Phase 11 — Database

```powershell
python scripts/test-database-health.py
cd backend; cargo test postgres_bind_tests
```

---

## Full local marathon

```powershell
powershell -File scripts/run-complete-all-tests.ps1
```

Nightly CI runs the same orchestrator (see `.github/workflows/nightly-tests.yml`).

---

## Rust unit additions (gap backlog)

| Module | Tests |
|--------|--------|
| `backend/src/totp_logic.rs` | secret roundtrip, otpauth URL, QR SVG |
| `backend/src/storage.rs` | path traversal reject, safe normalize, mime helpers |

```powershell
cd backend
cargo test totp_logic
cargo test path_authz_tests
cargo test postgres_bind_tests
```

---

## Pass / fail (release-ready)

- Phase 0–8 suites green on local Postgres + backend
- PR CI green including **Vitest**
- Nightly marathon green (or last run within 24h)
- Production smoke green for public endpoints (authenticated login when credentials exist)
- Hotel Daddy Electron installer ≤ ~150 MB
