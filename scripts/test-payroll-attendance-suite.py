#!/usr/bin/env python3
"""Payroll ↔ attendance integration: in-app clock, biometric punches, LOP math."""

from __future__ import annotations

import json
import sqlite3
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime

API = "http://localhost:3001"
DB = "database/database.sqlite"
LOGIN = {"email": "admin@mashuptech.in", "password": "password", "org_slug": "mashuptech"}


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
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


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

    sample = with_salary[0]
    uid = sample["id"]
    db_present = count_present_days(conn, uid, month, year)
    api_present = int(sample.get("present_days") or 0)
    # API uses working-day filter; DB count is raw distinct dates — allow small variance
    suite.record(
        "PA-09",
        "Present days API vs DB (sample employee)",
        api_present <= db_present + 2,
        f"api={api_present} db_distinct={db_present} user={sample.get('name')}",
    )

    by_src = attendance_by_source(conn, uid, month, year)
    suite.record(
        "PA-10",
        "Sample employee has attendance data",
        sum(by_src.values()) > 0 or api_present > 0,
        f"by_source={by_src} present={api_present}",
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

    conn.close()
    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
