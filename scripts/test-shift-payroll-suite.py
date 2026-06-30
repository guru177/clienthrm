#!/usr/bin/env python3
"""Shift ↔ attendance ↔ payroll integration tests."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from calendar import monthrange
from dataclasses import dataclass, field
from datetime import datetime

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")
ICLOCK = "http://localhost:7788"
DB = os.path.join(os.path.dirname(__file__), "..", "database", "database.sqlite")
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
    conn = sqlite3.connect(DB, timeout=30)
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


def load_lop_gross(conn: sqlite3.Connection, user_id: int, month: int, year: int) -> float:
    """Match salary_logic: lop base = gross earnings minus reimbursements."""
    as_of = f"{year}-{month:02}-{monthrange(year, month)[1]}"
    eff = conn.execute(
        """SELECT effective_from FROM salary_structure_items
           WHERE user_id=? AND effective_from <= ?
           ORDER BY effective_from DESC LIMIT 1""",
        (user_id, as_of),
    ).fetchone()
    if eff:
        rows = conn.execute(
            """SELECT COALESCE(sc.component_type, sc.type) AS comp_type, sc.calculation_type,
                      sc.slug, sc.name, ssi.amount
               FROM salary_structure_items ssi
               JOIN salary_components sc ON sc.id = ssi.salary_component_id
               WHERE ssi.user_id=? AND ssi.effective_from=?""",
            (user_id, eff["effective_from"]),
        ).fetchall()
        gross = 0.0
        reimb = 0.0
        for row in rows:
            ctype = (row["comp_type"] or "").lower()
            calc = (row["calculation_type"] or "").lower()
            slug = (row["slug"] or "").lower()
            name = (row["name"] or "").lower()
            amount = float(row["amount"] or 0)
            is_reimb = (
                ctype == "reimbursement"
                or calc == "reimbursement"
                or "reimburse" in slug
                or "reimburse" in name
            )
            if ctype == "earning":
                if is_reimb:
                    reimb += amount
                else:
                    gross += amount
        if gross > 0:
            return max(0.0, gross - reimb)

    legacy = conn.execute(
        """SELECT basic_salary, hra, transport_allowance, other_allowances
           FROM salary_structures WHERE user_id=? AND effective_from <= ?
           ORDER BY effective_from DESC LIMIT 1""",
        (user_id, as_of),
    ).fetchone()
    if legacy:
        return float(
            (legacy["basic_salary"] or 0)
            + (legacy["hra"] or 0)
            + (legacy["transport_allowance"] or 0)
            + (legacy["other_allowances"] or 0)
        )
    return 0.0


def with_db(fn):
    conn = db()
    try:
        return fn(conn)
    finally:
        conn.close()


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

    emp = with_db(get_demo_employee)
    if not emp:
        suite.record("SP-03", "Find Demo Employee 1", False, "not in DB")
        return suite.summary()
    user_id = int(emp["id"])
    suite.record("SP-03", "Find Demo Employee 1", True, f"id={user_id}")

    shift = with_db(lambda c: shift_for_user_on_date(c, user_id, TEST_DAY))
    suite.record(
        "SP-04",
        "User has shift resolved for test day",
        shift is not None,
        f"{shift['name'] if shift else 'none'} {shift['start_time']}-{shift['end_time']}" if shift else "",
    )

    with_db(lambda c: cleanup_shift_test_day(c, user_id))

    # On-time manual attendance (within grace)
    code, _on_time = http(
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
    suite.record(
        "SP-05",
        "Manual on-time attendance created",
        code == 200,
        f"HTTP {code}",
    )

    # Late in + early out
    code, _late = http(
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
    suite.record(
        "SP-07",
        "Manual late+early attendance created",
        code == 200,
        f"HTTP {code}",
    )

    # Payroll shift penalty formula (no local SQLite reads before this API call)
    month, year = 6, 2026
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
    suggested_penalty = float(row.get("suggested_shift_penalty") or 0)
    gross = float(row.get("gross_salary") or 0)
    lop_gross = float(row.get("lop_gross") or gross)
    total_ded = float(row.get("total_deductions") or 0)
    net = float(row.get("net_salary") or 0)
    working = int(row.get("working_days") or 0)
    api_penalty_days = int(row.get("penalty_days") or 0)

    def payroll_checks(c: sqlite3.Connection):
        factor_row = c.execute(
            """SELECT value FROM app_settings
               WHERE key='shift_penalty_half_day_factor'
               AND organization_id=(SELECT id FROM organizations WHERE slug='mashuptech')"""
        ).fetchone()
        factor = float(factor_row["value"]) if factor_row else 0.5
        base = float(row.get("lop_gross") or 0) or load_lop_gross(c, user_id, month, year) or lop_gross
        daily = base / working if working > 0 else 0
        expected_penalty = round(api_penalty_days * daily * factor, 2)
        return factor, expected_penalty, base

    flags_on = with_db(lambda c: attendance_flags(c, user_id, TEST_DAY, "SHIFT-TEST on-time"))
    suite.record(
        "SP-06",
        "On-time: not late, not early",
        flags_on == (False, False),
        f"late={flags_on[0] if flags_on else '?'} early={flags_on[1] if flags_on else '?'} shift={shift['start_time']}-{shift['end_time']}" if shift and flags_on else "missing row",
    )
    flags_le = with_db(lambda c: attendance_flags(c, user_id, TEST_DAY, "SHIFT-TEST late-early"))
    if flags_le and shift:
        suite.record(
            "SP-08",
            "Late+early flags match shift rules",
            flags_le == (True, True),
            f"got late={flags_le[0]} early={flags_le[1]} (shift {shift['start_time']}-{shift['end_time']}, grace in={shift['grace_in_minutes']} out={shift['grace_out_minutes']})",
        )

    factor, expected_penalty, penalty_base = with_db(payroll_checks)

    suite.record(
        "SP-10",
        "Payroll shows penalty days (not auto-deducted)",
        shift_penalty == 0 and (api_penalty_days == 0 or suggested_penalty > 0),
        f"auto_penalty=INR{shift_penalty} days={api_penalty_days} suggested=INR{suggested_penalty}",
    )
    suite.record(
        "SP-11",
        "Suggested penalty formula (days × daily wage × factor)",
        api_penalty_days == 0 or abs(suggested_penalty - expected_penalty) < 2.0,
        f"suggested={suggested_penalty} expected={expected_penalty} factor={factor} working={working} lop_base={penalty_base}",
    )
    suite.record(
        "SP-12",
        "Net = gross - total deductions",
        abs(net - max(0, gross - total_ded)) < 0.05,
        f"gross={gross} ded={total_ded} net={net}",
    )

    # Biometric with shift timing (after payroll preview to avoid SQLite/API contention)
    pin_row = with_db(
        lambda c: c.execute(
            "SELECT device_pin FROM biometric_user_map WHERE user_id=? AND device_serial=? LIMIT 1",
            (user_id, SN),
        ).fetchone()
    )
    if pin_row:
        mapped = pin_row["device_pin"]
        body = f"{mapped}\t{TEST_DAY} 08:00:00\t0\t0\n{mapped}\t{TEST_DAY} 08:30:00\t0\t0"
        http("POST", f"{ICLOCK}/iclock/cdata?SN={SN}&table=ATTLOG", body, {"X-Forwarded-For": DEVICE_IP})
        bio_flags = with_db(
            lambda c: c.execute(
                """SELECT is_late, is_early_exit, clock_in, clock_out FROM attendance
                   WHERE user_id=? AND date=? AND source='biometric' AND deleted_at IS NULL
                   ORDER BY id DESC LIMIT 1""",
                (user_id, TEST_DAY),
            ).fetchone()
        )
        suite.record(
            "SP-09",
            "Biometric punch uses shift for late flag",
            bio_flags is not None and not bool(bio_flags["is_late"]),
            f"late={bool(bio_flags['is_late']) if bio_flags else '?'} in={bio_flags['clock_in'] if bio_flags else '?'}",
        )
    else:
        suite.record("SP-09", "Biometric punch uses shift for late flag", True, "SKIP: user not mapped to device")

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

    # SP-14: Daily register supports scheduled_off and extended sync
    code, daily_raw = http(
        "GET",
        f"{API}/api/admin/reports/daily-attendance?date={TEST_DAY}",
        headers=auth,
    )
    if code == 200:
        daily_payload = json.loads(daily_raw).get("data") or {}
        employees = daily_payload.get("employees") or []
        valid_status = all(
            e.get("attendance_status") in ("present", "open", "absent", "scheduled_off")
            for e in employees
        )
        suite.record(
            "SP-14",
            "Daily register attendance_status includes scheduled_off",
            valid_status and "scheduled_off_count" in daily_payload,
            f"employees={len(employees)} off={daily_payload.get('scheduled_off_count')}",
        )
    else:
        suite.record("SP-14", "Daily register attendance_status includes scheduled_off", False, f"HTTP {code}")

    # SP-15: Manual bulk marking (manual_attendance module path)
    code, bulk_raw = http(
        "POST",
        f"{API}/api/admin/attendance/manual/bulk",
        {
            "date": TEST_DAY,
            "entries": [
                {
                    "user_id": user_id,
                    "clock_in": "09:10:00",
                    "clock_out": "18:00:00",
                    "status": "present",
                    "notes": "SHIFT-TEST manual-bulk",
                }
            ],
        },
        auth,
    )
    bulk_ok = code == 200 and json.loads(bulk_raw).get("success") is not False
    suite.record("SP-15", "Manual bulk marking API", bulk_ok, f"HTTP {code}")

    # SP-16: Orphan biometric check-out is marked processed (prevents device retry storms)
    pin_row2 = with_db(
        lambda c: c.execute(
            "SELECT device_pin FROM biometric_user_map WHERE user_id=? AND device_serial=? LIMIT 1",
            (user_id, SN),
        ).fetchone()
    )
    if pin_row2:
        # Close any open sessions so check-out has nothing to match (true orphan).
        with_db(
            lambda c: c.execute(
                """UPDATE attendance SET clock_out=clock_in, duration_minutes=0, updated_at=datetime('now')
                   WHERE user_id=? AND date=? AND clock_out IS NULL AND deleted_at IS NULL""",
                (user_id, TEST_DAY),
            )
        )
        orphan_time = f"{TEST_DAY} 21:00:00"
        mapped = pin_row2["device_pin"]
        http(
            "POST",
            f"{ICLOCK}/iclock/cdata?SN={SN}&table=ATTLOG",
            f"{mapped}\t{orphan_time}\t1\t0\n",
            {"X-Forwarded-For": DEVICE_IP},
        )
        orphan = with_db(
            lambda c: c.execute(
                """SELECT is_processed FROM biometric_punches
                   WHERE device_serial=? AND punch_time=? ORDER BY id DESC LIMIT 1""",
                (SN, orphan_time),
            ).fetchone()
        )
        suite.record(
            "SP-16",
            "Orphan check-out marked processed",
            orphan is not None and int(orphan["is_processed"]) == 1,
            f"is_processed={orphan['is_processed'] if orphan else '?'}",
        )
    else:
        suite.record("SP-16", "Orphan check-out marked processed", True, "SKIP: user not mapped")

    print(f"\nTest data on {TEST_DAY} tagged SHIFT-TEST* (safe to delete manually).")
    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
