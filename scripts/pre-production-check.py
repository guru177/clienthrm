#!/usr/bin/env python3
"""Pre-production verification: API modules, proxy interconnection, CRUD smoke."""

from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

API_DIRECT = "http://127.0.0.1:3001/api"
TENANT_FE = "http://127.0.0.1:5174/api"
PLATFORM_FE = "http://127.0.0.1:5175/api"
TENANT_EMAIL = "info@retaildaddy.in"
TENANT_PASSWORD = "Guru!1234"
TENANT_ORG = "mashuptech"
PLATFORM_EMAIL = "admin@retaildaddy.in"
PLATFORM_PASSWORD = "LocalTest123!"

failures: list[str] = []
passed = 0


def ok(label: str) -> None:
    global passed
    passed += 1
    print(f"[PASS] {label}")


def fail(label: str, detail: str = "") -> None:
    msg = f"{label}" + (f" — {detail}" if detail else "")
    failures.append(msg)
    print(f"[FAIL] {msg}")


def req(base: str, method: str, path: str, token: str | None = None, body: dict | None = None, timeout: int = 30):
    url = f"{base}{path}"
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            raw = resp.read().decode()
            try:
                parsed = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                parsed = {"_raw": raw[:300]}
            return resp.status, parsed
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"_raw": raw[:300]}
        return e.code, parsed
    except urllib.error.URLError as e:
        return 0, {"message": str(e.reason) if hasattr(e, "reason") else str(e)}


def login(base: str, path: str, body: dict) -> str | None:
    status, data = req(base, "POST", path, body=body)
    if status != 200:
        return None
    return data.get("data", {}).get("token") or data.get("data", {}).get("access_token")


def check_endpoint(group: str, base: str, path: str, token: str | None, method: str = "GET", body: dict | None = None):
    status, data = req(base, method, path, token, body)
    if 200 <= status < 300:
        ok(f"{group} {method} {path}")
    else:
        fail(f"{group} {method} {path}", str(data.get("message", data))[:120])


def section(title: str) -> None:
    print(f"\n=== {title} ===")


def main() -> int:
    section("Infrastructure")
    for name, url in [
        ("PostgreSQL via backend", f"{API_DIRECT}/health"),
        ("Tenant frontend", "http://127.0.0.1:5174/"),
        ("Platform frontend", "http://127.0.0.1:5175/"),
    ]:
        try:
            with urllib.request.urlopen(url if not url.endswith("/health") else url, timeout=8) as r:
                if url.endswith("/health"):
                    body = json.loads(r.read().decode())
                    if body.get("database", {}).get("ok"):
                        ok(f"{name} reachable")
                    else:
                        fail(name, "database not ok")
                elif r.status == 200:
                    ok(f"{name} reachable")
                else:
                    fail(name, f"status {r.status}")
        except Exception as e:
            fail(name, str(e))

    section("Frontend to Backend proxy")
    for label, base in [("Tenant proxy", TENANT_FE), ("Platform proxy", PLATFORM_FE)]:
        status, data = req(base, "GET", "/health")
        if status == 200 and data.get("status") == "ok":
            ok(f"{label} /api/health")
        else:
            fail(f"{label} /api/health", str(data))

    section("Authentication")
    tenant_token = login(TENANT_FE, "/auth/login", {
        "email": TENANT_EMAIL, "password": TENANT_PASSWORD, "org_slug": TENANT_ORG,
    })
    if tenant_token:
        ok("Tenant login via frontend proxy")
    else:
        fail("Tenant login via frontend proxy")

    platform_token = login(PLATFORM_FE, "/platform/auth/login", {
        "email": PLATFORM_EMAIL, "password": PLATFORM_PASSWORD,
    })
    if platform_token:
        ok("Platform login via frontend proxy")
    else:
        fail("Platform login via frontend proxy")

    if tenant_token:
        status, data = req(TENANT_FE, "GET", "/auth/me", tenant_token)
        if status == 200 and data.get("data"):
            ok("Tenant /auth/me")
        else:
            fail("Tenant /auth/me", str(data.get("message", data)))

        status, _ = req(TENANT_FE, "POST", "/auth/presence", tenant_token, {})
        if status == 200:
            ok("Tenant /auth/presence")
        else:
            fail("Tenant /auth/presence")

    section("Tenant modules (via proxy)")
    tenant_routes = [
        "/admin/dashboard/hr-data",
        "/admin/users/stats",
        "/admin/users/list",
        "/admin/departments/stats",
        "/admin/departments/list",
        "/admin/designations/stats",
        "/admin/designations/list",
        "/admin/roles/stats",
        "/admin/roles/list",
        "/admin/permissions/list",
        "/admin/attendance/stats",
        "/admin/attendance/today",
        "/admin/attendance/list",
        "/admin/shifts",
        "/admin/shifts/roster",
        "/admin/leave-types",
        "/admin/leave-requests/stats",
        "/admin/leave-requests/manage/stats",
        "/admin/holidays",
        "/admin/salaries/components/list",
        "/admin/payroll/runs",
        "/admin/workflows",
        "/admin/tasks",
        "/admin/projects",
        "/admin/reports/attendance-register",
        "/admin/biometric/devices",
        "/admin/settings/centers",
        "/admin/careers",
        "/admin/settings/app",
        "/admin/settings/leave-types",
        "/admin/settings/leave-policy",
        "/admin/billing/plans",
        "/admin/org-notifications/unread-count",
        "/admin/announcements",
        "/admin/releases",
        "/admin/kb",
        "/admin/support/tickets",
        "/two-factor/status",
        "/admin/chat/spaces",
    ]
    if tenant_token:
        for path in tenant_routes:
            check_endpoint("tenant", TENANT_FE, path, tenant_token)

    section("Platform modules (via proxy)")
    platform_routes = [
        "/platform/auth/me",
        "/platform/dashboard/stats",
        "/platform/analytics/overview",
        "/platform/analytics/signups",
        "/platform/analytics/plan-distribution",
        "/platform/analytics/expiring",
        "/platform/analytics/geography",
        "/platform/analytics/devices",
        "/platform/search?q=test",
        "/platform/organizations",
        "/platform/users",
        "/platform/plans",
        "/platform/plans/modules",
        "/platform/system/health",
        "/platform/ip-tracking",
        "/platform/invoices",
        "/platform/revenue/summary",
        "/platform/coupons",
        "/platform/upgrade-requests",
        "/platform/kb",
        "/platform/support/tickets/stats",
        "/platform/support/tickets",
        "/platform/audit-log",
        "/platform/team",
        "/platform/sessions",
        "/platform/announcements",
        "/platform/releases",
    ]
    if platform_token:
        for path in platform_routes:
            check_endpoint("platform", PLATFORM_FE, path, platform_token)

    section("Public endpoints")
    for path in [
        "/health",
        "/openapi.json",
        "/public/careers?org_slug=mashuptech",
    ]:
        check_endpoint("public", API_DIRECT, path, None)

    section("Write operations (user CRUD smoke)")
    if tenant_token:
        suffix = str(int(time.time()))[-6:]
        email = f"prodcheck-{suffix}@test.local"
        status, data = req(TENANT_FE, "POST", "/admin/users", tenant_token, {
            "name": "Pre-prod Check User",
            "email": email,
            "password": "LocalTest123!",
            "password_confirmation": "LocalTest123!",
            "status": "active",
            "employee_id": f"CHK{suffix}",
        })
        if status in (200, 201) and data.get("success"):
            user_id = data.get("data", {}).get("id")
            ok(f"POST /admin/users created id={user_id}")
            if user_id:
                check_endpoint("tenant", TENANT_FE, f"/admin/users/{user_id}", tenant_token)
                status, _ = req(TENANT_FE, "DELETE", f"/admin/users/{user_id}", tenant_token)
                if status in (200, 204):
                    ok(f"DELETE /admin/users/{user_id}")
                else:
                    fail(f"DELETE /admin/users/{user_id}")
        else:
            fail("POST /admin/users", str(data.get("message", data)))

    section("Summary")
    total = passed + len(failures)
    print(f"Passed: {passed}/{total}")
    if failures:
        print("\nFailures:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("All pre-production checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
