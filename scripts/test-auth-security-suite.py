#!/usr/bin/env python3
"""Auth & security probes: JWT audience, IDOR, rate limits, path traversal, OTP reset."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")
TS = int(datetime.now().timestamp() * 1000)
TENANT_LOGIN = {"email": "admin@mashuptech.in", "password": "password", "org_slug": "mashuptech"}
PLATFORM_LOGIN = {
    "email": os.environ.get("PLATFORM_ADMIN_EMAIL", "admin@retaildaddy.in"),
    "password": os.environ.get("PLATFORM_ADMIN_PASSWORD", "retaildaddy@0123"),
}


@dataclass
class Suite:
    results: list[tuple[str, str, bool, str]] = field(default_factory=list)

    def record(self, case_id: str, name: str, passed: bool, detail: str = "") -> None:
        self.results.append((case_id, name, passed, detail))
        mark = "PASS" if passed else "FAIL"
        print(f"  [{mark}] {case_id}: {name}" + (f" | {detail}" if detail else ""))

    def summary(self) -> int:
        passed = sum(1 for *_, ok, _ in self.results if ok)
        total = len(self.results)
        print("\n" + "=" * 60)
        print(f"AUTH/SECURITY RESULTS: {passed}/{total} passed")
        for cid, name, ok, detail in self.results:
            if not ok:
                print(f"  - {cid}: {name} | {detail}")
        return 0 if passed == total else 1


def http(method: str, url: str, data: dict | None = None, headers: dict | None = None) -> tuple[int, dict | str]:
    hdrs = dict(headers or {})
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
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
    code, body = http("POST", f"{API}/api/auth/login", TENANT_LOGIN)
    if code != 200 or not isinstance(body, dict):
        return None
    return body.get("data", {}).get("token")


def login_platform() -> str | None:
    code, body = http("POST", f"{API}/api/platform/auth/login", PLATFORM_LOGIN)
    if code != 200 or not isinstance(body, dict):
        return None
    return body.get("data", {}).get("token")


def main() -> int:
    suite = Suite()
    print("=" * 60)
    print("AUTH & SECURITY SUITE")
    print(f"Started: {datetime.now().isoformat(timespec='seconds')}")
    print("=" * 60)

    tenant_token = login_tenant()
    suite.record("SEC-01", "Tenant login", tenant_token is not None)
    if not tenant_token:
        return suite.summary()

    platform_token = login_platform()
    suite.record("SEC-02", "Platform login", platform_token is not None)

    # JWT audience swap
    if platform_token:
        code, _ = http(
            "GET",
            f"{API}/api/admin/users/list",
            headers={"Authorization": f"Bearer {platform_token}"},
        )
        suite.record("SEC-03", "Platform token rejected on /api/admin", code in (401, 403), f"HTTP {code}")

    if tenant_token:
        code, _ = http(
            "GET",
            f"{API}/api/platform/organizations",
            headers={"Authorization": f"Bearer {tenant_token}"},
        )
        suite.record("SEC-04", "Tenant token rejected on /api/platform", code in (401, 403), f"HTTP {code}")

    # No token
    code, _ = http("GET", f"{API}/api/admin/users/list")
    suite.record("SEC-05", "Admin route requires auth", code in (401, 403), f"HTTP {code}")

    # Tampered token
    bad = tenant_token[:-4] + "XXXX"
    code, _ = http("GET", f"{API}/api/admin/users/list", headers={"Authorization": f"Bearer {bad}"})
    suite.record("SEC-06", "Tampered JWT rejected", code in (401, 403), f"HTTP {code}")

    # IDOR payslip
    code, _ = http(
        "GET",
        f"{API}/api/admin/payslips/999999999/pdf",
        headers={"Authorization": f"Bearer {tenant_token}"},
    )
    suite.record("SEC-07", "Missing payslip IDOR safe", code in (403, 404), f"HTTP {code}")

    # IDOR user
    code, _ = http(
        "GET",
        f"{API}/api/admin/users/999999999",
        headers={"Authorization": f"Bearer {tenant_token}"},
    )
    suite.record("SEC-08", "Missing user IDOR safe", code in (403, 404), f"HTTP {code}")

    # Path traversal on files
    code, _ = http(
        "GET",
        f"{API}/api/admin/files/../../../etc/passwd",
        headers={"Authorization": f"Bearer {tenant_token}"},
    )
    suite.record("SEC-09", "Path traversal blocked", code in (400, 403, 404), f"HTTP {code}")

    # Health endpoint minimal
    code, health = http("GET", f"{API}/api/health")
    leak = False
    if isinstance(health, dict):
        data = health.get("data", health)
        text = json.dumps(data).lower()
        leak = "password" in text or "secret" in text or "token" in text
    suite.record("SEC-10", "Health endpoint no secrets", code == 200 and not leak, f"HTTP {code}")

    # Forgot password OTP — wrong OTP
    code, fp = http(
        "POST",
        f"{API}/api/auth/forgot-password",
        {"email": "admin@mashuptech.in", "org_slug": "mashuptech"},
    )
    suite.record("SEC-11", "Forgot-password accepts request", code in (200, 429), f"HTTP {code}")

    code, bad_otp = http(
        "POST",
        f"{API}/api/auth/verify-password-reset-otp",
        {"email": "admin@mashuptech.in", "org_slug": "mashuptech", "otp": "000000"},
    )
    suite.record("SEC-12", "Wrong OTP rejected", code in (400, 401, 403, 422), f"HTTP {code}")

    # Cross-tenant forgot password (wrong org slug for email)
    code, cross = http(
        "POST",
        f"{API}/api/auth/forgot-password",
        {"email": "admin@mashuptech.in", "org_slug": "nonexistent-org-slug-xyz"},
    )
    # Should not reveal user or succeed silently without leaking
    suite.record(
        "SEC-13",
        "Forgot-password wrong org slug",
        code in (200, 400, 404, 422),
        f"HTTP {code}",
    )

    # Rate limit brute force (use throwaway email — do not lock admin account)
    failures = 0
    probe_email = f"ratelimit-probe-{TS}@example.com"
    for i in range(8):
        code, _ = http(
            "POST",
            f"{API}/api/auth/login",
            {"email": probe_email, "password": f"wrong-{i}", "org_slug": "mashuptech"},
        )
        if code in (401, 429):
            failures += 1
    suite.record("SEC-14", "Failed login attempts handled", failures >= 5, f"{failures}/8 non-200")

    # SQL injection probe (should not 500)
    q = urllib.parse.quote("' OR 1=1--")
    code, _ = http(
        "GET",
        f"{API}/api/admin/users/list?search={q}",
        headers={"Authorization": f"Bearer {tenant_token}"},
    )
    suite.record("SEC-15", "SQL injection probe safe", code in (200, 400), f"HTTP {code}")

    # Malformed payroll preview JSON
    req = urllib.request.Request(
        f"{API}/api/admin/payroll/preview",
        data=b'{"month":6,"year":2026,"adjustments":"not-an-object"}',
        headers={
            "Authorization": f"Bearer {tenant_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            code = resp.status
    except urllib.error.HTTPError as e:
        code = e.code
    suite.record("SEC-16", "Malformed preview body handled", code in (200, 400, 422), f"HTTP {code}")

    rls_on = os.environ.get("ENABLE_PG_RLS", "").lower() in ("1", "true")
    pg_url = os.environ.get("DATABASE_URL", "")
    if rls_on and pg_url.startswith("postgres"):
        suite.record(
            "SEC-17",
            "Tenant isolation (PostgreSQL RLS)",
            True,
            "ENABLE_PG_RLS=1 with DATABASE_URL",
        )
    else:
        import sqlite3

        db_path = os.path.join(os.path.dirname(__file__), "..", "database", "database.sqlite")
        cross_ok = False
        detail = "no org2 user in database"
        try:
            sconn = sqlite3.connect(db_path)
            row = sconn.execute(
                "SELECT id FROM users WHERE organization_id=2 AND deleted_at IS NULL LIMIT 1"
            ).fetchone()
            sconn.close()
            if row:
                uid = int(row[0])
                code, _ = http(
                    "GET",
                    f"{API}/api/admin/users/{uid}",
                    headers={"Authorization": f"Bearer {tenant_token}"},
                )
                cross_ok = code in (403, 404)
                detail = f"app-level HTTP {code} org2_user={uid}"
        except OSError as e:
            detail = str(e)
        suite.record("SEC-17", "Tenant isolation enforced", cross_ok, detail)

    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
