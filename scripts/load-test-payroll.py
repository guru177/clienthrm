#!/usr/bin/env python3
"""Benchmark payroll preview latency (MonthContext batch path)."""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")
LOGIN = {
    "email": os.environ.get("HRM_EMAIL", "info@retaildaddy.in"),
    "password": os.environ.get("HRM_PASSWORD", "password"),
    "org_slug": os.environ.get("HRM_ORG", "mashuptech"),
}
MONTH = int(os.environ.get("PAYROLL_MONTH", "6"))
YEAR = int(os.environ.get("PAYROLL_YEAR", "2026"))


def http(method: str, url: str, data: dict | None = None, token: str | None = None) -> tuple[int, dict | list | None]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        return e.code, None


def main() -> int:
    code, login = http("POST", f"{API}/api/auth/login", LOGIN)
    if code != 200 or not isinstance(login, dict):
        print(f"Login failed HTTP {code}")
        return 1
    token = login.get("data", {}).get("token")
    code, emps = http("GET", f"{API}/api/admin/payroll/employees", token=token)
    if code != 200 or not isinstance(emps, dict):
        print(f"Employees failed HTTP {code}")
        return 1
    ids = [e["id"] for e in (emps.get("data") or []) if e.get("id")]
    if not ids:
        print("No employees")
        return 1

    limit = int(os.environ.get("LOAD_TEST_EMP_LIMIT", "0"))
    if limit > 0:
        ids = ids[:limit]

    print(f"Payroll preview benchmark: {len(ids)} employees, {YEAR}-{MONTH:02d}")
    t0 = time.perf_counter()
    code, prev = http(
        "POST",
        f"{API}/api/admin/payroll/preview",
        {"month": MONTH, "year": YEAR, "employee_ids": ids},
        token,
    )
    elapsed = time.perf_counter() - t0
    rows = len((prev or {}).get("data") or []) if isinstance(prev, dict) else 0
    print(f"HTTP {code} | rows={rows} | {elapsed:.2f}s | {len(ids) / max(elapsed, 0.001):.1f} emp/s")
    return 0 if code == 200 else 1


if __name__ == "__main__":
    sys.exit(main())
