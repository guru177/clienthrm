# HRM Enterprise QA Verification Report

**Date:** 2026-06-24  
**Role:** Senior QA / Security / Performance / Architecture review  
**Method:** Static code analysis + automated test execution + runtime API probes  
**Environment:** Windows dev — SQLite, backend `:3001`, tenant UI `:5174`, biometric `:7788`

---

## Executive summary

| Layer | Result | Evidence |
|-------|--------|----------|
| Rust unit tests | **31/31 PASS** | `cargo test` |
| Database health | **19/19 PASS** | `test-database-health.py` |
| Auth & security | **16/17 PASS** | SEC-11 forgot-password SMTP failure → HTTP 500 |
| SaaS multi-tenant | **30/30 PASS** | `test-saas-suite.py` |
| Workflow engine | **13/13 PASS** | `test-workflow-suite.py` |
| API module catalog | **33/33 PASS** | `test-all-24-modules.py` |
| Biometric | **22/22 PASS** | `test-biometric-suite.py` |
| Payroll compliance | **20/22 PASS** | PC-07/08 test expects HTML; API returns PDF |
| Tenant frontend build | **PASS** | `npm run build` (chunk size warnings) |
| Platform frontend build | **PASS** | `npm run build` |
| Frontend module navigation | **31/31 PASS** | `frontend-module-check.mjs` (Playwright) |

**Production readiness score: 86 / 100**

**Blockers before production:** restart backend to deploy security hardening; fix or document SEC-11 SMTP dependency; update payroll compliance tests for PDF responses.

---

## Step 1 — Project discovery

| Area | Stack |
|------|-------|
| Backend | Rust 2021, Actix-web 4, SQLite/PostgreSQL |
| Tenant UI | React 19, Vite 7, Tailwind 4, Axios, Context API |
| Platform UI | React 19, Vite 7, Leaflet |
| Database | SQLite (`database/database.sqlite`), PG via `DATABASE_URL` |
| Auth | JWT (tenant + platform), refresh tokens, RBAC middleware |
| Biometric | HTTP `:7788` + TCP `:5010` |
| Jobs | `jobs/` — biometric worker, retention, payroll queue |
| CI | GitHub Actions — Rust, Python API, PG migrate, Playwright smoke |
| Test harness | 21-suite orchestrator (`run-complete-all-tests.ps1`) |

**Folder layout:** `backend/`, `frontend/`, `platform/`, `database/`, `scripts/`, `deploy/`, `docs/`

---

## Step 2 — Static code verification

### Verified clean
- No `TODO`/`FIXME` in `frontend/src`
- Tenant + platform **build without type errors**
- Routes wired in `frontend/src/main.tsx` for all major admin pages
- RBAC middleware on `/api/admin/*` (`middleware/rbac.rs`)

### Issues found (static)

| ID | Severity | Issue | Files |
|----|----------|-------|-------|
| ST-01 | High | Tenant 2FA hooks call **non-existent** APIs `/api/two-factor/*` | `frontend/src/hooks/use-two-factor-auth.ts` |
| ST-02 | Medium | `work-locations.tsx` calls dead API; route redirects to `/admin/centers` | `work-locations.tsx`, `routes.rs` |
| ST-03 | Medium | `unwrap()` in production handlers (panic risk on DB errors) | `handlers/payroll.rs`, `leave_requests.rs`, `salaries.rs` |
| ST-04 | Low | Duplicate centers path `/api/admin/api/settings/centers` | `routes.rs` |
| ST-05 | Low | Legacy HTML payslip renderer unused (PDF is canonical) | `payslip_render.rs` |
| ST-06 | Perf | Main bundle **1.36 MB** gzip 350 KB | `frontend` build output |

---

## Step 3 — Frontend testing

**Runtime (Playwright):** 31/31 admin modules load without error.

| Check | Status |
|-------|--------|
| Routing | ✅ All major routes in `main.tsx` |
| Auth guard | ✅ `ProtectedRoute` / `GuestRoute` |
| Permission gating | ✅ `PermissionRoute` per module |
| Lazy loading | ✅ `React.lazy` + `Suspense` |
| Public careers | ✅ `/careers` page added (fetches `/api/public/careers`) |
| Tenant 2FA settings | ⚠️ Page wired; backend APIs missing; enable disabled |
| Theme | ✅ Dark mode via `use-appearance` |
| Bundle size | ⚠️ Chunks >500 KB (xlsx, charts, main) |

**Not runtime-tested this session:** accessibility audit, mobile breakpoints, offline mode.

---

## Step 4 — Backend testing

**Rust:** 31 unit tests pass including Razorpay signature verification.

| Area | Status |
|------|--------|
| ~100 tenant routes | ✅ Module catalog 33/33 |
| Platform routes | ✅ SaaS suite 30/30 |
| Rate limiting | ✅ Auth endpoints; global middleware in **source** (see deploy note) |
| Health endpoint | ⚠️ **Running server returns old format** — restart required |
| iClock on main API | ⚠️ **Running server still responds 400** on `:3001/iclock/*`; source removes it; `:7788` returns 200 |

---

## Step 5 — API contract mismatches

| Frontend expects | Backend provides | Status |
|------------------|------------------|--------|
| `/api/two-factor/qr-code` etc. | Not registered | ❌ Dead |
| `/admin/api/settings/work-locations` | Not registered | ❌ Dead (use `/admin/settings/centers`) |
| Payslip PDF as downloadable binary | `application/pdf` | ✅ Correct; **test script outdated** |
| Payroll email `sent/skipped` | `queued/count` (async) | ✅ Frontend updated in `payroll/index.tsx` |
| `/api/public/careers?org_slug=` | `handlers/careers::public_list` | ✅ |

---

## Step 6 — Database testing

**19/19 PASS** — indexes, schema, orphans, concurrency, ANALYZE, seed data.

| Check | Result |
|-------|--------|
| Orphan users | 0 |
| Index parity | 19 indexes verified |
| PG RLS | Skipped locally (SQLite); auto-enable in release PG builds (source) |

---

## Step 7 — Authentication testing

| Test | Result |
|------|--------|
| Tenant login | ✅ SEC-01 |
| Platform login | ✅ SEC-02 |
| Cross-audience JWT rejection | ✅ SEC-03, SEC-04 |
| Protected routes 401 | ✅ SEC-05 |
| Tampered JWT | ✅ SEC-06 |
| IDOR (missing payslip/user) | ✅ SEC-07, SEC-08 |
| Path traversal files | ✅ SEC-09 |
| Forgot password | ❌ SEC-11 HTTP **500** when SMTP send fails |
| Wrong OTP | ✅ SEC-12 |
| Brute-force login | ✅ SEC-14 |
| SQL injection probe | ✅ SEC-15 |
| Cross-tenant isolation | ✅ SEC-17 |

**SEC-11 root cause:** `issue_password_reset_otp` fails when SMTP cannot send (Hostinger 535 observed in prior sessions). Handler returns HTTP 500 instead of generic 200 (security anti-enumeration pattern broken).

---

## Step 8 — Security testing

| Control | Source code | Runtime (current server) |
|---------|-------------|---------------------------|
| iClock off main API | ✅ Removed in `routes.rs` | ❌ Old binary still exposes |
| Razorpay webhook secret required | ✅ `webhooks.rs` | ❌ Needs restart |
| Impersonate requires admin role | ✅ `platform.rs` | ❌ Needs restart |
| CORS null blocked | ✅ `main.rs` | ❌ Needs restart |
| Global rate limit | ✅ `middleware/security.rs` | ❌ Needs restart |
| Security headers | ✅ HSTS, X-Frame-Options, etc. | ❌ Needs restart |
| TRUST_PROXY for X-Forwarded-For | ✅ `rate_limit.rs` | ❌ Needs restart |

**OWASP:** SQLi low risk (parameterized queries). IDOR mitigated by org scoping. File path traversal blocked (SEC-09).

---

## Step 9 — Performance

| Issue | Impact |
|-------|--------|
| Main JS bundle 1.36 MB | Slow first load on mobile |
| xlsx 429 KB, BarChart 383 KB | Consider lazy import |
| Sync payslip bulk email | ✅ Fixed in source — now `tokio::spawn` background |
| Payroll preview N+1 | Acceptable <1000 employees |

---

## Step 10 — E2E workflows verified

| Workflow | Suites |
|----------|--------|
| Login → dashboard | Frontend module check |
| Shift → attendance → payroll | HRM core (documented 30/30 in prior run) |
| Workflow triggers → tasks | WF 13/13 |
| Biometric punch → attendance | BIO 22/22 |
| Multi-tenant isolation | SAAS 30/30 |
| Platform impersonation | SAAS-26 ✅ (admin platform user) |

---

## Step 11 — Edge cases

| Case | Result |
|------|--------|
| Malformed preview body | ✅ SEC-16 HTTP 400 |
| Wrong org slug forgot-password | ✅ SEC-13 HTTP 400 |
| Invalid biometric mapping | ✅ TC-22 HTTP 400 |
| Expired JWT | ✅ SEC-06 |
| Empty payslip list email | Handled HTTP 400 in handler |

---

## Step 12 — Build verification

| Build | Result |
|-------|--------|
| `cargo test` | ✅ 31/31 |
| `cargo build` | ✅ (exe locked if backend running) |
| `cargo clippy -D warnings` | ❌ ~78 pre-existing warnings |
| `npm run build` (tenant) | ✅ with chunk warnings |
| `npm run build` (platform) | ✅ |

---

## Step 13 — Test execution summary (this session)

```
cargo test                    31/31 PASS
test-database-health.py       19/19 PASS
test-auth-security-suite.py   16/17 PASS  (SEC-11)
test-saas-suite.py            30/30 PASS
test-workflow-suite.py        13/13 PASS
test-all-24-modules.py        33/33 PASS
test-biometric-suite.py       22/22 PASS
test-payroll-compliance.py    20/22 PASS  (PC-07, PC-08 test harness)
frontend-module-check.mjs     31/31 PASS
frontend npm build            PASS
platform npm build            PASS
```

**Not run this session:** Full 21-suite orchestrator (~15 min), Playwright E2E flows, Postgres staging RLS, shift-payroll suite, HRM core integration.

---

## Bug classification

### 🔴 Critical
| ID | Issue | Action |
|----|-------|--------|
| CR-01 | **Stale backend process** — security hardening not active at runtime | Restart `hrm-backend` |
| CR-02 | Forgot-password returns **500** when SMTP fails | Return generic 200 or queue email |

### 🟠 High
| ID | Issue | Action |
|----|-------|--------|
| HI-01 | Tenant 2FA APIs missing | Implement or remove UI hooks |
| HI-02 | Payroll compliance tests expect HTML PDF | Update tests for binary PDF |
| HI-03 | Large frontend bundles | Code-split xlsx/charts |

### 🟡 Medium
| ID | Issue | Action |
|----|-------|--------|
| ME-01 | `work-locations.tsx` dead API | Delete page or alias to centers API |
| ME-02 | CI clippy `-D warnings` would fail | Fix incrementally or gate new code only |
| ME-03 | Full 21-suite not in CI | Nightly job |

### 🟢 Low
| ID | Issue | Action |
|----|-------|--------|
| LO-01 | Duplicate centers API path | Deprecate legacy |
| LO-02 | Handler `unwrap()` on SQL prepare | Replace with error responses |

---

## Fixed issues (prior session, pending deploy)

- iClock removed from main API routes (source)
- Razorpay webhook signature enforcement
- Platform impersonate admin role
- CORS null origin removed
- Global rate limiting + security headers
- Async payslip email queue
- Public careers page
- Orphan routes wired

**⚠️ These fixes are in source but NOT verified at runtime** — running server health returns legacy `{"status":"ok","service":"hrm-backend"}` without `database`/`version` fields.

---

## Remaining for 95+ production readiness

1. Restart backend and re-run auth + security probes
2. Fix SEC-11 SMTP failure handling
3. Update PC-07/08 tests for PDF binary
4. Implement tenant 2FA or remove dead hooks
5. Run full `run-complete-all-tests.ps1` before release
6. PostgreSQL staging with RLS enabled
7. Observability (Sentry/metrics)

---

## Final verdict

The HRM platform has **strong automated test coverage** and **passes the vast majority of enterprise QA suites**. The primary risks are **operational** (stale running backend, SMTP-dependent password reset) and **test drift** (PDF vs HTML payslip assertions), not fundamental architecture flaws.

**Recommended:** Restart backend → re-run `run-complete-all-tests.ps1` → fix SEC-11 → deploy to staging PostgreSQL → pen test → production.
