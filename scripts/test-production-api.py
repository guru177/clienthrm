#!/usr/bin/env python3
"""Smoke test for a deployed HRM API.

Credentials (optional for authenticated checks):
  PROD_HRM_EMAIL / PROD_HRM_PASSWORD / PROD_HRM_ORG
  PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD

Without credentials, public checks still run and login is SKIPPED (not failed).
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://hrm-api.hoteldaddy.in/api"

TENANT_EMAIL = os.environ.get("PROD_HRM_EMAIL")
TENANT_PASSWORD = os.environ.get("PROD_HRM_PASSWORD")
TENANT_ORG = os.environ.get("PROD_HRM_ORG", "mashuptech")
PLATFORM_EMAIL = os.environ.get("PROD_PLATFORM_EMAIL")
PLATFORM_PASSWORD = os.environ.get("PROD_PLATFORM_PASSWORD")

# Local defaults only — never against a remote host (wrong password → false failure).
_is_local = "127.0.0.1" in BASE or "localhost" in BASE
if _is_local:
    TENANT_EMAIL = TENANT_EMAIL or os.environ.get("HRM_EMAIL", "info@retaildaddy.in")
    TENANT_PASSWORD = TENANT_PASSWORD or os.environ.get("HRM_PASSWORD", "Guru!1234")
    PLATFORM_EMAIL = PLATFORM_EMAIL or os.environ.get(
        "PLATFORM_ADMIN_EMAIL", "admin@retaildaddy.in"
    )
    PLATFORM_PASSWORD = PLATFORM_PASSWORD or os.environ.get(
        "PLATFORM_ADMIN_PASSWORD", "LocalTest123!"
    )


def req(method: str, path: str, body: dict | None = None, token: str | None = None):
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=25) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"message": raw[:200]}
        return e.code, payload


def main() -> int:
    passed = 0
    failed = 0
    skipped = 0
    print(f"=== API smoke test: {BASE} ===")

    checks = [
        ("GET", "/health", None, lambda s, d: s == 200 and d.get("status") == "ok"),
        ("GET", "/openapi.json", None, lambda s, d: s == 200 and isinstance(d, dict)),
        ("GET", "/public/careers?org_slug=mashuptech", None, lambda s, d: s == 200),
    ]
    for method, path, body, ok_fn in checks:
        status, data = req(method, path, body)
        ok = ok_fn(status, data)
        print(f"[{'PASS' if ok else 'FAIL'}] {status} {path}")
        if ok:
            passed += 1
        else:
            failed += 1
            print(f"       {data}")

    # Prefer explicit production tenant credentials; do not fail CI on wrong local defaults.
    if TENANT_EMAIL and TENANT_PASSWORD:
        status, data = req(
            "POST",
            "/auth/login",
            {
                "email": TENANT_EMAIL,
                "password": TENANT_PASSWORD,
                "org_slug": TENANT_ORG,
            },
        )
        token = data.get("data", {}).get("token") if isinstance(data, dict) else None
        login_ok = status == 200 and data.get("success") and token
        print(f"[{'PASS' if login_ok else 'FAIL'}] {status} /auth/login")
        if login_ok:
            passed += 1
            for path in ["/auth/me", "/admin/dashboard/hr-data", "/admin/users/stats"]:
                st, d = req("GET", path, token=token)
                ok = st == 200 and d.get("success") is not False
                print(f"[{'PASS' if ok else 'FAIL'}] {st} {path}")
                if ok:
                    passed += 1
                else:
                    failed += 1
                    print(f"       {d.get('message', d)}")
        else:
            failed += 1
            print(f"       {data.get('message', data)}")
    else:
        print("[SKIP] /auth/login (set PROD_HRM_EMAIL + PROD_HRM_PASSWORD)")
        skipped += 1

    if PLATFORM_EMAIL and PLATFORM_PASSWORD:
        status, data = req(
            "POST",
            "/platform/auth/login",
            {"email": PLATFORM_EMAIL, "password": PLATFORM_PASSWORD},
        )
        token = data.get("data", {}).get("token") if isinstance(data, dict) else None
        ok = status == 200 and bool(token)
        print(f"[{'PASS' if ok else 'FAIL'}] {status} /platform/auth/login")
        if ok:
            passed += 1
            st, d = req("GET", "/platform/auth/me", token=token)
            me_ok = st == 200
            print(f"[{'PASS' if me_ok else 'FAIL'}] {st} /platform/auth/me")
            if me_ok:
                passed += 1
            else:
                failed += 1
        else:
            failed += 1
            print(f"       {data.get('message', data)}")
    else:
        print("[SKIP] /platform/auth/login (set PROD_PLATFORM_EMAIL + PROD_PLATFORM_PASSWORD)")
        skipped += 1

    print(f"\nResult: {passed} passed, {failed} failed, {skipped} skipped")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
