#!/usr/bin/env python3
"""Senior QA-style biometric + attendance integration test suite."""

from __future__ import annotations

from test_helpers import db_connect, ensure_demo_employee_1

import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")
ICLOCK = "http://localhost:7788"
DB = os.path.join(os.path.dirname(__file__), "..", "database", "database.sqlite")
SN = "A250902070"
DEVICE_IP = "172.16.1.68"
LOGIN = {"email": "info@retaildaddy.in", "password": os.environ.get("HRM_PASSWORD", "Guru!1234"), "org_slug": "mashuptech"}
TEST_DAY = "2026-06-11"


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
        print(f"RESULTS: {passed}/{total} passed")
        if passed < total:
            print("\nFailed cases:")
            for r in self.results:
                if not r.passed:
                    print(f"  - {r.case_id}: {r.name} | {r.detail}")
        return 0 if passed == total else 1


def http(
    method: str,
    url: str,
    data: dict | str | None = None,
    headers: dict | None = None,
    timeout: int = 15,
) -> tuple[int, str]:
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
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")


def db():
    conn = db_connect()
    if hasattr(conn, "row_factory"):
        try:
            conn.row_factory = sqlite3.Row
        except Exception:
            pass
    return conn


def punch_count(conn: sqlite3.Connection, pin: str | None = None, day: str | None = None) -> int:
    q = "SELECT COUNT(*) FROM biometric_punches WHERE device_serial=?"
    params: list[Any] = [SN]
    if pin:
        q += " AND device_pin=?"
        params.append(pin)
    if day:
        q += " AND punch_time LIKE ?"
        params.append(day + "%")
    return conn.execute(q, params).fetchone()[0]


def get_punches(conn: sqlite3.Connection, pin: str, day: str) -> list[sqlite3.Row]:
    return conn.execute(
        """SELECT id, punch_time, punch_type, user_id, is_processed
           FROM biometric_punches
           WHERE device_serial=? AND device_pin=? AND punch_time LIKE ?
           ORDER BY punch_time, id""",
        (SN, pin, day + "%"),
    ).fetchall()


def open_session(
    conn: sqlite3.Connection, user_id: int, day: str | None = None
) -> sqlite3.Row | None:
    """Open attendance session. When `day` is set, only that calendar day is checked."""
    if day:
        return conn.execute(
            """SELECT id, date, clock_in, clock_out FROM attendance
               WHERE user_id=? AND date=? AND clock_out IS NULL AND deleted_at IS NULL
                 AND clock_in IS NOT NULL
               ORDER BY id DESC LIMIT 1""",
            (user_id, day),
        ).fetchone()
    return conn.execute(
        """SELECT id, date, clock_in, clock_out FROM attendance
           WHERE user_id=? AND clock_out IS NULL AND deleted_at IS NULL
             AND clock_in IS NOT NULL
           ORDER BY id DESC LIMIT 1""",
        (user_id,),
    ).fetchone()


def send_attlog(lines: list[str], sn: str = SN) -> tuple[int, str]:
    body = "\n".join(lines)
    url = f"{ICLOCK}/iclock/cdata?SN={sn}&table=ATTLOG"
    return http("POST", url, body, headers={"X-Forwarded-For": DEVICE_IP})


def attlog_line(pin: str, time: str, status: int = 0, verify: int = 0) -> str:
    return f"{pin}\t{time}\t{status}\t{verify}"


def cleanup_test_day(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM biometric_punches WHERE device_serial=? AND punch_time LIKE ?", (SN, TEST_DAY + "%"))
    conn.execute(
        """DELETE FROM attendance WHERE source='biometric' AND date=? AND user_id IN (
               SELECT user_id FROM biometric_user_map WHERE device_serial=?
           )""",
        (TEST_DAY, SN),
    )
    conn.commit()


def main() -> int:
    suite = Suite()
    print("=" * 60)
    print("BIOMETRIC QA TEST SUITE")
    print(f"Started: {datetime.now().isoformat(timespec='seconds')}")
    print("=" * 60)

    # --- Infrastructure ---
    code, body = http("GET", f"{API}/api/health")
    suite.record("TC-01", "Backend health", code == 200, f"HTTP {code}")

    code, body = http("GET", f"{ICLOCK}/iclock/cdata?SN={SN}")
    suite.record("TC-02", "iClock handshake (7788)", code == 200, body[:40].replace("\n", " "))

    code, login_body = http("POST", f"{API}/api/auth/login", LOGIN)
    token = None
    if code == 200:
        try:
            token = json.loads(login_body)["data"]["token"]
            suite.record("TC-03", "Admin login", True)
        except (KeyError, json.JSONDecodeError) as e:
            suite.record("TC-03", "Admin login", False, str(e))
    else:
        suite.record("TC-03", "Admin login", False, f"HTTP {code}: {login_body[:120]}")

    if not token:
        return suite.summary()

    auth = {"Authorization": f"Bearer {token}"}

    code, _ = http("GET", f"{API}/api/admin/biometric/stats", headers=auth)
    suite.record("TC-04", "Biometric stats API (auth)", code == 200, f"HTTP {code}")

    code, punches_raw = http("GET", f"{API}/api/admin/biometric/punches", headers=auth)
    suite.record("TC-05", "Punch list API (auth)", code == 200, f"HTTP {code}")

    ensure_demo_employee_1(token)

    # --- Clean test day ---
    conn = db()
    cleanup_test_day(conn)

    mapped = conn.execute(
        "SELECT user_id FROM biometric_user_map WHERE device_serial=? AND device_pin='1'",
        (SN,),
    ).fetchone()
    if not mapped:
        suite.record(
            "TC-05b",
            "Biometric PIN mapping for pin=1",
            False,
            f"no mapping for device {SN} pin 1 — register mapping to continue punch DB asserts",
        )
        conn.close()
        return suite.summary()
    mapped_uid = mapped[0]

    # TC-06: Unregistered device ignored
    code, _ = send_attlog([attlog_line("1", f"{TEST_DAY} 09:00:00")], sn="UNKNOWN_SN_XYZ")
    cnt = conn.execute(
        "SELECT COUNT(*) FROM biometric_punches WHERE device_serial='UNKNOWN_SN_XYZ'"
    ).fetchone()[0]
    suite.record("TC-06", "Unregistered SN not stored", cnt == 0)

    # TC-07: Mapped check-in
    t1 = f"{TEST_DAY} 09:00:00"
    code, _ = send_attlog([attlog_line("1", t1, 0, 0)])
    rows = get_punches(conn, "1", TEST_DAY)
    suite.record(
        "TC-07",
        "First scan = Check In (type 0)",
        len(rows) == 1 and rows[0]["punch_type"] == 0,
        f"type={rows[0]['punch_type'] if rows else 'none'}",
    )
    sess = open_session(conn, mapped_uid, TEST_DAY)
    clock_in_ok = False
    if sess is not None and sess["clock_in"] is not None:
        ci = sess["clock_in"]
        clock_in_ok = str(ci).startswith("09:00") or str(ci) == "09:00:00" or (
            hasattr(ci, "hour") and ci.hour == 9 and ci.minute == 0
        )
    suite.record(
        "TC-08",
        "Check-in creates open attendance",
        clock_in_ok,
        f"session={dict(sess) if sess else None}",
    )

    # TC-09: Second scan → check-out (device sends status 0)
    t2 = f"{TEST_DAY} 09:30:00"
    send_attlog([attlog_line("1", t2, 0, 0)])
    rows = get_punches(conn, "1", TEST_DAY)
    suite.record(
        "TC-09",
        "Second scan = Check Out (type 1)",
        len(rows) == 2 and rows[1]["punch_type"] == 1,
        f"types={[r['punch_type'] for r in rows]}",
    )
    sess = open_session(conn, mapped_uid, TEST_DAY)
    suite.record("TC-10", "Check-out closes session", sess is None, "open session cleared")

    # TC-11: Re-check-in after checkout (critical)
    t3 = f"{TEST_DAY} 10:00:00"
    send_attlog([attlog_line("1", t3, 0, 15)])  # face verify
    rows = get_punches(conn, "1", TEST_DAY)
    suite.record(
        "TC-11",
        "Third scan after checkout = Check In again",
        len(rows) == 3 and rows[2]["punch_type"] == 0,
        f"types={[r['punch_type'] for r in rows]}",
    )
    sess = open_session(conn, mapped_uid, TEST_DAY)
    sess = open_session(conn, mapped_uid, TEST_DAY)
    re_in_ok = False
    if sess is not None and sess["clock_in"] is not None:
        ci = sess["clock_in"]
        re_in_ok = str(ci).startswith("10:00") or (
            hasattr(ci, "hour") and ci.hour == 10 and ci.minute == 0
        )
    suite.record(
        "TC-12",
        "Re-check-in opens new session",
        re_in_ok,
        f"clock_in={sess['clock_in'] if sess else None}",
    )

    # TC-13: Device sends checkout flag with no open session → must be check-in
    # Close session first
    t4 = f"{TEST_DAY} 10:30:00"
    send_attlog([attlog_line("1", t4, 0, 0)])
    t5 = f"{TEST_DAY} 11:00:00"
    send_attlog([attlog_line("1", t5, 1, 15)])  # device says checkout, no open session
    rows = get_punches(conn, "1", TEST_DAY)
    last = rows[-1]
    suite.record(
        "TC-13",
        "Face inout=1 with no open session = Check In (not stuck on out)",
        last["punch_time"].endswith("11:00:00") and last["punch_type"] == 0,
        f"last type={last['punch_type']}",
    )

    # TC-14: Unmapped PIN stored
    before = punch_count(conn, pin="9999")
    send_attlog([attlog_line("9999", f"{TEST_DAY} 11:15:00", 0, 0)])
    row = conn.execute(
        "SELECT user_id FROM biometric_punches WHERE device_pin='9999' AND punch_time LIKE ? ORDER BY id DESC LIMIT 1",
        (TEST_DAY + "%",),
    ).fetchone()
    suite.record(
        "TC-14",
        "Unmapped PIN stored (user_id NULL)",
        row is not None and row[0] is None,
    )

    # TC-15: Duplicate timestamp skipped
    before = punch_count(conn, day=TEST_DAY)
    send_attlog([attlog_line("9999", f"{TEST_DAY} 11:15:00", 0, 0)])
    after = punch_count(conn, day=TEST_DAY)
    suite.record("TC-15", "Exact duplicate punch skipped", after == before)

    # TC-20: Multiple sessions same day for PIN 1 (before batch cleanup)
    pin1_sessions = conn.execute(
        """SELECT COUNT(*) FROM attendance
           WHERE user_id=? AND date=? AND source='biometric' AND deleted_at IS NULL""",
        (mapped_uid, TEST_DAY),
    ).fetchone()[0]
    suite.record(
        "TC-20",
        "Multiple attendance sessions same day allowed",
        pin1_sessions >= 2,
        f"sessions={pin1_sessions}",
    )

    # TC-16: Out-of-order batch processed chronologically
    cleanup_test_day(conn)
    batch = [
        attlog_line("2", f"{TEST_DAY} 14:00:00", 0, 0),  # Guru check-in
        attlog_line("2", f"{TEST_DAY} 14:30:00", 0, 0),  # check-out
        attlog_line("2", f"{TEST_DAY} 13:00:00", 0, 0),  # earlier — should process first
    ]
    send_attlog(batch)
    guru_rows = get_punches(conn, "2", TEST_DAY)
    guru_map = conn.execute(
        "SELECT user_id FROM biometric_user_map WHERE device_pin='2' AND device_serial=?", (SN,)
    ).fetchone()
    if not guru_map:
        suite.record("TC-16", "Out-of-order batch: 13:00 in, 14:00 out, 14:30 in", False, "no PIN 2 mapping")
        suite.record("TC-17", "After batch, Guru has open session from last check-in", False, "no PIN 2 mapping")
    else:
        guru_uid = guru_map[0]
        types = [r["punch_type"] for r in guru_rows]
        suite.record(
            "TC-16",
            "Out-of-order batch: 13:00 in, 14:00 out, 14:30 in",
            len(guru_rows) == 3 and types == [0, 1, 0],
            f"types={types}",
        )
        guru_open = open_session(conn, guru_uid)
        ci_ok = False
        if guru_open is not None and guru_open["clock_in"] is not None:
            ci = guru_open["clock_in"]
            ci_ok = str(ci).startswith("14:30") or (
                hasattr(ci, "hour") and ci.hour == 14 and ci.minute == 30
            )
        suite.record(
            "TC-17",
            "After batch, Guru has open session from last check-in",
            ci_ok,
            f"clock_in={guru_open['clock_in'] if guru_open else None}",
        )

    # TC-18: API returns test punches for org
    code, raw = http("GET", f"{API}/api/admin/biometric/punches", headers=auth)
    api_punches = json.loads(raw).get("data", [])
    test_in_api = [p for p in api_punches if p.get("punch_time", "").startswith(TEST_DAY)]
    suite.record(
        "TC-18",
        "API punch list includes test-day records",
        len(test_in_api) >= 3,
        f"test_day_count={len(test_in_api)}",
    )

    # TC-19: punches processed flag for mapped
    unprocessed = conn.execute(
        """SELECT COUNT(*) FROM biometric_punches
           WHERE punch_time LIKE ? AND user_id IS NOT NULL AND is_processed=0""",
        (TEST_DAY + "%",),
    ).fetchone()[0]
    suite.record("TC-19", "Mapped punches marked processed", unprocessed == 0, f"unprocessed={unprocessed}")

    # TC-21: Unauthorized punch API
    code, _ = http("GET", f"{API}/api/admin/biometric/punches")
    suite.record("TC-21", "Punch API rejects unauthenticated", code == 401, f"HTTP {code}")

    # TC-22: Invalid mapping rejected
    code, body = http(
        "POST",
        f"{API}/api/admin/biometric/mapping",
        {"device_serial": "FAKE_SN", "device_pin": "1", "user_id": 1},
        headers=auth,
    )
    suite.record("TC-22", "Invalid device mapping rejected", code == 400, f"HTTP {code}")

    conn.close()
    print(f"\nTest data uses day {TEST_DAY} (left in DB for manual UI verification).")
    print("Use date filter on Punch Log to review, or re-run cleanup to remove.")
    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
