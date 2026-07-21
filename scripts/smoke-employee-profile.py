#!/usr/bin/env python3
"""Smoke test expanded employee profile fields via API."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")
EMAIL = os.environ.get("HRM_EMAIL", "info@retaildaddy.in")
PASSWORD = os.environ.get("HRM_PASSWORD", "password")

FIELDS = {
    "date_of_birth": "1990-05-15",
    "gender": "male",
    "address": "123 Test Street",
    "city": "Mumbai",
    "state": "Maharashtra",
    "country": "India",
    "postal_code": "400001",
    "employment_type": "full_time",
    "work_state": "Maharashtra",
    "tax_regime": "new",
    "date_of_joining": "2024-01-10",
    "bank_name": "HDFC Bank",
    "account_number": "1234567890",
    "ifsc_code": "HDFC0001234",
    "account_type": "savings",
    "pan_number": "ABCDE1234F",
    "aadhar_number": "123456789012",
    "pf_number": "PF/TEST/001",
    "esi_number": "ESI123456",
}


def http(method: str, url: str, data: dict | None = None, headers: dict | None = None) -> tuple[int, dict | str | None]:
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


def main() -> int:
    code, body = http("POST", f"{API}/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    if code != 200 or not isinstance(body, dict) or not body.get("success"):
        print(f"FAIL login HTTP {code}: {body}")
        return 1
    token = body["data"]["token"]
    auth = {"Authorization": f"Bearer {token}"}

    code, users_body = http("GET", f"{API}/api/admin/users/list", headers=auth)
    if code != 200 or not isinstance(users_body, dict):
        print(f"FAIL users list HTTP {code}")
        return 1
    users = users_body.get("data") or []
    if not users:
        print("FAIL no users in org")
        return 1

    user = next((u for u in users if not (u.get("name") or "").strip()), users[0])
    uid = user["id"]
    print(f"Testing user id={uid} name={user.get('name')!r}")

    payload = {"name": user.get("name") or f"QA User {uid}", **FIELDS}
    code, updated = http("PUT", f"{API}/api/admin/users/{uid}", payload, headers=auth)
    if code != 200 or not isinstance(updated, dict) or not updated.get("success"):
        print(f"FAIL update HTTP {code}: {updated}")
        return 1

    code, fetched = http("GET", f"{API}/api/admin/users/{uid}", headers=auth)
    if code != 200 or not isinstance(fetched, dict) or not fetched.get("success"):
        print(f"FAIL get HTTP {code}: {fetched}")
        return 1

    data = fetched.get("data") or {}
    missing = [k for k in FIELDS if data.get(k) != FIELDS[k]]
    if missing:
        print("FAIL fields not persisted:")
        for k in missing:
            print(f"  {k}: expected {FIELDS[k]!r}, got {data.get(k)!r}")
        return 1

    print(f"PASS employee profile smoke — {len(FIELDS)} fields round-trip OK for user {uid}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
