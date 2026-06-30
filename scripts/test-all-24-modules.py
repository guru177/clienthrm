#!/usr/bin/env python3
"""Test all 25 tenant modules from backend plan_limits::MODULE_CATALOG (API + catalog sync)."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")
EMAIL = os.environ.get("HRM_EMAIL", "admin@mashuptech.in")
PASSWORD = os.environ.get("HRM_PASSWORD", "password")
PLATFORM = {
    "email": os.environ.get("PLATFORM_ADMIN_EMAIL", "admin@retaildaddy.in"),
    "password": os.environ.get("PLATFORM_ADMIN_PASSWORD", "retaildaddy@0123"),
}

# Matches backend/src/plan_limits.rs MODULE_CATALOG (25 items)
MODULE_CATALOG: list[tuple[str, str, str]] = [
    ("dashboard", "Dashboard", "/api/admin/dashboard/hr-data"),
    ("users", "Users & Roles", "/api/admin/users/list"),
    ("centers", "Centers", "/api/admin/api/settings/centers"),
    ("departments", "Departments", "/api/admin/departments/list"),
    ("designations", "Designations", "/api/admin/designations/list"),
    ("careers", "Job Postings", "/api/admin/careers/list"),
    ("job_applications", "Applications", "/api/admin/job-applications/list"),
    ("chat", "Team Chat", "/api/admin/chat/spaces"),
    ("attendance", "Attendance", "/api/admin/attendance/today"),
    ("shifts", "Shifts", "/api/admin/shifts"),
    ("biometric", "Biometric Devices", "/api/admin/biometric/devices"),
    ("manual_attendance", "Manual Attendance", "/api/admin/reports/daily-attendance?date=2026-06-17"),
    ("leave", "Leave Requests", "/api/admin/leave-requests/list"),
    ("leave_manage", "Manage Leave", "/api/admin/leave-requests/manage/list"),
    ("holidays", "Holidays", "/api/admin/holidays/list"),
    ("payroll", "Salaries & Payroll", "/api/admin/payroll/list"),
    ("my_payslips", "My Payslips", "/api/admin/me/payslips"),
    ("workflows", "Workflows", "/api/admin/workflows/list"),
    ("tasks", "Tasks & Activities", "/api/admin/tasks/list"),
    ("projects", "Projects", "/api/admin/projects/list"),
    ("reports", "Reports", "/api/admin/reports/attendance-summary"),
    ("subscription", "Subscription", "/api/admin/billing/plans"),
    ("notifications", "Notifications", "/api/admin/org-notifications"),
    ("support", "Support", "/api/admin/support/tickets"),
    ("settings", "App Settings", "/api/admin/settings/app"),
]

UI_ROUTES: list[tuple[str, str]] = [
    ("dashboard", "/admin/dashboard"),
    ("users", "/admin/users"),
    ("centers", "/admin/centers"),
    ("departments", "/admin/departments"),
    ("designations", "/admin/designations"),
    ("careers", "/admin/careers"),
    ("job_applications", "/admin/job-applications"),
    ("chat", "/admin/chat"),
    ("attendance", "/admin/attendance"),
    ("shifts", "/admin/shifts"),
    ("biometric", "/admin/biometric"),
    ("manual_attendance", "/admin/manual-attendance"),
    ("leave", "/admin/leave-requests"),
    ("leave_manage", "/admin/leave-requests/manage"),
    ("holidays", "/admin/holidays"),
    ("payroll", "/admin/payroll"),
    ("my_payslips", "/admin/my-payslips"),
    ("workflows", "/admin/workflows"),
    ("tasks", "/admin/tasks"),
    ("projects", "/admin/projects"),
    ("reports", "/admin/reports"),
    ("subscription", "/admin/subscription"),
    ("notifications", "/admin/notifications"),
    ("support", "/admin/support"),
    ("settings", "/admin/settings/app"),
]


@dataclass
class Result:
    case_id: str
    name: str
    passed: bool
    detail: str = ""


@dataclass
class Suite:
    results: list[Result] = field(default_factory=list)

    def record(self, case_id: str, name: str, passed: bool, detail: str = "") -> None:
        self.results.append(Result(case_id, name, passed, detail))
        mark = "PASS" if passed else "FAIL"
        print(f"  [{mark}] {case_id}: {name}" + (f" | {detail}" if detail else ""))

    def summary(self) -> int:
        passed = sum(1 for r in self.results if r.passed)
        total = len(self.results)
        print("\n" + "=" * 60)
        print(f"25-MODULE RESULTS: {passed}/{total} passed")
        if passed < total:
            print("\nFailed:")
            for r in self.results:
                if not r.passed:
                    print(f"  - {r.case_id}: {r.name} | {r.detail}")
        return 0 if passed == total else 1


def http(
    method: str,
    url: str,
    data: dict | None = None,
    headers: dict | None = None,
    timeout: int = 20,
) -> tuple[int, dict | list | str | None]:
    hdrs = dict(headers or {})
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode(errors="replace")
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def login_tenant() -> str | None:
    code, body = http("POST", f"{API}/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    if code != 200 or not isinstance(body, dict):
        return None
    return body.get("data", {}).get("token")


def login_platform() -> str | None:
    code, body = http("POST", f"{API}/api/platform/auth/login", PLATFORM)
    if code != 200 or not isinstance(body, dict):
        return None
    return body.get("data", {}).get("token")


def main() -> int:
    suite = Suite()
    print("=" * 60)
    print("ALL 25 TENANT MODULES TEST")
    print(f"Catalog size: {len(MODULE_CATALOG)} modules")
    print(f"Started: {datetime.now().isoformat(timespec='seconds')}")
    print("=" * 60)

    suite.record(
        "M0-01",
        "Catalog defines exactly 25 modules",
        len(MODULE_CATALOG) == 25,
        f"count={len(MODULE_CATALOG)}",
    )
    suite.record(
        "M0-02",
        "UI route map covers all 25 modules",
        len(UI_ROUTES) == 25 and {k for k, _ in UI_ROUTES} == {m[0] for m in MODULE_CATALOG},
        f"routes={len(UI_ROUTES)}",
    )

    pt = login_platform()
    if pt:
        code, catalog = http(
            "GET",
            f"{API}/api/platform/plans/modules",
            headers={"Authorization": f"Bearer {pt}"},
        )
        items = catalog.get("data", []) if isinstance(catalog, dict) else []
        keys = [i.get("key") for i in items if isinstance(i, dict)]
        suite.record(
            "M0-03",
            "Platform modules catalog API returns 25 keys",
            code == 200 and len(keys) == 25,
            f"HTTP {code} keys={len(keys)}",
        )
        expected = [m[0] for m in MODULE_CATALOG]
        suite.record(
            "M0-04",
            "Platform catalog keys match tenant MODULE_CATALOG order",
            keys == expected,
            f"match={keys == expected}",
        )
    else:
        suite.record("M0-03", "Platform modules catalog API returns 25 keys", False, "platform login failed")
        suite.record("M0-04", "Platform catalog keys match tenant MODULE_CATALOG order", False, "skipped")

    token = login_tenant()
    suite.record("M0-05", "Tenant admin login", token is not None)
    if not token:
        return suite.summary()

    h = {"Authorization": f"Bearer {token}"}

    code, me = http("GET", f"{API}/api/auth/me", headers=h)
    plan_modules: list[str] = []
    if isinstance(me, dict):
        plan = (me.get("data") or {}).get("plan") or {}
        plan_modules = plan.get("modules") or []
    suite.record(
        "M0-06",
        "Tenant plan exposes module list",
        code == 200 and isinstance(plan_modules, list) and len(plan_modules) > 0,
        f"plan_modules={len(plan_modules)}",
    )

    for idx, (key, label, path) in enumerate(MODULE_CATALOG, start=1):
        case_id = f"MOD-{idx:02d}"
        code, body = http("GET", f"{API}{path}", headers=h)
        ok = code == 200
        detail = f"{path} HTTP {code}"
        if ok and isinstance(body, dict) and body.get("success") is False:
            ok = False
            detail = f"{path} success=false"
        if ok and key in plan_modules:
            detail += " [in plan]"
        elif ok and plan_modules and key not in plan_modules:
            detail += " [API ok, not in plan list]"
        suite.record(case_id, f"{label} ({key})", ok, detail)

        # Payroll also covers salary components sub-area
        if key == "payroll" and ok:
            c2, b2 = http("GET", f"{API}/api/admin/salaries/components/list", headers=h)
            sub_ok = c2 == 200 and (not isinstance(b2, dict) or b2.get("success") is not False)
            suite.record(
                f"{case_id}b",
                "Salaries & Payroll - salary components",
                sub_ok,
                f"HTTP {c2}",
            )

    if "manual_attendance" in plan_modules:
        code, users_body = http("GET", f"{API}/api/admin/attendance/users", headers=h)
        users = users_body.get("data", []) if isinstance(users_body, dict) else []
        user_id = users[0]["id"] if users else None
        if user_id:
            code, bulk_body = http(
                "POST",
                f"{API}/api/admin/attendance/manual/bulk",
                {
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "entries": [
                        {
                            "user_id": user_id,
                            "status": "present",
                            "notes": "module test",
                        }
                    ],
                },
                headers=h,
            )
            ok = code == 200 and isinstance(bulk_body, dict) and bulk_body.get("success") is not False
            suite.record(
                "M0-07",
                "Manual attendance bulk mark API",
                ok,
                f"HTTP {code}",
            )
        else:
            suite.record("M0-07", "Manual attendance bulk mark API", False, "no employees")
    else:
        suite.record(
            "M0-07",
            "Manual attendance bulk mark API",
            True,
            "skipped (manual_attendance not in plan)",
        )

    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
