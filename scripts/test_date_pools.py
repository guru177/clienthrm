#!/usr/bin/env python3
"""Disjoint far-future date pools for integration tests (avoid leave/holiday 400 collisions).

Bands are day offsets from 2099-01-01:
  workflow   0 .. 12_000
  api_write  15_000 .. 17_000
  ui_flow    18_000 .. 20_000
  e2e        22_000 .. 24_000

CLI: python scripts/test_date_pools.py <salt> <pool> [offset_base]
"""

from __future__ import annotations

import hashlib
from datetime import date, timedelta

BASE = date(2099, 1, 1)

WORKFLOW_MAX = 12_000
API_WRITE_MIN = 15_000
API_WRITE_MAX = 17_000
UI_FLOW_MIN = 18_000
UI_FLOW_MAX = 20_000
E2E_MIN = 22_000
E2E_MAX = 24_000
CORE_INT_MIN = 11_000
CORE_INT_MAX = 11_900


def _offset(band_min: int, band_max: int, salt: int, spread: int = 1000) -> int:
    span = max(1, band_max - band_min - 2)
    return band_min + (salt % min(span, spread))


def _date_from_offset(day_offset: int) -> date:
    return BASE + timedelta(days=day_offset)


def _weekday_span(start: date, span_days: int = 4) -> tuple[str, str]:
    """Mon-aligned range so leave_days_between is > 0 for standard shifts."""
    while start.weekday() >= 5:
        start += timedelta(days=1)
    end = start + timedelta(days=span_days)
    return start.isoformat(), end.isoformat()


def workflow_leave_range(salt: int, offset_base: int = 0) -> tuple[str, str]:
    """Workflow suite: 0..12k band with per-case offset_base."""
    day = _offset(0, WORKFLOW_MAX, salt + (offset_base % 97) * 13, spread=9000)
    return _weekday_span(_date_from_offset(day))


def _hash_offset(band_min: int, band_max: int, salt: int, tag: str) -> int:
    span = max(1, band_max - band_min - 2)
    digest = hashlib.sha256(f"{tag}:{salt}".encode()).hexdigest()
    return band_min + (int(digest[:8], 16) % span)


def api_write_holiday_date(salt: int) -> str:
    day = _hash_offset(API_WRITE_MIN, API_WRITE_MAX, salt, "api_holiday")
    return _date_from_offset(day).isoformat()


def api_write_leave_range(salt: int) -> tuple[str, str]:
    day = _hash_offset(API_WRITE_MIN + 200, API_WRITE_MAX - 200, salt, "api_leave")
    return _weekday_span(_date_from_offset(day))


def ui_flow_holiday_date(salt: int) -> str:
    day = _hash_offset(UI_FLOW_MIN, UI_FLOW_MAX, salt, "ui_holiday")
    return _date_from_offset(day).isoformat()


def ui_flow_leave_range(salt: int) -> tuple[str, str]:
    day = _hash_offset(UI_FLOW_MIN + 200, UI_FLOW_MAX - 200, salt, "ui_leave")
    return _weekday_span(_date_from_offset(day), span_days=5)


def e2e_leave_range(salt: int) -> tuple[str, str]:
    day = _offset(E2E_MIN, E2E_MAX, salt, spread=1000)
    return _weekday_span(_date_from_offset(day))


def core_integration_leave_range(salt: int, slot: int = 0) -> tuple[str, str]:
    """HRM core integration suite — isolated band inside workflow range."""
    day = _hash_offset(CORE_INT_MIN, CORE_INT_MAX, salt + slot * 7919, f"core_leave_{slot}")
    return _weekday_span(_date_from_offset(day))


if __name__ == "__main__":
    import json
    import sys

    salt = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    pool = sys.argv[2] if len(sys.argv) > 2 else "api_write"
    offset_base = int(sys.argv[3]) if len(sys.argv) > 3 else 0

    if pool == "workflow":
        start, end = workflow_leave_range(salt, offset_base)
        print(json.dumps({"start": start, "end": end}))
    elif pool == "api_write":
        start, end = api_write_leave_range(salt)
        print(json.dumps({"holiday": api_write_holiday_date(salt), "start": start, "end": end}))
    elif pool == "ui_flow":
        start, end = ui_flow_leave_range(salt)
        print(json.dumps({"holiday": ui_flow_holiday_date(salt), "start": start, "end": end}))
    elif pool == "e2e":
        start, end = e2e_leave_range(salt)
        print(json.dumps({"start": start, "end": end}))
    elif pool == "core_integration":
        slot = offset_base
        start, end = core_integration_leave_range(salt, slot)
        print(json.dumps({"start": start, "end": end}))
    else:
        print(json.dumps({"error": f"unknown pool {pool}"}))
        sys.exit(1)
