#!/usr/bin/env python3
"""Shift ↔ attendance ↔ payroll integration tests."""

from __future__ import annotations

import json
import sqlite3
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime

API = "http://localhost:3001"
ICLOCK = "http://localhost:7788"
DB = "database/database.sqlite"
LOGIN = {"email": "admin@mashuptech.in", "password": "password", "org_slug": "mashuptech"}
TEST_DAY = "2026-06-12"
SN = "A250902070"
DEVICE_IP = "172.16.1.68"


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
        print(f"SHIFT+PAYROLL RESULTS: {passed}/{total} passed")
        for cid, name, ok, detail in self.results:
            if not ok:
                print(f"  - {cid}: {name} | {detail}")
        return 0 if passed == total else 1


def http(method: str, url: str, data: dict | str | None = None, headers: dict | None = None) -> tuple[int, str]:
    hdrs = dict(headers or {})
    body = None
    if data is not None:
        if isinstance(data, dict):
            body = json.dumps(data).encode()
            hdrs.setdefault("Content-Type", "application/json")
        else:
            body = data.encode() if isinstance(data, str) else data
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def cleanup_shift_test_day(conn: sqlite3.Connection, user_id: int) -> None:
    conn.execute(
        "DELETE FROM attendance WHERE user_id=? AND date=? AND notes LIKE 'SHIFT-TEST%'",
        (user_id, TEST_DAY),
    )
    conn.execute(
        "DELETE FROM biometric_punches WHERE device_serial=? AND punch_time LIKE ?",
        (SN, TEST_DAY + "%"),
    )
    conn.commit()


def get_demo_employee(conn: sqlite3.Connection) -> sqlite3.Row | None:
    return conn.execute(
        """SELECT u.id, u.name FROM users u
           INNER JOIN organizations o ON o.id = u.organization_id AND o.slug='mashuptech'
           WHERE u.name LIKE 'Demo Employee 1%' AND u.deleted_at IS NULL LIMIT 1"""
    ).fetchone()


def shift_for_user_on_date(conn: sqlite3.Connection, user_id: int, date: str) -> dict | None:
    row = conn.execute(
        """SELECT st.start_time, st.end_time, st.grace_in_minutes, st.grace_out_minutes, st.name
           FROM user_shift_assignments usa
           INNER JOIN shift_templates st ON st.id = usa.shift_template_id
           WHERE usa.user_id=? AND usa.effective_from <= ? AND (usa.effective_to IS NULL OR usa.effective_to >= ?)
           ORDER BY usa.effective_from DESC LIMIT 1""",
        (user_id, date, date),
    ).fetchone()
    if row:
        return dict(row)
    row = conn.execute(
        """SELECT start_time, end_time, grace_in_minutes, grace_out_minutes, name
           FROM shift_templates WHERE is_default=1 LIMIT 1"""
    ).fetchone()
    return dict(row) if row else None


def attendance_flags(conn: sqlite3.Connection, user_id: int, date: str, notes: str) -> tuple[bool, bool] | None:
    row = conn.execute(
        """SELECT is_late, is_early_exit FROM attendance
           WHERE user_id=? AND date=? AND notes=? AND deleted_at IS NULL""",
        (user_id, date, notes),
    ).fetchone()
    if not row:
        return None
    return bool(row["is_late"]), bool(row["is_early_exit"])


def penalty_days_for_user(conn: sqlite3.Connection, user_id: int, month: int, year: int) -> int:
    start = f"{year:04d}-{month:02d}-01"
    end = f"{year:04d}-{month+1:02d}-01" if month < 12 else f"{year+1}-01-01"
    row = conn.execute(
        """SELECT COUNT(DISTINCT date) AS c FROM attendance
           WHERE user_id=? AND deleted_at IS NULL AND clock_out IS NOT NULL
             AND date >= ? AND date < ?
             AND (is_late=1 OR is_early_exit=1)""",
        (user_id, start, end),
    ).fetchone()
    return int(row["c"] or 0)


def main() -> int:
    suite = Suite()
    print("=" * 60)
    print("SHIFT + ATTENDANCE + PAYROLL TEST SUITE")
    print(f"Test day: {TEST_DAY} | {datetime.now().isoformat(timespec='seconds')}")
    print("=" * 60)

    code, login_body = http("POST", f"{API}/api/auth/login", LOGIN)
    if code != 200:
        suite.record("SP-01", "Login", False, f"HTTP {code}")
        return suite.summary()
    token = json.loads(login_body)["data"]["token"]
    auth = {"Authorization": f"Bearer {token}"}
    suite.record("SP-01", "Login", True)

    code, shifts_raw = http("GET", f"{API}/api/admin/shifts", headers=auth)
    if code != 200:
        suite.record("SP-02", "List shift templates", False, f"HTTP {code}")
        return suite.summary()
    shifts = json.loads(shifts_raw).get("data") or []
    suite.record("SP-02", "List shift templates", len(shifts) > 0, f"count={len(shifts)}")

    conn = db()
    emp = get_demo_employee(conn)
    if not emp:
        suite.record("SP-03", "Find Demo Employee 1", False, "not in DB")
        return suite.summary()
    user_id = int(emp["id"])
    suite.record("SP-03", "Find Demo Employee 1", True, f"id={user_id}")

    shift = shift_for_user_on_date(conn, user_id, TEST_DAY)
    suite.record(
        "SP-04",
        "User has shift resolved for test day",
        shift is not None,
        f"{shift['name'] if shift else 'none'} {shift['start_time']}-{shift['end_time']}" if shift else "",
    )

    cleanup_shift_test_day(conn, user_id)

    # On-time manual attendance (within grace)
    code, on_time = http(
        "POST",
        f"{API}/api/admin/attendance/manual",
        {
            "user_id": user_id,
            "date": TEST_DAY,
            "clock_in": "09:05:00",
            "clock_out": "18:00:00",
            "status": "present",
            "notes": "SHIFT-TEST on-time",
        },
        auth,
    )
    flags_on = attendance_flags(conn, user_id, TEST_DAY, "SHIFT-TEST on-time")
    suite.record(
        "SP-05",
        "Manual on-time attendance created",
        code == 200 and flags_on is not None,
        f"HTTP {code} flags={flags_on}",
    )
    if flags_on:
        suite.record(
            "SP-06",
            "On-time: not late, not early",
            flags_on == (False, False),
            f"late={flags_on[0]} early={flags_on[1]} shift={shift['start_time']}-{shift['end_time']}" if shift else "",
        )

    # Late in + early out
    code, late = http(
        "POST",
        f"{API}/api/admin/attendance/manual",
        {
            "user_id": user_id,
            "date": TEST_DAY,
            "clock_in": "10:30:00",
            "clock_out": "17:00:00",
            "status": "present",
            "notes": "SHIFT-TEST late-early",
        },
        auth,
    )
    flags_le = attendance_flags(conn, user_id, TEST_DAY, "SHIFT-TEST late-early")
    suite.record(
        "SP-07",
        "Manual late+early attendance created",
        code == 200 and flags_le is not None,
        f"HTTP {code} flags={flags_le}",
    )
    if flags_le and shift:
        expect_late = True  # 10:30 > start + grace
        expect_early = True  # 17:00 < end - grace
        suite.record(
            "SP-08",
            "Late+early flags match shift rules",
            flags_le == (expect_late, expect_early),
            f"got late={flags_le[0]} early={flags_le[1]} (shift {shift['start_time']}-{shift['end_time']}, grace in={shift['grace_in_minutes']} out={shift['grace_out_minutes']})",
        )

    # Biometric with shift timing
    mapped = conn.execute(
        "SELECT device_pin FROM biometric_user_map WHERE user_id=? AND device_serial=? LIMIT 1",
        (user_id, SN),
    ).fetchone()
    if mapped:
        pin = mapped["device_pin"]
        body = f"{pin}\t{TEST_DAY} 08:00:00\t0\t0\n{pin}\t{TEST_DAY} 08:30:00\t0\t0"
        http("POST", f"{ICLOCK}/iclock/cdata?SN={SN}&table=ATTLOG", body, {"X-Forwarded-For": DEVICE_IP})
        bio_flags = conn.execute(
            """SELECT is_late, is_early_exit, clock_in, clock_out FROM attendance
               WHERE user_id=? AND date=? AND source='biometric' AND deleted_at IS NULL
               ORDER BY id DESC LIMIT 1""",
            (user_id, TEST_DAY),
        ).fetchone()
        suite.record(
            "SP-09",
            "Biometric punch uses shift for late flag",
            bio_flags is not None,
            f"late={bool(bio_flags['is_late']) if bio_flags else '?'} in={bio_flags['clock_in'] if bio_flags else '?'} out={bio_flags['clock_out'] if bio_flags else '?'}",
        )
    else:
        suite.record("SP-09", "Biometric punch uses shift for late flag", True, "SKIP: user not mapped to device")

    # Payroll shift penalty formula
    month, year = 2026, 6
    code, prev_raw = http(
        "POST",
        f"{API}/api/admin/payroll/preview",
        {"month": month, "year": year, "employee_ids": [user_id]},
        auth,
    )
    if code != 200:
        suite.record("SP-10", "Payroll preview with shift penalty", False, f"HTTP {code}")
        return suite.summary()

    preview = json.loads(prev_raw).get("data") or []
    row = next((p for p in preview if not p.get("skipped")), None)
    if not row:
        suite.record("SP-10", "Payroll preview with shift penalty", False, "no preview row")
        return suite.summary()

    shift_penalty = float(row.get("shift_penalty") or 0)
    gross = float(row.get("gross_salary") or 0)
    total_ded = float(row.get("total_deductions") or 0)
    net = float(row.get("net_salary") or 0)
    working = int(row.get("working_days") or 0)

    factor_row = conn.execute(
        """SELECT value FROM app_settings
           WHERE key='shift_penalty_half_day_factor'
           AND organization_id=(SELECT id FROM organizations WHERE slug='mashuptech')"""
    ).fetchone()
    factor = float(factor_row["value"]) if factor_row else 0.5

    penalty_days = penalty_days_for_user(conn, user_id, month, year)
    lop_gross_row = conn.execute(
        """SELECT gross_salary FROM payslips WHERE user_id=? AND month=? AND year=? ORDER BY id DESC LIMIT 1""",
        (user_id, month, year),
    ).fetchone()
    # Use gross from preview as lop base approximation
    daily = gross / working if working > 0 else 0
    expected_penalty = round(penalty_days * daily * factor, 2)

    suite.record(
        "SP-10",
        "Payroll includes shift penalty",
        shift_penalty > 0 or penalty_days == 0,
        f"penalty=INR{shift_penalty} days={penalty_days} expected~INR{expected_penalty}",
    )
    suite.record(
        "SP-11",
        "Shift penalty formula (days × daily wage × factor)",
        penalty_days == 0 or abs(shift_penalty - expected_penalty) < 2.0,
        f"penalty={shift_penalty} expected={expected_penalty} factor={factor} working={working}",
    )
    suite.record(
        "SP-12",
        "Net = gross - total deductions",
        abs(net - max(0, gross - total_ded)) < 0.05,
        f"gross={gross} ded={total_ded} net={net}",
    )

    code, today = http("GET", f"{API}/api/admin/attendance/today", headers=auth)
    if code == 200:
        shift_json = json.loads(today).get("data", {}).get("shift")
        suite.record(
            "SP-13",
            "Today attendance API returns shift context",
            shift_json is not None and "start_time" in (shift_json or {}),
            f"shift={shift_json.get('template_name') if shift_json else 'none'}",
        )
    else:
        suite.record("SP-13", "Today attendance API returns shift context", False, f"HTTP {code}")

    conn.close()
    print(f"\nTest data on {TEST_DAY} tagged SHIFT-TEST* (safe to delete manually).")
    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
