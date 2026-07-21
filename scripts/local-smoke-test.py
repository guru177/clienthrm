#!/usr/bin/env python3
"""Local API smoke test — tenant + platform modules."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

API = "http://127.0.0.1:3001/api"
TENANT_EMAIL = "info@retaildaddy.in"
TENANT_PASSWORD = "Guru!1234"
TENANT_ORG = "mashuptech"
PLATFORM_EMAIL = "admin@retaildaddy.in"
PLATFORM_PASSWORD = "LocalTest123!"


def req(method: str, path: str, token: str | None = None, body: dict | None = None):
    url = f"{API}{path}"
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as resp:
            raw = resp.read().decode()
            try:
                parsed = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                parsed = {"_raw": raw[:200]}
            return resp.status, parsed
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"_raw": raw[:200]}
        return e.code, parsed
    except urllib.error.URLError as e:
        return 0, {"message": str(e.reason) if hasattr(e, "reason") else str(e)}


def login_tenant():
    status, data = req(
        "POST",
        "/auth/login",
        body={"email": TENANT_EMAIL, "password": TENANT_PASSWORD, "org_slug": TENANT_ORG},
    )
    if status != 200:
        return None, f"tenant login failed ({status}): {data.get('message', data)}"
    token = data.get("data", {}).get("token") or data.get("data", {}).get("access_token")
    if not token:
        return None, f"tenant login missing token: {data}"
    return token, None


def login_platform():
    status, data = req(
        "POST",
        "/platform/auth/login",
        body={"email": PLATFORM_EMAIL, "password": PLATFORM_PASSWORD},
    )
    if status != 200:
        return None, f"platform login failed ({status}): {data.get('message', data)}"
    token = data.get("data", {}).get("token") or data.get("data", {}).get("access_token")
    if not token:
        return None, f"platform login missing token: {data}"
    return token, None


def main() -> int:
    results: list[tuple[str, str, int, str]] = []
    failures = 0

    def check(group: str, name: str, status: int, expect_ok: bool = True, note: str = ""):
        nonlocal failures
        ok = (200 <= status < 300) if expect_ok else (status == expect_ok)
        label = "PASS" if ok else "FAIL"
        if not ok:
            failures += 1
        msg = note or ""
        results.append((label, group, status, f"{name} {msg}".strip()))
        print(f"[{label}] {group} {name} -> {status} {msg}")

    # Public / health
    s, d = req("GET", "/health")
    check("public", "/health", s, note=str(d.get("status", "")))

    s, _ = req("GET", "/openapi.json")
    check("public", "/openapi.json", s)

    s, _ = req("GET", "/public/careers?org_slug=mashuptech")
    check("public", "/public/careers", s)

    tenant_token, err = login_tenant()
    if err:
        print(f"[FAIL] tenant auth: {err}")
        failures += 1
        tenant_token = None
    else:
        print(f"[PASS] tenant auth login")

    platform_token, perr = login_platform()
    if perr:
        print(f"[WARN] platform auth: {perr}")
    else:
        print(f"[PASS] platform auth login")

    tenant_gets = [
        ("/auth/me", "auth me"),
        ("/auth/presence", "auth presence", "POST", {}),
        ("/admin/dashboard/hr-data", "dashboard"),
        ("/admin/users/stats", "users stats"),
        ("/admin/users/list", "users list"),
        ("/admin/departments/stats", "departments stats"),
        ("/admin/departments/list", "departments list"),
        ("/admin/designations/stats", "designations stats"),
        ("/admin/designations/list", "designations list"),
        ("/admin/roles/stats", "roles stats"),
        ("/admin/roles/list", "roles list"),
        ("/admin/permissions/list", "permissions list"),
        ("/admin/attendance/stats", "attendance stats"),
        ("/admin/attendance/today", "attendance today"),
        ("/admin/shifts", "shifts"),
        ("/admin/leave-types", "leave types"),
        ("/admin/leave-requests/stats", "leave requests stats"),
        ("/admin/holidays", "holidays"),
        ("/admin/salaries/components/list", "salary components"),
        ("/admin/payroll/runs", "payroll runs"),
        ("/admin/workflows", "workflows"),
        ("/admin/tasks", "tasks"),
        ("/admin/projects", "projects"),
        ("/admin/reports/attendance-register", "reports attendance"),
        ("/admin/biometric/devices", "biometric devices"),
        ("/admin/settings/centers", "centers"),
        ("/admin/careers", "careers"),
        ("/admin/settings/app", "app settings"),
        ("/admin/billing/plans", "billing plans"),
        ("/admin/org-notifications/unread-count", "notifications unread"),
        ("/admin/announcements", "announcements"),
        ("/admin/kb", "knowledge base"),
        ("/admin/support/tickets", "support tickets"),
        ("/two-factor/status", "2FA status"),
    ]

    if tenant_token:
        for item in tenant_gets:
            path = item[0]
            name = item[1]
            method = item[2] if len(item) > 2 else "GET"
            body = item[3] if len(item) > 3 else None
            if method == "POST":
                s, data = req("POST", path, tenant_token, body)
            else:
                s, data = req("GET", path, tenant_token)
            note = ""
            if s >= 400:
                note = str(data.get("message", data))[:80]
            check("tenant", name, s, note=note)

    platform_gets = [
        ("/platform/dashboard/stats", "dashboard stats"),
        ("/platform/analytics/overview", "analytics overview"),
        ("/platform/organizations", "organizations"),
        ("/platform/plans", "subscription plans"),
        ("/platform/system/health", "system health"),
        ("/platform/ip-tracking", "ip tracking"),
    ]

    if platform_token:
        for path, name in platform_gets:
            s, data = req("GET", path, platform_token)
            note = ""
            if s >= 400:
                note = str(data.get("message", data))[:80]
            check("platform", name, s, note=note)

    print("\n--- Summary ---")
    print(f"Total checks: {len(results)}, failures: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
