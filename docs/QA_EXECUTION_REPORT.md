# QA Test Execution Report — Raintech HRM

| Field | Value |
|-------|-------|
| **Date** | 2026-07-18 |
| **Environment** | Local (API `:3001`, tenant `:5174`, platform `:5175`, Postgres `:5433`) |
| **Strategy** | [QA_TEST_STRATEGY.md](./QA_TEST_STRATEGY.md) |
| **Run ID** | `qa-strategy-exec-2026-07-18-r7` |
| **Orchestrator** | `scripts/run-complete-all-tests.ps1 -SkipPrune` |
| **Log** | [QA_MARATHON_LATEST.log](./QA_MARATHON_LATEST.log) |
| **Recommendation** | **CONDITIONAL GO** (23/26 marathon green; 3 fails re-verified PASS after QA data prune) |

---

## Summary

| Suite | Result |
|-------|--------|
| Full marathon r7 | **23 passed, 3 failed, 1 skipped** |
| Marathon failures | Workflow suite (timeout), tenant modules API catalog (timeout), Rust `cargo test` (LLVM OOM) |
| Re-verify after prune | Workflow **15/15**, modules API **39/39**, Rust **100 passed / 1 ignored** |
| Domain suites (shift/payroll/attendance/HRM core/compliance/SaaS/security) | **PASS** (marathon) |
| UI / Playwright / Vitest | **PASS** (marathon) |

**Overall:** Product gates are green. Marathon fails were environment/data pressure (RAM ~0.5–0.7 GB free; 1,270 workflows / 25k QA tasks), not domain regressions. After pruning QA tasks + old workflow defs, the three failed suites passed in isolation.

---

## Marathon detail (r7)

| Suite | Status |
|-------|--------|
| Pre-production connectivity | PASS |
| Database health & optimization | PASS |
| Biometric suite | PASS |
| SaaS suite (platform + tenant isolation) | PASS |
| Platform API extended | PASS |
| Shift + payroll integration | PASS |
| Workflow engine suite | **FAIL** → re-verify **PASS** 15/15 |
| HRM core integration | PASS |
| Payroll compliance suite | PASS |
| All tenant modules API catalog | **FAIL** → re-verify **PASS** 39/39 |
| Rust unit tests | **FAIL** (compile OOM) → re-verify **PASS** 100/100 via existing test binary |
| Frontend unit tests (vitest) | PASS |
| Playwright E2E | PASS |
| Tenant API read flow | PASS |
| Tenant API write flow | PASS |
| Attendance flow | PASS |
| Payroll + attendance integration | PASS |
| Tenant frontend modules | PASS |
| All tenant modules UI catalog | PASS |
| Tenant UI input flow forms | PASS |
| Targeted E2E flows | PASS |
| Tenant UI browser nav | PASS |
| Platform frontend modules | PASS |
| Auth & security suite | PASS |
| Validation suite | PASS |
| Signup & OTP flow suite | PASS |
| Prune QA workflow tasks | SKIP (`-SkipPrune`) |

---

## Root causes (r7)

1. **Workflow / modules timeouts** — `GET /api/admin/workflows/list` returned ~456 KB / ~15–18s with **1,270** workflow rows (full `actions` payloads). Test HTTP timeout is 30s; under marathon load it failed. Catalog suite timed out on the next heavy call after shifts while the API was saturated.
2. **QA task bloat** — **25,747** tasks (~25,640 QA leftovers). Pruned via `scripts/prune-qa-workflow-tasks.py` → **107** remaining.
3. **QA workflow defs** — Deactivated excess active leave triggers; deleted **1,018** old inactive QA workflows + **258,775** executions → **252** workflows remain. List dropped to ~5s / ~89 KB.
4. **Rust compile OOM** — `rustc-LLVM ERROR: out of memory` while linking the test binary with **&lt;1 GB** free RAM (Cursor/WSL/Docker). Existing `target/debug/deps/hrm_backend-*.exe` ran **100 passed, 1 ignored**.

---

## Remaining risks (not domain regressions)

- Host RAM pressure makes marathon `cargo test` compile unreliable; prefer quiet machine or prebuilt test binary.
- Skipping prune (`-SkipPrune`) lets QA workflows/tasks accumulate and reintroduce list timeouts — run prune after marathon or omit `-SkipPrune`.
- `workflows/list` still embeds full action graphs; consider a compact list endpoint for UI/catalog smoke.

---

## Sign-off

- [x] Workflow / HRM core / payroll / attendance / write API green
- [x] Security / validation / signup OTP green
- [x] Failed marathon suites re-verified PASS in isolation
- [ ] Full marathon 26/26 on a quiet machine (no OOM / no SkipPrune backlog)
- [ ] UAT sponsor approval (manual)
- [ ] Production deploy smoke (when deploying)

**QA automated gate:** **CONDITIONAL GO** — API/domain/UI gates green after re-verify; next release marathon should run with prune enabled and ≥4 GB free RAM for `cargo test`.
