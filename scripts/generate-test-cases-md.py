#!/usr/bin/env python3
"""Generate docs/test-cases/*.md from automated test scripts."""

from __future__ import annotations

import os
import re
import subprocess
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
OUT = ROOT / "docs" / "test-cases"

PY_RECORD = re.compile(r'suite\.record\(\s*"([^"]+)"\s*,\s*"([^"]+)"')
MJS_RECORD = re.compile(r"record\(\s*'([^']+)'\s*,\s*'([^']+)'")
RUST_TEST = re.compile(r"#\[test\]\s*\n\s*fn\s+(\w+)", re.M)

SUITES: list[tuple[str, str, str, int]] = [
    ("test-database-health.py", "DB", "Database health & optimization", 18),
    ("test-biometric-suite.py", "TC", "Biometric (iClock + punch pipeline)", 22),
    ("test-saas-suite.py", "SAAS", "SaaS / multi-tenant isolation", 30),
    ("test-platform-api-suite.py", "PLAT", "Platform API (super-admin)", 34),
    ("test-shift-payroll-suite.py", "SP", "Shift + attendance + payroll penalties", 16),
    ("test-payroll-attendance-suite.py", "PA", "Payroll + attendance integration", 18),
    ("test-hrm-core-integration-suite.py", "HI", "HRM core (shift/salary/leave/workflow)", 30),
    ("test-workflow-suite.py", "WF", "Workflow engine", 13),
    ("test-payroll-compliance-suite.py", "PC", "Payroll compliance & exports", 22),
    ("test-auth-security-suite.py", "SEC", "Auth & security", 16),
]

PS1_SUITES = [
    ("flow-test.ps1", "FT", "Tenant API read flow (via Vite proxy)", "~59 endpoints"),
    ("api-input-flow-test.ps1", "APIW", "Tenant API write / form flows", "~18 steps"),
    ("attendance-flow-test.ps1", "ATF", "Attendance clock-in/out deep flow", "~11 steps"),
]

MJS_SUITES = [
    ("frontend-module-check.mjs", "FM", "Tenant admin page navigator", 31),
    ("test-all-24-modules-ui.mjs", "UI", "25-module UI catalog", 25),
    ("e2e-targeted-flows.mjs", "E2E", "Targeted E2E (auth/payroll/leave)", 8),
    ("ui-nav-check.mjs", "NAV", "Tenant UI browser nav + error probe", "~28 routes"),
    ("platform-module-check.mjs", "PFM", "Platform admin page navigator", 15),
    ("../frontend/scripts/ui-input-flow-check.mjs", "UIF", "Tenant UI form input flows", "~21 steps"),
]


def extract_py_cases(path: Path) -> list[tuple[str, str]]:
    if not path.is_file():
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    seen: set[str] = set()
    cases: list[tuple[str, str]] = []
    for case_id, name in PY_RECORD.findall(text):
        if case_id not in seen:
            seen.add(case_id)
            cases.append((case_id, name))
    return cases


def extract_mjs_cases(path: Path) -> list[tuple[str, str]]:
    if not path.is_file():
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    seen: set[str] = set()
    cases: list[tuple[str, str]] = []
    for case_id, name in MJS_RECORD.findall(text):
        if case_id not in seen:
            seen.add(case_id)
            cases.append((case_id, name))
    if path.name == "test-all-24-modules-ui.mjs":
        # UI-01..UI-25 generated at runtime from MODULE_CATALOG
        try:
            import importlib.util

            spec = importlib.util.spec_from_file_location("mod24", SCRIPTS / "test-all-24-modules.py")
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            for i, (key, label, _) in enumerate(mod.MODULE_CATALOG, 1):
                cases.append((f"UI-{i:02d}", f"{label} ({key})"))
        except Exception:
            pass
    return cases


def extract_module_catalog_cases() -> list[tuple[str, str, str]]:
    path = SCRIPTS / "test-all-24-modules.py"
    text = path.read_text(encoding="utf-8", errors="replace")
    cases = extract_py_cases(path)
    modules: list[tuple[str, str, str]] = []
    block = re.search(r"MODULE_CATALOG.*?= \[(.*?)\]", text, re.S)
    if block:
        for m in re.finditer(r'\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\)', block.group(1)):
            modules.append(m.groups())
    return cases, modules


def extract_rust_tests() -> list[str]:
    tests: list[str] = []
    for path in (ROOT / "backend" / "src").rglob("*.rs"):
        rel = path.relative_to(ROOT / "backend" / "src")
        for m in RUST_TEST.finditer(path.read_text(encoding="utf-8", errors="replace")):
            tests.append(f"{rel}: {m.group(1)}")
    return sorted(tests)


def md_table(rows: list[tuple[str, ...]], headers: tuple[str, ...]) -> str:
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def write_readme(py_total: int, rust_count: int) -> None:
    content = f"""# HRM Test Cases — Master Index

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}

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
| [01-python-api.md](01-python-api.md) | Python API integration | `scripts/test-*.py` | {py_total} |
| [02-module-catalog.md](02-module-catalog.md) | 25-module API + UI catalog | `test-all-24-modules.py` / `.mjs` | 33 + 25 |
| [03-powershell-flows.md](03-powershell-flows.md) | PowerShell API flows | `flow-test.ps1`, etc. | ~88 |
| [04-playwright-ui.md](04-playwright-ui.md) | Playwright / browser | `*.mjs` | ~128 |
| [05-rust-unit.md](05-rust-unit.md) | Rust unit tests | `cargo test` | {rust_count} |
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
"""
    (OUT / "README.md").write_text(content, encoding="utf-8")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)

    py_sections: list[str] = [
        "# Python API Integration Test Cases\n",
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n",
        "Run: `python scripts/<script>.py` or `run-complete-all-tests.ps1`\n",
    ]
    py_total = 0
    for script, prefix, title, expected in SUITES:
        path = SCRIPTS / script
        cases = extract_py_cases(path)
        py_total += len(cases)
        py_sections.append(f"\n## {title}\n")
        py_sections.append(f"- **Script:** `scripts/{script}`\n")
        py_sections.append(f"- **Prefix:** `{prefix}-xx` | **Cases:** {len(cases)} (expected {expected})\n")
        rows = [(c[0], c[1], f"`python scripts/{script}`") for c in cases]
        py_sections.append(md_table(rows, ("ID", "Name", "Run")) + "\n")

    (OUT / "01-python-api.md").write_text("".join(py_sections), encoding="utf-8")

    mod_cases, modules = extract_module_catalog_cases()
    mod_rows = [(c[0], c[1]) for c in mod_cases]
    catalog_rows = [(f"MOD-{i:02d}", label, api) for i, (key, label, api) in enumerate(modules, 1)]
    mod_content = f"""# 25-Module Catalog Test Cases

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}

## API catalog (`test-all-24-modules.py`)

Run: `python scripts/test-all-24-modules.py`

{md_table(mod_rows, ("ID", "Name"))}

## Per-module API routes (MOD-xx)

| ID | Module | Endpoint |
|----|--------|----------|
"""
    mod_content += "\n".join(f"| {r[0]} | {r[1]} | `{r[2]}` |" for r in catalog_rows)
    mod_content += "\n\n## UI catalog (`test-all-24-modules-ui.mjs`)\n\nRun: `node scripts/test-all-24-modules-ui.mjs`\n\n"
    ui_cases = extract_mjs_cases(SCRIPTS / "test-all-24-modules-ui.mjs")
    mod_content += md_table([(c[0], c[1]) for c in ui_cases], ("ID", "Page")) + "\n"
    (OUT / "02-module-catalog.md").write_text(mod_content, encoding="utf-8")

    ps1_content = f"""# PowerShell API Flow Test Cases

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}

Requires tenant frontend on `:5174` (Vite proxies `/api` to backend).

"""
    for script, prefix, title, count in PS1_SUITES:
        ps1_content += f"""## {title}

- **Script:** `scripts/{script}`
- **Prefix:** `{prefix}` | **Scope:** {count}
- **Run:** `powershell -NoProfile -File scripts/{script}`

"""
    (OUT / "03-powershell-flows.md").write_text(ps1_content, encoding="utf-8")

    mjs_content = f"""# Playwright / Browser Test Cases

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}

Requires Chromium via `cd frontend && npx playwright install chromium`.

"""
    for script, prefix, title, count in MJS_SUITES:
        rel = script.replace("../", "")
        path = (SCRIPTS / script).resolve() if not script.startswith("..") else (ROOT / script.replace("../", ""))
        cases = extract_mjs_cases(path)
        mjs_content += f"""## {title}

- **Script:** `{rel}`
- **Prefix:** `{prefix}` | **Cases:** {len(cases) or count}
- **Run:** `node {rel}`

"""
        if cases:
            mjs_content += md_table([(c[0], c[1]) for c in cases], ("ID", "Name")) + "\n\n"

    (OUT / "04-playwright-ui.md").write_text(mjs_content, encoding="utf-8")

    rust_tests = extract_rust_tests()
    rust_content = f"""# Rust Unit Test Cases

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}

Run: `cd backend && cargo test`

Total: **{len(rust_tests)}** tests

| Location | Test function |
|----------|---------------|
"""
    rust_content += "\n".join(f"| `{t.split(':')[0]}` | `{t.split(':')[1].strip()}` |" for t in rust_tests)
    rust_content += "\n"
    (OUT / "05-rust-unit.md").write_text(rust_content, encoding="utf-8")

    manual = """# Manual QA Test Cases

Automated suites do not replace exploratory QA. Use the tenant checklist for sign-off.

## Primary checklist

See [TENANT-QA-CHECKLIST.md](../TENANT-QA-CHECKLIST.md) — 19 sections, ~90+ items covering:

1. Auth & onboarding
2. Users & roles
3. Attendance & shifts
4. Leave & holidays
5. Payroll & payslips
6. Biometric devices
7. Workflows & tasks
8. Reports
9. Chat & notifications
10. Subscription & billing
11. Security sign-off

## When to run manual QA

- Before production deploy
- After schema migrations
- After payroll/statutory rule changes
- After UI redesign of critical flows (login, payroll generate, leave approve)

## Traceability

Map manual sections to automated suites:

| Manual section | Automated coverage |
|----------------|-------------------|
| Attendance | PA-xx, SP-xx, HI-xx, ATF |
| Leave | HI-21–30, APIW leave step, E2E-08 |
| Payroll | PC-xx, PA-xx, SP-10/11, E2E-04–06 |
| Security | SEC-xx |
| All modules | MOD-xx, UI-xx, FM |
"""
    (OUT / "06-manual-qa.md").write_text(manual, encoding="utf-8")

    write_readme(py_total + len(mod_cases), len(rust_tests))
    print(f"Generated {len(list(OUT.glob('*.md')))} files in docs/test-cases/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
