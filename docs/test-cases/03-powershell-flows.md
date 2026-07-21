# PowerShell API Flow Test Cases

Generated: 2026-06-19 16:30

Requires tenant frontend on `:5174` (Vite proxies `/api` to backend).

## Tenant API read flow (via Vite proxy)

- **Script:** `scripts/flow-test.ps1`
- **Prefix:** `FT` | **Scope:** ~59 endpoints
- **Run:** `powershell -NoProfile -File scripts/flow-test.ps1`

## Tenant API write / form flows

- **Script:** `scripts/api-input-flow-test.ps1`
- **Prefix:** `APIW` | **Scope:** ~18 steps
- **Run:** `powershell -NoProfile -File scripts/api-input-flow-test.ps1`

## Attendance clock-in/out deep flow

- **Script:** `scripts/attendance-flow-test.ps1`
- **Prefix:** `ATF` | **Scope:** ~11 steps
- **Run:** `powershell -NoProfile -File scripts/attendance-flow-test.ps1`

