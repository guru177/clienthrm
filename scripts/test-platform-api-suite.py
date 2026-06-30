#!/usr/bin/env python3
"""Extended platform console API coverage (beyond SaaS tenant isolation suite)."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")
PLATFORM = {
    "email": os.environ.get("PLATFORM_ADMIN_EMAIL", "admin@retaildaddy.in"),
    "password": os.environ.get("PLATFORM_ADMIN_PASSWORD", "retaildaddy@0123"),
}


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
        print(f"PLATFORM API RESULTS: {passed}/{total} passed")
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
    timeout: int = 15,
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


def login_platform() -> str | None:
    code, body = http("POST", f"{API}/api/platform/auth/login", PLATFORM)
    if code != 200 or not isinstance(body, dict):
        return None
    return body.get("data", {}).get("token")


def main() -> int:
    suite = Suite()
    print("=" * 60)
    print("PLATFORM API EXTENDED SUITE")
    print(f"Started: {datetime.now().isoformat(timespec='seconds')}")
    print("=" * 60)

    token = login_platform()
    suite.record("PLAT-01", "Platform login", token is not None)
    if not token:
        return suite.summary()

    h = {"Authorization": f"Bearer {token}"}

    endpoints: list[tuple[str, str, str, str]] = [
        ("PLAT-02", "Analytics overview", "GET", "/api/platform/analytics/overview"),
        ("PLAT-03", "Analytics signups", "GET", "/api/platform/analytics/signups"),
        ("PLAT-04", "Plan distribution", "GET", "/api/platform/analytics/plan-distribution"),
        ("PLAT-05", "Expiring subscriptions", "GET", "/api/platform/analytics/expiring"),
        ("PLAT-06", "Geography analytics", "GET", "/api/platform/analytics/geography"),
        ("PLAT-07", "Device fleet analytics", "GET", "/api/platform/analytics/devices"),
        ("PLAT-08", "Global search", "GET", "/api/platform/search?q=mashup"),
        ("PLAT-09", "System health", "GET", "/api/platform/system/health"),
        ("PLAT-10", "Platform users list", "GET", "/api/platform/users"),
        ("PLAT-11", "IP tracking", "GET", "/api/platform/ip-tracking"),
        ("PLAT-12", "Audit log", "GET", "/api/platform/audit-log?limit=10"),
        ("PLAT-13", "Platform team", "GET", "/api/platform/team"),
        ("PLAT-14", "Active sessions", "GET", "/api/platform/sessions"),
        ("PLAT-15", "Announcements", "GET", "/api/platform/announcements"),
        ("PLAT-16", "Releases", "GET", "/api/platform/releases"),
        ("PLAT-17", "Subscription plans modules", "GET", "/api/platform/plans/modules"),
        ("PLAT-18", "Invoices", "GET", "/api/platform/invoices?limit=5"),
        ("PLAT-19", "Revenue summary", "GET", "/api/platform/revenue/summary"),
        ("PLAT-20", "Coupons", "GET", "/api/platform/coupons"),
        ("PLAT-21", "Upgrade requests", "GET", "/api/platform/upgrade-requests"),
        ("PLAT-22", "Knowledge base", "GET", "/api/platform/kb"),
        ("PLAT-23", "Support ticket stats", "GET", "/api/platform/support/tickets/stats"),
        ("PLAT-24", "Support tickets", "GET", "/api/platform/support/tickets?limit=5"),
    ]

    for case_id, name, method, path in endpoints:
        code, body = http(method, f"{API}{path}", headers=h)
        ok = code == 200
        detail = f"HTTP {code}"
        if ok and isinstance(body, dict) and body.get("success") is False:
            ok = False
            detail = "success=false"
        suite.record(case_id, name, ok, detail)

    code, org = http("GET", f"{API}/api/platform/organizations/1", headers=h)
    suite.record("PLAT-25", "Organization detail (org 1)", code == 200, f"HTTP {code}")

    tenant_routes = [
        ("PLAT-26", "Tenant overview", "/api/platform/organizations/1/overview"),
        ("PLAT-27", "Tenant users", "/api/platform/organizations/1/users"),
        ("PLAT-28", "Tenant devices", "/api/platform/organizations/1/devices"),
        ("PLAT-29", "Tenant payroll", "/api/platform/organizations/1/payroll"),
        ("PLAT-30", "Tenant attendance", "/api/platform/organizations/1/attendance"),
        ("PLAT-31", "Tenant settings", "/api/platform/organizations/1/settings"),
        ("PLAT-32", "Tenant audit", "/api/platform/organizations/1/audit"),
        ("PLAT-33", "Org notes", "/api/platform/organizations/1/notes"),
        ("PLAT-34", "Feature overrides", "/api/platform/organizations/1/feature-overrides"),
    ]
    for case_id, name, path in tenant_routes:
        code, _ = http("GET", f"{API}{path}", headers=h)
        suite.record(case_id, name, code == 200, f"HTTP {code}")

    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
