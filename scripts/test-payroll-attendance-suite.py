#!/usr/bin/env python3
"""Payroll ↔ attendance integration: in-app clock, biometric punches, LOP math."""

from __future__ import annotations

from test_helpers import db_connect, ensure_today_roster_for_clock_in

import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")
DB = os.path.join(os.path.dirname(__file__), "..", "database", "database.sqlite")
LOGIN = {"email": "info@retaildaddy.in", "password": os.environ.get("HRM_PASSWORD", "Guru!1234"), "org_slug": "mashuptech"}


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
        print(f"PAYROLL+ATTENDANCE RESULTS: {passed}/{total} passed")
        if passed < total:
            for r in self.results:
                if not r.passed:
                    print(f"  - {r.case_id}: {r.name} | {r.detail}")
        return 0 if passed == total else 1


def http(method: str, url: str, data: dict | None = None, headers: dict | None = None) -> tuple[int, str]:
    hdrs = dict(headers or {})
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")


def db() -> sqlite3.Connection:
    conn = db_connect()
    conn.row_factory = sqlite3.Row
    return conn


def payroll_preview_present(
    auth: dict[str, str], user_id: int, month: int, year: int
) -> int:
    code, raw = http(
        "POST",
        f"{API}/api/admin/payroll/preview",
        {"month": month, "year": year, "employee_ids": [user_id]},
        auth,
    )
    if code != 200:
        return -1
    rows = json.loads(raw).get("data") or []
    row = next((p for p in rows if int(p.get("user_id") or 0) == user_id), None)
    if not row:
        return -1
    return int(row.get("present_days") or 0)


def cleanup_pa_suite(conn: sqlite3.Connection) -> None:
    """Remove PA suite test attendance rows from prior runs."""
    conn.execute("DELETE FROM attendance WHERE notes='PA-16 integration test'")
    conn.commit()


def isolate_pa16_day(conn: sqlite3.Connection, user_id: int, mark_date: str) -> None:
    """Ensure only the PA-16 row exists for this user/date (stable PA-18 open/close)."""
    conn.execute(
        """DELETE FROM attendance
           WHERE user_id=? AND date=? AND COALESCE(notes, '') != 'PA-16 integration test'""",
        (user_id, mark_date),
    )
    conn.commit()


def pick_payroll_attendance_date(
    conn: sqlite3.Connection,
    auth: dict[str, str],
    user_id: int,
    month: int,
    year: int,
    today: date,
) -> str | None:
    """Weekday in month where manual completed attendance increases payroll present_days."""
    baseline = payroll_preview_present(auth, user_id, month, year)
    if baseline < 0:
        return None
    start = date(year, month, 1)
    end = today if today.month == month and today.year == year else start.replace(day=28)
    d = end
    while d >= start:
        if d.weekday() >= 5:
            d -= timedelta(days=1)
            continue
        ds = d.isoformat()
        conn.execute(
            "DELETE FROM attendance WHERE user_id=? AND date=?",
            (user_id, ds),
        )
        conn.commit()
        code, _ = http(
            "POST",
            f"{API}/api/admin/attendance/manual",
            {
                "user_id": user_id,
                "date": ds,
                "clock_in": "09:00:00",
                "clock_out": "18:00:00",
                "status": "present",
                "notes": "PA-16 integration test",
            },
            auth,
        )
        if code != 200:
            d -= timedelta(days=1)
            continue
        if payroll_preview_present(auth, user_id, month, year) > baseline:
            return ds
        d -= timedelta(days=1)
    return None


def count_present_days(conn: sqlite3.Connection, user_id: int, month: int, year: int) -> int:
    start = f"{year:04d}-{month:02d}-01"
    end_day = date(year, month, 1)
    if month == 12:
        end = f"{year + 1}-01-01"
    else:
        end = f"{year:04d}-{month + 1:02d}-01"
    row = conn.execute(
        """SELECT COUNT(DISTINCT date) AS c FROM attendance
           WHERE user_id=? AND deleted_at IS NULL AND clock_out IS NOT NULL
             AND date >= ? AND date < ?""",
        (user_id, start, end),
    ).fetchone()
    return int(row["c"] or 0)


def attendance_by_source(conn: sqlite3.Connection, user_id: int, month: int, year: int) -> dict[str, int]:
    start = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end = f"{year + 1}-01-01"
    else:
        end = f"{year:04d}-{month + 1:02d}-01"
    rows = conn.execute(
        """SELECT COALESCE(source, 'unknown') AS src, COUNT(DISTINCT date) AS c
           FROM attendance
           WHERE user_id=? AND deleted_at IS NULL AND clock_out IS NOT NULL
             AND date >= ? AND date < ?
           GROUP BY src""",
        (user_id, start, end),
    ).fetchall()
    return {r["src"]: int(r["c"]) for r in rows}


def main() -> int:
    suite = Suite()
    today = date.today()
    month, year = today.month, today.year
    print("=" * 60)
    print("PAYROLL + ATTENDANCE INTEGRATION SUITE")
    print(f"Period: {year}-{month:02d} | Started: {datetime.now().isoformat(timespec='seconds')}")
    print("=" * 60)

    code, login_body = http("POST", f"{API}/api/auth/login", LOGIN)
    token = None
    if code == 200:
        try:
            token = json.loads(login_body)["data"]["token"]
            suite.record("PA-01", "Tenant login", True)
        except (KeyError, json.JSONDecodeError) as e:
            suite.record("PA-01", "Tenant login", False, str(e))
    else:
        suite.record("PA-01", "Tenant login", False, f"HTTP {code}")
        return suite.summary()

    auth = {"Authorization": f"Bearer {token}"}

    code_me, me_body = http("GET", f"{API}/api/auth/me", headers=auth)
    user_id = 1
    if code_me == 200:
        try:
            user_id = int(json.loads(me_body)["data"]["id"])
        except (KeyError, json.JSONDecodeError, TypeError, ValueError):
            pass
    ensure_today_roster_for_clock_in(auth, user_id)

    # In-app clock cycle
    http("POST", f"{API}/api/admin/attendance/clock-out", {}, auth)
    code, cin = http("POST", f"{API}/api/admin/attendance/clock-in", {"face_verified": False}, auth)
    suite.record("PA-02", "In-app clock-in API", code == 200, f"HTTP {code}")
    code, cout = http("POST", f"{API}/api/admin/attendance/clock-out", {}, auth)
    suite.record("PA-03", "In-app clock-out API", code == 200, f"HTTP {code}")

    code, att_today = http("GET", f"{API}/api/admin/attendance/today", headers=auth)
    if code == 200:
        data = json.loads(att_today)["data"]
        completed = sum(1 for s in data.get("attendances", []) if s.get("clock_out"))
        suite.record("PA-04", "Today attendance sessions listed", True, f"completed={completed}")
    else:
        suite.record("PA-04", "Today attendance sessions listed", False, f"HTTP {code}")

    # Payroll employees
    code, emp_raw = http("GET", f"{API}/api/admin/payroll/employees?month={month}&year={year}", headers=auth)
    if code != 200:
        suite.record("PA-05", "Payroll employees API", False, f"HTTP {code}")
        return suite.summary()
    employees = json.loads(emp_raw).get("data") or []
    suite.record("PA-05", "Payroll employees API", len(employees) > 0, f"count={len(employees)}")

    with_salary = [e for e in employees if e.get("has_salary_structure")]
    suite.record(
        "PA-06",
        "Employees with salary structure",
        len(with_salary) > 0,
        f"{len(with_salary)}/{len(employees)}",
    )

    conn = db()
    cleanup_pa_suite(conn)
    org_id = conn.execute(
        "SELECT id FROM organizations WHERE slug='mashuptech'"
    ).fetchone()[0]

    # Both sources exist in attendance table for org
    src_rows = conn.execute(
        """SELECT COALESCE(a.source, 'unknown') AS src, COUNT(*) AS c
           FROM attendance a
           INNER JOIN users u ON u.id = a.user_id AND u.organization_id=?
           WHERE a.deleted_at IS NULL AND a.clock_out IS NOT NULL
           GROUP BY src""",
        (org_id,),
    ).fetchall()
    src_map = {r["src"]: int(r["c"]) for r in src_rows}
    suite.record(
        "PA-07",
        "Attendance records from in-app + biometric",
        "biometric" in src_map or "manual" in src_map or "app" in src_map,
        f"sources={src_map}",
    )
    suite.record(
        "PA-08",
        "Biometric attendance synced to payroll table",
        src_map.get("biometric", 0) > 0,
        f"biometric_sessions={src_map.get('biometric', 0)}",
    )

    if not with_salary:
        return suite.summary()

    sample = None
    for candidate in with_salary:
        uid_c = int(candidate["id"])
        if sum(attendance_by_source(conn, uid_c, month, year).values()) > 0:
            sample = candidate
            break
    if sample is None:
        sample = with_salary[0]
    uid = int(sample["id"])
    api_present = payroll_preview_present(auth, uid, month, year)
    db_present = count_present_days(conn, uid, month, year)
    # Preview uses working-day logic; DB count is raw distinct completed dates
    variance = abs(api_present - db_present)
    suite.record(
        "PA-09",
        "Present days API vs DB (sample employee)",
        api_present >= 0 and variance <= 3,
        f"api={api_present} db_distinct={db_present} user={sample.get('name')}",
    )

    by_src = attendance_by_source(conn, uid, month, year)
    month_rows = conn.execute(
        """SELECT COUNT(*) AS c FROM attendance a
           JOIN users u ON u.id = a.user_id
           WHERE u.organization_id = ? AND a.deleted_at IS NULL AND a.clock_out IS NOT NULL
             AND EXTRACT(MONTH FROM a.date) = ? AND EXTRACT(YEAR FROM a.date) = ?""",
        (org_id, month, year),
    ).fetchone()[0]
    suite.record(
        "PA-10",
        "Org has completed attendance in payroll month",
        month_rows > 0 or sum(by_src.values()) > 0 or api_present > 0,
        f"month_rows={month_rows} by_source={by_src} present={api_present}",
    )

    # Payroll preview
    ids = [e["id"] for e in with_salary[:5]]
    code, prev_raw = http(
        "POST",
        f"{API}/api/admin/payroll/preview",
        {"month": month, "year": year, "employee_ids": ids},
        auth,
    )
    if code != 200:
        suite.record("PA-11", "Payroll preview API", False, f"HTTP {code}: {prev_raw[:200]}")
        return suite.summary()

    previews = json.loads(prev_raw).get("data") or []
    suite.record("PA-11", "Payroll preview API", len(previews) > 0, f"rows={len(previews)}")

    calc_ok = 0
    calc_fail = 0
    for row in previews:
        if row.get("skipped"):
            continue
        ss = row.get("salary_structure") or {}
        gross = float(row.get("gross_salary") or 0)
        net = float(row.get("net_salary") or 0)
        lop = float(ss.get("lop_deduction") or 0)
        lop_bd = ss.get("lop_breakdown") or {}
        lop_sum = sum(
            float(lop_bd.get(k) or 0)
            for k in ("basic", "hra", "conveyance", "special", "total")
            if k != "total"
        )
        lop_total_bd = float(lop_bd.get("total") or 0)
        lop_match = abs(lop_sum - lop) < 0.05 or abs(lop_total_bd - lop) < 0.05 or lop == 0
        pf = float(ss.get("pf_deduction") or 0)
        esi = float(ss.get("esi_deduction") or 0)
        prof = float(ss.get("prof_tax") or 0)
        adv = float(ss.get("advance_deduction") or 0)
        shift_pen = float(row.get("shift_penalty") or 0)
        total_ded = float(ss.get("total_deductions") or 0)
        ded_sum = lop + pf + esi + prof + adv + shift_pen
        ded_match = abs(ded_sum - total_ded) < 1.0 or total_ded == 0
        net_ok = net <= gross + 0.01
        working = int(row.get("working_days") or 0)
        present = int(row.get("present_days") or 0)
        leave = int(row.get("leave_days") or 0)
        holidays = int(row.get("paid_holidays") or 0)
        lop_days = float(lop_bd.get("days") or 0)
        days_ok = present + leave + holidays + lop_days <= working + holidays + 5

        if lop_match and ded_match and net_ok and days_ok:
            calc_ok += 1
        else:
            calc_fail += 1

    suite.record(
        "PA-12",
        "Payroll preview calculation consistency",
        calc_fail == 0 and calc_ok > 0,
        f"ok={calc_ok} fail={calc_fail}",
    )

    # Reports cross-check
    code, rep_att = http(
        "GET",
        f"{API}/api/admin/reports/attendance-summary?month={month}&year={year}",
        headers=auth,
    )
    suite.record("PA-13", "Attendance summary report", code == 200, f"HTTP {code}")

    code, rep_pay = http(
        "GET",
        f"{API}/api/admin/reports/payroll-register?month={month}&year={year}",
        headers=auth,
    )
    suite.record("PA-14", "Payroll register report", code == 200, f"HTTP {code}")

    code, bio_stats = http("GET", f"{API}/api/admin/biometric/stats", headers=auth)
    if code == 200:
        stats = json.loads(bio_stats).get("data") or {}
        suite.record(
            "PA-15",
            "Biometric stats available",
            True,
            f"punches={stats.get('total_punches')} mapped={stats.get('mapped_users')}",
        )
    else:
        suite.record("PA-15", "Biometric stats available", False, f"HTTP {code}")

    # PA-16: Manual single entry increases completed attendance (payroll present_days)
    payroll_sample = with_salary[0]
    uid = int(payroll_sample["id"])
    conn.execute(
        "UPDATE payslips SET status='draft', generated_at=NULL WHERE user_id=? AND month=? AND year=?",
        (uid, month, year),
    )
    conn.commit()
    before = payroll_preview_present(auth, uid, month, year)
    mark_date = pick_payroll_attendance_date(conn, auth, uid, month, year, today)
    after = payroll_preview_present(auth, uid, month, year)
    manual_ok = mark_date is not None and after > before
    suite.record(
        "PA-16",
        "Manual mark creates completed attendance for payroll",
        manual_ok,
        f"before={before} after={after} date={mark_date or 'none'}",
    )

    # PA-17: Payroll preview runs after biometric sync helper (API smoke)
    code, prev2 = http(
        "POST",
        f"{API}/api/admin/payroll/preview",
        {"month": month, "year": year, "employee_ids": [uid]},
        auth,
    )
    suite.record(
        "PA-17",
        "Payroll preview after attendance sync path",
        code == 200 and json.loads(prev2).get("success") is not False,
        f"HTTP {code}",
    )

    # PA-18: Generate refreshes draft from latest attendance before lock
    previews = json.loads(prev2).get("data") or [] if code == 200 else []
    draft = next((p for p in previews if not p.get("skipped") and p.get("id")), None)
    if not mark_date:
        suite.record(
            "PA-18",
            "Generate locks payslip after refresh from attendance",
            False,
            "skipped — PA-16 found no payroll-affecting date",
        )
    elif draft:
        payslip_id = int(draft["id"])
        conn.execute(
            "UPDATE payslips SET status='draft', generated_at=NULL WHERE id=?",
            (payslip_id,),
        )
        conn.commit()
        isolate_pa16_day(conn, uid, mark_date)
        conn.execute(
            """UPDATE attendance SET clock_out=NULL, duration_minutes=NULL
               WHERE user_id=? AND date=? AND notes='PA-16 integration test'""",
            (uid, mark_date),
        )
        conn.commit()
        code, prev3 = http(
            "POST",
            f"{API}/api/admin/payroll/preview",
            {"month": month, "year": year, "employee_ids": [uid]},
            auth,
        )
        preview_after_open = json.loads(prev3).get("data") or [] if code == 200 else []
        row_open = next((p for p in preview_after_open if int(p.get("id") or 0) == payslip_id), None)
        open_present = int(row_open.get("present_days") or 0) if row_open else -1
        conn.execute(
            """UPDATE attendance SET clock_out='18:00:00', duration_minutes=540
               WHERE user_id=? AND date=? AND notes='PA-16 integration test'""",
            (uid, mark_date),
        )
        conn.commit()
        code, prev4 = http(
            "POST",
            f"{API}/api/admin/payroll/preview",
            {"month": month, "year": year, "employee_ids": [uid]},
            auth,
        )
        preview_after_close = json.loads(prev4).get("data") or [] if code == 200 else []
        row_closed = next(
            (p for p in preview_after_close if int(p.get("id") or 0) == payslip_id),
            None,
        )
        expected_present = int(row_closed.get("present_days") or 0) if row_closed else -1
        code, gen_raw = http(
            "POST",
            f"{API}/api/admin/payroll/generate",
            {"month": month, "year": year, "payslip_ids": [payslip_id]},
            auth,
        )
        gen_payload = json.loads(gen_raw) if code == 200 else {}
        gen_data = gen_payload.get("data") or {}
        gen_results = gen_data.get("results") or []
        gen_row = next((r for r in gen_results if int(r.get("id") or 0) == payslip_id), None)
        gen_status = (gen_row or {}).get("status")
        locked = conn.execute(
            "SELECT present_days, status FROM payslips WHERE id=?",
            (payslip_id,),
        ).fetchone()
        refresh_ok = (
            code == 200
            and gen_payload.get("success") is not False
            and gen_status == "generated"
            and locked is not None
            and locked["status"] == "generated"
            and int(locked["present_days"]) == expected_present
            and open_present < expected_present
        )
        suite.record(
            "PA-18",
            "Generate locks payslip after refresh from attendance",
            refresh_ok,
            f"generate HTTP {code} status={gen_status} open_present={open_present} "
            f"final_present={locked['present_days'] if locked else '?'} expected={expected_present}",
        )
        conn.execute(
            "UPDATE payslips SET status='draft', generated_at=NULL WHERE id=? AND status='generated'",
            (payslip_id,),
        )
        conn.commit()
    else:
        suite.record("PA-18", "Generate locks payslip after refresh from attendance", False, "no draft payslip from preview")

    cleanup_pa_suite(conn)
    conn.close()
    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
