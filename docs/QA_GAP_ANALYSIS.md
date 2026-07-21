# QA Gap Analysis — Raintech HRM

| Field | Value |
|-------|-------|
| **Date** | 2026-07-16 |
| **Marathon** | 26 passed, 0 failed, 1 skipped (exit 0) |
| **Run ID** | `gap-analysis-rerun` |
| **Evidence** | `debug-f8e5bb.log` |

---

## Runtime health (no product breakage found)

Live probes after marathon — all OK:

| Probe | Status |
|-------|--------|
| Manager team / attendance / leave | 200 |
| Integrations webhooks list | 200 |
| Out-of-zone report | 200 |
| Workflow `POST .../test` | 200 |
| Manager unauthenticated | 401 (correct) |
| OpenAPI manager + webhooks + events + workflow test | Present |

**Conclusion:** Application works on this build. Gaps below are **coverage / process / product backlog**, not failing suites.

---

## Persistent gaps

### A. Automation coverage gaps (features work; no dedicated suite)

| Gap | Risk | Recommendation |
|-----|------|----------------|
| **Manager self-service** (team attendance/leave approve scope) | High — regressions in manager 403 scope | Add `scripts/test-manager-suite.py` |
| **Tenant outbound webhooks** (register, HMAC delivery, deliveries log) | High — enterprise checkbox | Add webhook mock + suite |
| **Geofence policy** (flag vs reject, clock-in out_of_zone) | High — compliance | Extend attendance suite |
| **Workflow dry-run / test API** | Medium | Assert in workflow suite |
| **Full 5-role RBAC matrix** (admin/manager/user/doctor/sales × plan) | High | Scripted permission matrix |
| **k6 / performance budgets** | Medium | Add load profile to nightly |
| **WCAG / a11y automation** | Medium | Playwright axe checks on login + leave |
| **Electron desktop E2E** | Medium | Smoke install + login |
| **UAT sponsor sign-off** | Process | Manual checklist in strategy §13 |

### B. Product / commercial gaps (not test failures)

| Gap | Notes |
|-----|--------|
| **Self-serve Razorpay checkout** | Webhook marks paid invoices; no in-app order/checkout flow |
| **IP allowlists / offline punch sync** | In roadmap; not implemented as full features |
| **Projects depth** (members, timesheets) | Thin CRUD; optional Phase 5 |
| **S3 SDK storage** | Local `STORAGE_PATH`; CloudFront rewrite only |

### C. Already covered well (no gap)

Auth/security, SaaS isolation, biometric, shift↔payroll, leave↔workflow, module catalog (31), Playwright/E2E, validation, signup OTP, DB health.

---

## Priority backlog to close gaps

1. **P0:** Manager suite + webhook HMAC suite + geofence clock-in cases  
2. **P1:** RBAC 5-role matrix script  
3. **P2:** k6 smoke + a11y on critical pages  
4. **P3:** Electron smoke; UAT formal sign-off process  
5. **Product:** Razorpay self-serve if SMB conversion matters  
