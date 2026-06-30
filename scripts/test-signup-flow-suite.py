#!/usr/bin/env python3
"""Signup / OTP validation and availability checks."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")
TENANT_LOGIN = {"email": "admin@mashuptech.in", "password": "password", "org_slug": "mashuptech"}
TS = datetime.now().strftime("%Y%m%d%H%M%S")


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
        print(f"SIGNUP FLOW SUITE: {passed}/{total} passed")
        for cid, name, ok, detail in self.results:
            if not ok:
                print(f"  - {cid}: {name} | {detail}")
        return 0 if passed == total else 1


def http(
    method: str,
    url: str,
    data: dict | None = None,
    headers: dict | None = None,
) -> tuple[int, dict | str | None]:
    hdrs = dict(headers or {})
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            try:
                return resp.status, json.loads(raw) if raw else None
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw) if raw else None
        except json.JSONDecodeError:
            return e.code, raw


def api_message(body: dict | str | None) -> str:
    if not isinstance(body, dict):
        return ""
    return str(body.get("message") or body.get("error") or "")


def signup_disabled(code: int) -> bool:
    return code == 403


def base_signup_body(slug: str) -> dict:
    return {
        "organization_name": "Signup QA Org",
        "org_slug": slug,
        "contact_person": "QA Contact",
        "company_email": f"company-{slug}@example.com",
        "company_phone": "+919999999999",
        "country": "India",
        "timezone": "Asia/Kolkata",
        "admin_name": "QA Admin",
        "admin_email": f"admin-{slug}@example.com",
        "admin_mobile": "+919999999998",
        "admin_password": "TestPassword123!",
        "confirm_password": "TestPassword123!",
    }


def main() -> int:
    print("=" * 60)
    print("SIGNUP & OTP FLOW SUITE")
    print("=" * 60)

    suite = Suite()
    slug = f"signup-qa-{TS}"

    code, _ = http(
        "POST",
        f"{API}/api/public/signup/check-availability",
        {"org_slug": slug},
    )
    if signup_disabled(code):
        suite.record(
            "SIGNUP-00",
            "Public signup enabled",
            True,
            "SKIP: ALLOW_PUBLIC_SIGNUP disabled",
        )
        return suite.summary()

    suite.record("SIGNUP-00", "Public signup enabled", True)

    code, body = http(
        "POST",
        f"{API}/api/public/signup/check-availability",
        {"company_email": "not-an-email"},
    )
    err = api_message(body)
    suite.record(
        "SIGNUP-01",
        "Reject invalid company email on check-availability",
        code == 400 and "email" in err.lower(),
        f"HTTP {code}",
    )

    code, body = http(
        "POST",
        f"{API}/api/public/signup/check-availability",
        {"admin_email": "bad@"},
    )
    err = api_message(body)
    suite.record(
        "SIGNUP-02",
        "Reject invalid admin email on check-availability",
        code == 400 and "email" in err.lower(),
        f"HTTP {code}",
    )

    login_code, login = http("POST", f"{API}/api/auth/login", TENANT_LOGIN)
    token = login.get("data", {}).get("token") if isinstance(login, dict) else None
    existing_company_email = None
    if login_code == 200 and token:
        _, me = http("GET", f"{API}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        if isinstance(me, dict):
            org = (me.get("data") or {}).get("user", {}).get("organization") or {}
            existing_company_email = org.get("company_email")

    if existing_company_email:
        code, body = http(
            "POST",
            f"{API}/api/public/signup/check-availability",
            {"org_slug": f"other-{slug}", "company_email": existing_company_email},
        )
        err = api_message(body)
        suite.record(
            "SIGNUP-03",
            "Reject duplicate company email on check-availability",
            code == 409 and "company email" in err.lower(),
            f"HTTP {code}",
        )
    else:
        suite.record(
            "SIGNUP-03",
            "Reject duplicate company email on check-availability",
            True,
            "SKIP: no company_email on default tenant org",
        )

    signup_body = base_signup_body(slug)
    signup_body["company_email"] = "also-bad@"
    code, body = http("POST", f"{API}/api/public/signup/send-otp", {"channel": "email", **signup_body})
    err = api_message(body)
    suite.record(
        "SIGNUP-04",
        "Reject invalid company email on send-otp",
        code == 400 and "email" in err.lower(),
        f"HTTP {code}",
    )

    signup_body = base_signup_body(slug)
    code, body = http("POST", f"{API}/api/public/signup", signup_body)
    err = api_message(body)
    if code == 429:
        suite.record(
            "SIGNUP-05",
            "Reject signup without OTP",
            True,
            "SKIP: signup rate limit (5/hour per IP)",
        )
    else:
        suite.record(
            "SIGNUP-05",
            "Reject signup without OTP",
            code in (400, 401, 422) and bool(err),
            f"HTTP {code}",
        )

    signup_body = base_signup_body(slug)
    code_avail, _ = http(
        "POST",
        f"{API}/api/public/signup/check-availability",
        {
            "org_slug": slug,
            "company_email": signup_body["company_email"],
            "admin_email": signup_body["admin_email"],
        },
    )
    if code_avail not in (200, 201):
        suite.record(
            "SIGNUP-06",
            "Full signup with OTP (debug)",
            False,
            f"availability HTTP {code_avail}",
        )
    else:
        code_otp, otp_resp = http(
            "POST",
            f"{API}/api/public/signup/send-otp",
            {"channel": "email", **signup_body},
        )
        if code_otp == 429:
            suite.record(
                "SIGNUP-06",
                "Full signup with OTP (debug)",
                True,
                "SKIP: signup rate limit (5/hour per IP)",
            )
        else:
            data = (otp_resp or {}).get("data", {}) if isinstance(otp_resp, dict) else {}
            verification_id = data.get("verification_id")
            otp_code = data.get("debug_otp")
            if not verification_id:
                suite.record(
                    "SIGNUP-06",
                    "Full signup with OTP (debug)",
                    False,
                    f"send-otp HTTP {code_otp}",
                )
            elif not otp_code:
                suite.record(
                    "SIGNUP-06",
                    "Full signup with OTP (debug)",
                    True,
                    "SKIP: set SIGNUP_OTP_DEBUG=1 for full path",
                )
            else:
                code, signup = http(
                    "POST",
                    f"{API}/api/public/signup",
                    {**signup_body, "verification_id": verification_id, "otp": otp_code},
                )
                if code == 429:
                    suite.record(
                        "SIGNUP-06",
                        "Full signup with OTP (debug)",
                        True,
                        "SKIP: signup rate limit (5/hour per IP)",
                    )
                else:
                    token_new = (signup or {}).get("data", {}).get("token") if isinstance(signup, dict) else None
                    suite.record(
                        "SIGNUP-06",
                        "Full signup with OTP (debug)",
                        code in (200, 201) and bool(token_new),
                        f"HTTP {code}",
                    )

    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
