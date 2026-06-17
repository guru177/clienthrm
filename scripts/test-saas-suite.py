#!/usr/bin/env python3
"""SaaS integration tests: platform console, tenant isolation, auth, subscriptions, biometric."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

API = "http://localhost:3001"
ICLOCK = "http://localhost:7788"
DB = os.path.join(os.path.dirname(__file__), "..", "database", "database.sqlite")

TENANT_ORG1 = {"email": "admin@mashuptech.in", "password": "password", "org_slug": "mashuptech"}
PLATFORM = {
    "email": os.environ.get("PLATFORM_ADMIN_EMAIL", "admin@retaildaddy.in"),
    "password": os.environ.get("PLATFORM_ADMIN_PASSWORD", "retaildaddy@0123"),
}
SN_ORG1 = "A250902070"
DEVICE_IP = "172.16.1.68"
TEST_DAY = "2026-06-12"


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
        print(f"SAAS RESULTS: {passed}/{total} passed")
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
) -> tuple[int, Any]:
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


def login_tenant(creds: dict) -> str | None:
    code, body = http("POST", f"{API}/api/auth/login", creds)
    if code != 200:
        return None
    return body.get("data", {}).get("token")


def login_platform() -> str | None:
    code, body = http("POST", f"{API}/api/platform/auth/login", PLATFORM)
    if code != 200:
        return None
    return body.get("data", {}).get("token")


def send_attlog(lines: list[str], sn: str = SN_ORG1) -> int:
    body = "\n".join(lines)
    req = urllib.request.Request(
        f"{ICLOCK}/iclock/cdata?SN={sn}&table=ATTLOG",
        data=body.encode(),
        headers={"Content-Type": "text/plain", "X-Forwarded-For": DEVICE_IP},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code


def attlog_line(pin: str, time: str, status: int = 0) -> str:
    return f"{pin}\t{time}\t{status}\t0"


def db_org_for_serial(sn: str) -> int | None:
    conn = sqlite3.connect(DB)
    row = conn.execute(
        "SELECT organization_id FROM biometric_devices WHERE serial_number=?", (sn,)
    ).fetchone()
    conn.close()
    return row[0] if row else None


def main() -> int:
    suite = Suite()
    print("=" * 60)
    print("SAAS QA TEST SUITE")
    print(f"Started: {datetime.now().isoformat(timespec='seconds')}")
    print("=" * 60)

    # --- Layer 0: Infrastructure ---
    code, _ = http("GET", f"{API}/api/health")
    suite.record("SAAS-01", "API health", code == 200, f"HTTP {code}")

    code, _ = http("GET", f"{ICLOCK}/iclock/cdata?SN={SN_ORG1}")
    suite.record("SAAS-02", "Biometric port reachable", code == 200, f"HTTP {code}")

    # --- Layer 1: Platform console ---
    pt = login_platform()
    suite.record("SAAS-03", "Platform admin login", pt is not None)

    if pt:
        ph = {"Authorization": f"Bearer {pt}"}
        code, me = http("GET", f"{API}/api/platform/auth/me", headers=ph)
        suite.record(
            "SAAS-04",
            "Platform /auth/me",
            code == 200 and me.get("data", {}).get("email") == PLATFORM["email"],
            f"HTTP {code}",
        )

        code, orgs = http("GET", f"{API}/api/platform/organizations", headers=ph)
        org_list = orgs.get("data", []) if isinstance(orgs, dict) else []
        suite.record(
            "SAAS-05",
            "Platform list organizations",
            code == 200 and len(org_list) >= 2,
            f"count={len(org_list)}",
        )

        code, plans = http("GET", f"{API}/api/platform/plans", headers=ph)
        plan_list = plans.get("data", []) if isinstance(plans, dict) else []
        suite.record(
            "SAAS-06",
            "Platform subscription plans catalog",
            code == 200 and len(plan_list) >= 3,
            f"plans={len(plan_list)}",
        )

        code, dash = http("GET", f"{API}/api/platform/dashboard/stats", headers=ph)
        suite.record("SAAS-07", "Platform dashboard metrics", code == 200, f"HTTP {code}")

        # Impersonate tenant org 1
        code, imp = http("POST", f"{API}/api/platform/organizations/1/impersonate", headers=ph)
        imp_token = imp.get("data", {}).get("token") if code == 200 else None
        suite.record(
            "SAAS-08",
            "Platform impersonate org 1",
            imp_token is not None,
            f"HTTP {code}",
        )

        if imp_token:
            ih = {"Authorization": f"Bearer {imp_token}"}
            code, ime = http("GET", f"{API}/api/auth/me", headers=ih)
            org_slug = (
                ime.get("data", {}).get("user", {}).get("organization", {}) or {}
            ).get("slug") if isinstance(ime, dict) else None
            suite.record(
                "SAAS-09",
                "Impersonation token works on tenant /auth/me",
                code == 200 and org_slug == "mashuptech",
                f"org={org_slug}",
            )

        # Platform JWT must NOT access tenant admin routes
        code, _ = http("GET", f"{API}/api/admin/users", headers=ph)
        suite.record(
            "SAAS-10",
            "Platform JWT blocked from tenant /admin/*",
            code in (401, 403),
            f"HTTP {code}",
        )

    # --- Layer 2: Tenant auth & org slug ---
    t1 = login_tenant(TENANT_ORG1)
    suite.record("SAAS-11", "Tenant login with org_slug", t1 is not None)

    code, _ = http(
        "POST",
        f"{API}/api/auth/login",
        {"email": TENANT_ORG1["email"], "password": TENANT_ORG1["password"], "org_slug": "wrong-org"},
    )
    suite.record("SAAS-12", "Wrong org_slug login rejected", code in (400, 401), f"HTTP {code}")

    if t1:
        th = {"Authorization": f"Bearer {t1}"}

        code, _ = http("GET", f"{API}/api/platform/organizations", headers=th)
        suite.record(
            "SAAS-13",
            "Tenant JWT blocked from platform routes",
            code in (401, 403),
            f"HTTP {code}",
        )

        code, me = http("GET", f"{API}/api/auth/me", headers=th)
        org_id = me.get("data", {}).get("user", {}).get("organization_id") if isinstance(me, dict) else None
        suite.record("SAAS-14", "Tenant /auth/me returns org context", code == 200 and org_id == 1, f"org_id={org_id}")

        # Cross-tenant user access (org2 user id 37)
        code, _ = http("GET", f"{API}/api/admin/users/37", headers=th)
        suite.record(
            "SAAS-15",
            "Cross-tenant user read blocked (org1 cannot read org2 user)",
            code in (404, 403),
            f"HTTP {code}",
        )

        code, _ = http(
            "POST",
            f"{API}/api/admin/biometric/mapping",
            {"device_serial": SN_ORG1, "device_pin": "99999", "user_id": 37},
            headers=th,
        )
        suite.record(
            "SAAS-16",
            "Cross-tenant PIN mapping rejected (org2 user on org1 device)",
            code == 400,
            f"HTTP {code}",
        )

        # Tenant modules / plan
        code, settings = http("GET", f"{API}/api/admin/settings/app", headers=th)
        suite.record("SAAS-17", "Tenant settings API (org1)", code == 200, f"HTTP {code}")

        code, stats = http("GET", f"{API}/api/admin/biometric/stats", headers=th)
        suite.record(
            "SAAS-18",
            "Biometric module accessible (professional plan)",
            code == 200,
            f"HTTP {code}",
        )

        code, punches = http("GET", f"{API}/api/admin/biometric/punches", headers=th)
        punch_data = punches.get("data", []) if isinstance(punches, dict) else []
        all_org1_device = all(
            p.get("device_serial") == SN_ORG1 or p.get("device_serial", "").startswith("A25")
            for p in punch_data
        ) if punch_data else True
        suite.record(
            "SAAS-19",
            "Punch list scoped to tenant devices",
            code == 200 and all_org1_device,
            f"punches={len(punch_data)}",
        )

        code, att = http("GET", f"{API}/api/admin/attendance/today", headers=th)
        suite.record("SAAS-20", "Attendance today API", code == 200, f"HTTP {code}")

        code, users = http("GET", f"{API}/api/admin/users?per_page=5", headers=th)
        user_rows = users.get("data", []) if isinstance(users, dict) else []
        if not isinstance(user_rows, list):
            user_rows = []
        cross = any(u.get("email") == "guruprasad6282@gmail.com" for u in user_rows if isinstance(u, dict))
        suite.record(
            "SAAS-21",
            "User list excludes other tenants",
            code == 200 and not cross,
            f"sample={len(user_rows)}",
        )

        # Unauthenticated
        code, _ = http("GET", f"{API}/api/admin/users")
        suite.record("SAAS-22", "Unauthenticated tenant API rejected", code == 401, f"HTTP {code}")

    # --- Layer 3: Biometric under SaaS (device bound to org 1) ---
    org_id = db_org_for_serial(SN_ORG1)
    suite.record(
        "SAAS-23",
        "Biometric device bound to org 1",
        org_id == 1,
        f"org_id={org_id}",
    )

    # Inject punch on org1 device
    t_stamp = f"{TEST_DAY} 09:00:00"
    send_attlog([attlog_line("1", t_stamp)])
    conn = sqlite3.connect(DB)
    row = conn.execute(
        "SELECT user_id FROM biometric_punches WHERE punch_time=? AND device_serial=?",
        (t_stamp, SN_ORG1),
    ).fetchone()
    conn.close()
    suite.record("SAAS-24", "Device punch stored for mapped tenant user", row is not None and row[0] == 2)

    if t1:
        th = {"Authorization": f"Bearer {t1}"}
        code, punches = http("GET", f"{API}/api/admin/biometric/punches", headers=th)
        found = any(
            p.get("punch_time", "").startswith(TEST_DAY)
            for p in (punches.get("data", []) if isinstance(punches, dict) else [])
        )
        suite.record("SAAS-25", "New punch visible in tenant punch API", code == 200 and found)

    # --- Layer 4: Org 2 isolation (if we can impersonate) ---
    if pt:
        ph = {"Authorization": f"Bearer {pt}"}
        code, imp2 = http("POST", f"{API}/api/platform/organizations/2/impersonate", headers=ph)
        t2 = imp2.get("data", {}).get("token") if code == 200 else None
        suite.record("SAAS-26", "Platform impersonate org 2 (trial tenant)", t2 is not None, f"HTTP {code}")

        if t2:
            t2h = {"Authorization": f"Bearer {t2}"}
            code, p2 = http("GET", f"{API}/api/admin/biometric/punches", headers=t2h)
            p2_data = p2.get("data", []) if isinstance(p2, dict) else []
            leaked = any(p.get("device_serial") == SN_ORG1 for p in p2_data)
            suite.record(
                "SAAS-27",
                "Org2 cannot see org1 biometric punches",
                code == 200 and not leaked,
                f"org2_punches={len(p2_data)}",
            )

            code, d2 = http("GET", f"{API}/api/admin/biometric/devices", headers=t2h)
            d2_data = d2.get("data", []) if isinstance(d2, dict) else []
            has_org1_device = any(d.get("serial_number") == SN_ORG1 for d in d2_data)
            suite.record(
                "SAAS-28",
                "Org2 device list excludes org1 hardware",
                code == 200 and not has_org1_device,
                f"devices={len(d2_data)}",
            )

    # --- Layer 5: Public signup (dev) ---
    signup_slug = f"qa-test-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    signup_body = {
        "organization_name": "QA Test Org",
        "org_slug": signup_slug,
        "contact_person": "QA Contact",
        "company_email": f"company-{signup_slug}@example.com",
        "company_phone": "+919999999999",
        "country": "India",
        "timezone": "Asia/Kolkata",
        "admin_name": "QA Admin",
        "admin_email": f"qa-{signup_slug}@example.com",
        "admin_mobile": "+919999999998",
        "admin_password": "TestPassword123!",
        "confirm_password": "TestPassword123!",
    }

    # Probe signup availability first
    code_avail, avail = http(
        "POST",
        f"{API}/api/public/signup/check-availability",
        {"org_slug": signup_slug, "admin_email": signup_body["admin_email"]},
    )
    if code_avail == 403:
        suite.record("SAAS-29", "Public tenant signup (if enabled)", True, "SKIP: public signup disabled")
    elif code_avail not in (200, 201):
        suite.record(
            "SAAS-29",
            "Public tenant signup (if enabled)",
            False,
            f"check-availability HTTP {code_avail}",
        )
    else:
        otp_code = None
        verification_id = None
        code_otp, otp_resp = http(
            "POST",
            f"{API}/api/public/signup/send-otp",
            {"channel": "email", **signup_body},
        )
        if code_otp == 403:
            suite.record("SAAS-29", "Public tenant signup (if enabled)", True, "SKIP: signup disabled")
        elif code_otp != 200 or not isinstance(otp_resp, dict):
            suite.record(
                "SAAS-29",
                "Public tenant signup (if enabled)",
                False,
                f"send-otp HTTP {code_otp}",
            )
        else:
            data = otp_resp.get("data") or {}
            verification_id = data.get("verification_id")
            otp_code = data.get("debug_otp")
            if not verification_id:
                suite.record(
                    "SAAS-29",
                    "Public tenant signup (if enabled)",
                    False,
                    "send-otp missing verification_id",
                )
            elif not otp_code:
                suite.record(
                    "SAAS-29",
                    "Public tenant signup (if enabled)",
                    True,
                    "SKIP: OTP debug not exposed (restart backend with SIGNUP_OTP_DEBUG=1 for full signup test)",
                )
            else:
                code, signup = http(
                    "POST",
                    f"{API}/api/public/signup",
                    {
                        **signup_body,
                        "verification_id": verification_id,
                        "otp": otp_code,
                    },
                )
                suite.record(
                    "SAAS-29",
                    "Public tenant signup (if enabled)",
                    code in (200, 201),
                    f"HTTP {code}",
                )
                if code in (200, 201):
                    new_token = signup.get("data", {}).get("token")
                    if new_token:
                        nh = {"Authorization": f"Bearer {new_token}"}
                        code, nme = http("GET", f"{API}/api/auth/me", headers=nh)
                        slug = (
                            (nme.get("data", {}).get("user", {}).get("organization") or {}).get("slug")
                            if isinstance(nme, dict)
                            else None
                        )
                        suite.record(
                            "SAAS-30",
                            "New tenant isolated after signup",
                            slug == signup_slug,
                            f"slug={slug}",
                        )

    print(f"\nTest punch on {TEST_DAY} left for UI verification (org 1).")
    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
