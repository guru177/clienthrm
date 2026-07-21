# HRM Test Cases — Master Index

Generated: 2026-06-19 16:30

This folder documents every automated test case in the HRM project. Cases map 1:1 to scripts under `scripts/` and `frontend/scripts/`.

## Quick run

```powershell
# Prerequisites: backend :3001, tenant UI :5174, platform :5175 (optional)
powershell -NoProfile -File scripts/run-complete-all-tests.ps1

# Core domain only (shift, payroll, leave, workflow)
powershell -NoProfile -File scripts/run-core-integration-tests.ps1
```

## Suite inventory

| Doc | Suite | Script | Cases |
|-----|-------|--------|-------|
| [01-python-api.md](01-python-api.md) | Python API integration | `scripts/test-*.py` | 194 |
| [02-module-catalog.md](02-module-catalog.md) | 25-module API + UI catalog | `test-all-24-modules.py` / `.mjs` | 33 + 25 |
| [03-powershell-flows.md](03-powershell-flows.md) | PowerShell API flows | `flow-test.ps1`, etc. | ~88 |
| [04-playwright-ui.md](04-playwright-ui.md) | Playwright / browser | `*.mjs` | ~128 |
| [05-rust-unit.md](05-rust-unit.md) | Rust unit tests | `cargo test` | 29 |
| [06-manual-qa.md](06-manual-qa.md) | Manual QA checklist | — | ~90+ |

## CI coverage (`.github/workflows/test.yml`)

| Job | Suites |
|-----|--------|
| rust-unit | `cargo test` |
| python-api | DB, SaaS, workflow, payroll compliance, 25-module API, auth/security |
| frontend-smoke | `frontend-module-check.mjs`, `e2e-targeted-flows.mjs` |

Full local run adds: biometric, platform API, shift/payroll, HRM core, PS1 flows, UI nav, platform UI.

## Regenerate these docs

```powershell
python scripts/generate-test-cases-md.py
```
