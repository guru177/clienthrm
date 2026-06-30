"""Shared helpers for API integration tests."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import date

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")

# Leave validation requires at least 10 characters.
MIN_LEAVE_REASON = "Automated test leave request reason"


def http(
    method: str,
    url: str,
    data: dict | None = None,
    headers: dict | None = None,
    timeout: int = 30,
) -> tuple[int, dict | str | None]:
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


def leave_reason(label: str) -> str:
    """Build a leave reason that satisfies the 10-character minimum."""
    text = f"{label} — automated integration test"
    return text if len(text.strip()) >= 10 else MIN_LEAVE_REASON


def default_shift_template_id(auth: dict[str, str]) -> int | None:
    code, body = http("GET", f"{API}/api/admin/shifts", headers=auth)
    if code != 200 or not isinstance(body, dict):
        return None
    rows = body.get("data") or []
    if not isinstance(rows, list):
        return None
    for row in rows:
        if row.get("is_default"):
            return row.get("id")
    return rows[0].get("id") if rows else None


def ensure_today_roster_for_clock_in(auth: dict[str, str], user_id: int) -> bool:
    """Roster the user for today so clock-in works on weekends too."""
    shift_id = default_shift_template_id(auth)
    if not shift_id:
        return False
    today = date.today().isoformat()
    code, _ = http(
        "POST",
        f"{API}/api/admin/shifts/daily-roster",
        {
            "entries": [
                {
                    "user_id": user_id,
                    "roster_date": today,
                    "shift_template_id": shift_id,
                    "is_day_off": False,
                }
            ]
        },
        auth,
    )
    return code in (200, 201)
