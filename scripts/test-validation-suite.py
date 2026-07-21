#!/usr/bin/env python3
"""Reject empty/null required fields; allow optional fields to be omitted."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")
TENANT_LOGIN = {"email": "info@retaildaddy.in", "password": os.environ.get("HRM_PASSWORD", "Guru!1234"), "org_slug": "mashuptech"}
PLATFORM_LOGIN = {
    "email": os.environ.get("PLATFORM_ADMIN_EMAIL", "admin@retaildaddy.in"),
    "password": os.environ.get("PLATFORM_ADMIN_PASSWORD", "LocalTest123!"),
}
TS = int(datetime.now().timestamp() * 1000)


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
        print(f"VALIDATION SUITE: {passed}/{total} passed")
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


def expect_bad(code: int, body: dict | str | None) -> bool:
    if code != 400:
        return False
    if isinstance(body, dict):
        return body.get("success") is False or body.get("type") == "error"
    return True


def expect_ok(code: int) -> bool:
    return code in (200, 201)


def main() -> int:
    suite = Suite()
    print("=" * 60)
    print("VALIDATION SUITE (null / empty required fields)")
    print(f"Started: {datetime.now().isoformat(timespec='seconds')}")
    print("=" * 60)

    token = login_tenant()
    suite.record("VAL-00", "Tenant login", token is not None)
    if not token:
        return suite.summary()

    auth = {"Authorization": f"Bearer {token}"}
    far = (datetime.now() + timedelta(days=400)).strftime("%Y-%m-%d")

    cases = [
        ("VAL-01", "Department empty name", "POST", "/api/admin/departments", {"name": "", "description": None}),
        ("VAL-02", "Designation empty name", "POST", "/api/admin/designations", {"name": "   "}),
        ("VAL-03", "Holiday empty name/date", "POST", "/api/admin/holidays", {"name": "", "date": ""}),
        ("VAL-04", "Task empty title", "POST", "/api/admin/tasks", {"title": ""}),
        ("VAL-05", "Role empty name", "POST", "/api/admin/roles", {"name": ""}),
        ("VAL-06", "Career empty title", "POST", "/api/admin/careers", {"title": ""}),
        ("VAL-07", "Project empty name", "POST", "/api/admin/projects", {"name": ""}),
        (
            "VAL-08",
            "Workflow missing actions",
            "POST",
            "/api/admin/workflows",
            {"name": "WF", "trigger_type": "leave_request_submitted"},
        ),
        (
            "VAL-09",
            "Workflow empty name",
            "POST",
            "/api/admin/workflows",
            {
                "name": "",
                "trigger_type": "leave_request_submitted",
                "actions": [{"type": "send_notification", "config": {}}],
            },
        ),
        (
            "VAL-10",
            "Leave missing reason",
            "POST",
            "/api/admin/leave-requests",
            {"leave_type": "annual", "start_date": far, "end_date": far},
        ),
        (
            "VAL-11",
            "Leave reason too short",
            "POST",
            "/api/admin/leave-requests",
            {
                "leave_type": "annual",
                "start_date": far,
                "end_date": far,
                "reason": "short",
            },
        ),
    ]

    for case_id, name, method, path, payload in cases:
        code, body = http(method, f"{API}{path}", payload, auth)
        suite.record(case_id, name, expect_bad(code, body), f"HTTP {code}")

    # Optional fields allowed when essentials present
    code_centers, centers_body = http("GET", f"{API}/api/admin/settings/centers", headers=auth)
    center_id = 1
    if code_centers == 200 and isinstance(centers_body, dict):
        rows = centers_body.get("data")
        if isinstance(rows, list) and rows:
            center_id = rows[0].get("id", 1)
    code, body = http(
        "POST",
        f"{API}/api/admin/departments",
        {"name": f"Val Dept {TS}", "description": "", "center_id": center_id},
        auth,
    )
    suite.record("VAL-20", "Department optional description empty", expect_ok(code), f"HTTP {code}")

    code, body = http(
        "POST",
        f"{API}/api/admin/careers",
        {"title": f"Val Career {TS}"},
        auth,
    )
    suite.record("VAL-21", "Career title-only create", expect_ok(code), f"HTTP {code}")

    # User PATCH empty name
    code, users_body = http("GET", f"{API}/api/admin/users/list", headers=auth)
    user_id = None
    if code == 200 and isinstance(users_body, dict):
        rows = users_body.get("data")
        if isinstance(rows, list) and rows:
            user_id = rows[0].get("id")
    if user_id:
        code, body = http(
            "PUT",
            f"{API}/api/admin/users/{user_id}",
            {"name": ""},
            auth,
        )
        suite.record("VAL-12", "User update empty name rejected", expect_bad(code, body), f"HTTP {code}")
    else:
        suite.record("VAL-12", "User update empty name rejected", False, "no user id")

    platform_token = login_platform()
    suite.record("VAL-13", "Platform login", platform_token is not None)
    if platform_token:
        pauth = {"Authorization": f"Bearer {platform_token}"}
        code, body = http(
            "POST",
            f"{API}/api/platform/releases",
            {"version": "", "title": "", "body": "", "status": "draft"},
            pauth,
        )
        suite.record(
            "VAL-14",
            "Release empty version/title rejected",
            expect_bad(code, body),
            f"HTTP {code}",
        )

    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
