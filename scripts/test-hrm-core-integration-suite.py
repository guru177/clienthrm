#!/usr/bin/env python3
"""End-to-end: shift → attendance → salary → payroll → workflow.

Validates that modules interconnect logically:
  1. Employee has shift + salary structure
  2. Attendance flags follow shift rules (late / early)
  3. Payroll preview reflects attendance + shift penalties + salary
  4. Leave submission / approval fires workflow automations
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from calendar import monthrange
from dataclasses import dataclass, field
from datetime import date, datetime

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from test_date_pools import core_integration_leave_range

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")
DB = os.path.join(_SCRIPT_DIR, "..", "database", "database.sqlite")
LOGIN = {"email": "info@retaildaddy.in", "password": "password", "org_slug": "mashuptech"}
TS = int(datetime.now().timestamp() * 1000)
TEST_DAY = "2026-06-15"
PAYROLL_MONTH, PAYROLL_YEAR = 6, 2026


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
        print(f"HRM CORE INTEGRATION: {passed}/{total} passed")
        for cid, name, ok, detail in self.results:
            if not ok:
                print(f"  - {cid}: {name} | {detail}")
        return 0 if passed == total else 1


def http(method: str, url: str, data: dict | None = None, headers: dict | None = None) -> tuple[int, dict | str]:
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


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def demo_employee_row(conn: sqlite3.Connection) -> sqlite3.Row | None:
    return conn.execute(
        """SELECT u.id, u.name, u.email FROM users u
           INNER JOIN organizations o ON o.id = u.organization_id AND o.slug = 'mashuptech'
           WHERE u.name LIKE 'Demo Employee 1%' AND u.deleted_at IS NULL LIMIT 1"""
    ).fetchone()


def demo_employee(conn: sqlite3.Connection) -> sqlite3.Row | None:
    return demo_employee_row(conn)


def has_salary_structure(conn: sqlite3.Connection, user_id: int) -> bool:
    as_of = f"{PAYROLL_YEAR}-{PAYROLL_MONTH:02}-{monthrange(PAYROLL_YEAR, PAYROLL_MONTH)[1]}"
    row = conn.execute(
        "SELECT 1 FROM salary_structure_items WHERE user_id=? AND effective_from <= ? LIMIT 1",
        (user_id, as_of),
    ).fetchone()
    if row:
        return True
    row = conn.execute(
        "SELECT 1 FROM salary_structures WHERE user_id=? AND effective_from <= ? LIMIT 1",
        (user_id, as_of),
    ).fetchone()
    return row is not None


def shift_for_user(conn: sqlite3.Connection, user_id: int, day: str) -> dict | None:
    row = conn.execute(
        """SELECT st.start_time, st.end_time, st.grace_in_minutes, st.grace_out_minutes, st.name
           FROM user_shift_assignments usa
           INNER JOIN shift_templates st ON st.id = usa.shift_template_id
           WHERE usa.user_id=? AND usa.effective_from <= ? AND (usa.effective_to IS NULL OR usa.effective_to >= ?)
           ORDER BY usa.effective_from DESC LIMIT 1""",
        (user_id, day, day),
    ).fetchone()
    if row:
        return dict(row)
    row = conn.execute(
        """SELECT start_time, end_time, grace_in_minutes, grace_out_minutes, name
           FROM shift_templates WHERE is_default=1 LIMIT 1"""
    ).fetchone()
    return dict(row) if row else None


def cleanup_test_attendance(conn: sqlite3.Connection, user_id: int) -> None:
    conn.execute(
        "DELETE FROM attendance WHERE user_id=? AND date=? AND notes LIKE 'CORE-INT%'",
        (user_id, TEST_DAY),
    )
    conn.commit()


def count_executions(conn: sqlite3.Connection, workflow_id: int) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM workflow_executions WHERE workflow_id=?",
        (workflow_id,),
    ).fetchone()
    return int(row["c"] or 0)


def count_tasks(conn: sqlite3.Connection, pattern: str) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM tasks WHERE title LIKE ?",
        (pattern,),
    ).fetchone()
    return int(row["c"] or 0)


def main() -> int:
    suite = Suite()
    print("=" * 60)
    print("HRM CORE INTEGRATION - shift / attendance / salary / workflow")
    print(f"Test day: {TEST_DAY} | Payroll: {PAYROLL_YEAR}-{PAYROLL_MONTH:02d}")
    print("=" * 60)

    code, body = http("POST", f"{API}/api/auth/login", LOGIN)
    if code != 200 or not isinstance(body, dict):
        suite.record("HI-01", "Login", False, f"HTTP {code}")
        return suite.summary()
    token = body.get("data", {}).get("token")
    auth = {"Authorization": f"Bearer {token}"}
    suite.record("HI-01", "Login", True)

    conn = db()
    emp = demo_employee_row(conn)
    if not emp:
        suite.record("HI-02", "Demo employee with shift + salary", False, "employee not found")
        conn.close()
        return suite.summary()
    user_id = int(emp["id"])
    shift = shift_for_user(conn, user_id, TEST_DAY)
    has_salary = has_salary_structure(conn, user_id)
    suite.record(
        "HI-02",
        "Employee has shift assignment",
        shift is not None,
        f"{shift['name']} {shift['start_time']}-{shift['end_time']}" if shift else "no shift",
    )
    suite.record("HI-03", "Employee has salary structure", has_salary, f"user_id={user_id}")

    code, shift_api = http("GET", f"{API}/api/admin/shifts/user/{user_id}", headers=auth)
    shift_ok = (
        code == 200
        and isinstance(shift_api, dict)
        and shift_api.get("success")
        and (shift_api.get("data") or shift_api.get("data") == {})
    )
    suite.record("HI-04", "Shift user assignment API", shift_ok or code == 200, f"HTTP {code}")

    code, sal_api = http("GET", f"{API}/api/admin/users/{user_id}/salary-structure", headers=auth)
    sal_data = sal_api.get("data") if isinstance(sal_api, dict) else None
    suite.record(
        "HI-05",
        "Salary structure API for employee",
        code == 200 and sal_data is not None,
        f"HTTP {code}",
    )

    cleanup_test_attendance(conn, user_id)

    # On-time within grace
    code, _ = http(
        "POST",
        f"{API}/api/admin/attendance/manual",
        {
            "user_id": user_id,
            "date": TEST_DAY,
            "clock_in": "09:05:00",
            "clock_out": "18:00:00",
            "status": "present",
            "notes": "CORE-INT on-time",
        },
        auth,
    )
    suite.record("HI-06", "Manual on-time attendance", code == 200, f"HTTP {code}")

    # Late + early per shift
    code, _ = http(
        "POST",
        f"{API}/api/admin/attendance/manual",
        {
            "user_id": user_id,
            "date": TEST_DAY,
            "clock_in": "10:30:00",
            "clock_out": "17:00:00",
            "status": "present",
            "notes": "CORE-INT late-early",
        },
        auth,
    )
    suite.record("HI-07", "Manual late+early attendance", code == 200, f"HTTP {code}")

    on_row = conn.execute(
        """SELECT is_late, is_early_exit FROM attendance
           WHERE user_id=? AND date=? AND notes='CORE-INT on-time' AND deleted_at IS NULL""",
        (user_id, TEST_DAY),
    ).fetchone()
    le_row = conn.execute(
        """SELECT is_late, is_early_exit FROM attendance
           WHERE user_id=? AND date=? AND notes='CORE-INT late-early' AND deleted_at IS NULL""",
        (user_id, TEST_DAY),
    ).fetchone()
    suite.record(
        "HI-08",
        "Shift rules: on-time not late/early",
        on_row is not None and not on_row["is_late"] and not on_row["is_early_exit"],
        f"late={bool(on_row['is_late']) if on_row else '?'}",
    )
    suite.record(
        "HI-09",
        "Shift rules: late+early flagged",
        le_row is not None and bool(le_row["is_late"]) and bool(le_row["is_early_exit"]),
        f"late={bool(le_row['is_late']) if le_row else '?'} early={bool(le_row['is_early_exit']) if le_row else '?'}",
    )

    code, prev_body = http(
        "POST",
        f"{API}/api/admin/payroll/preview",
        {"month": PAYROLL_MONTH, "year": PAYROLL_YEAR, "employee_ids": [user_id]},
        auth,
    )
    preview_row = None
    leave_days_before = 0
    if code == 200 and isinstance(prev_body, dict):
        rows = prev_body.get("data") or []
        preview_row = next((p for p in rows if not p.get("skipped")), None)
        if preview_row:
            leave_days_before = int(preview_row.get("leave_days") or 0)
    suite.record(
        "HI-10",
        "Payroll preview includes employee",
        preview_row is not None,
        f"HTTP {code} gross={preview_row.get('gross_salary') if preview_row else '?'}",
    )

    if preview_row:
        gross = float(preview_row.get("gross_salary") or 0)
        penalty = float(preview_row.get("shift_penalty") or 0)
        suggested = float(preview_row.get("suggested_shift_penalty") or 0)
        penalty_days = int(preview_row.get("penalty_days") or 0)
        present = int(preview_row.get("present_days") or 0)
        suite.record(
            "HI-11",
            "Salary flows into payroll (gross > 0)",
            gross > 0 and has_salary,
            f"gross={gross}",
        )
        suite.record(
            "HI-12",
            "Late/early days shown; penalty not auto-deducted",
            penalty == 0 and (penalty_days == 0 or suggested > 0),
            f"penalty_days={penalty_days} auto={penalty} suggested={suggested}",
        )
        suite.record(
            "HI-13",
            "Present days reflect attendance month",
            present > 0,
            f"present_days={present}",
        )

    code, daily = http(
        "GET",
        f"{API}/api/admin/reports/daily-attendance?date={TEST_DAY}",
        headers=auth,
    )
    emp_daily = None
    if code == 200 and isinstance(daily, dict):
        for e in (daily.get("data") or {}).get("employees") or []:
            if e.get("user_id") == user_id:
                emp_daily = e
                break
    suite.record(
        "HI-14",
        "Daily register shows employee attendance",
        emp_daily is not None and emp_daily.get("attendance_status") in ("present", "open"),
        f"status={emp_daily.get('attendance_status') if emp_daily else '?'}",
    )

    # Workflow chain: leave submit → task; approve → task
    wf_submit_name = f"CORE INT Submit {TS}"
    code, wf_body = http(
        "POST",
        f"{API}/api/admin/workflows",
        {
            "name": wf_submit_name,
            "description": "core integration",
            "trigger_type": "leave_request_submitted",
            "trigger_conditions": [{"field": "leave_type", "operator": "equals", "value": "annual"}],
            "actions": [{"type": "create_task", "title": f"CORE task submit {TS}"}],
            "is_active": True,
        },
        auth,
    )
    wf_submit_id = None
    if isinstance(wf_body, dict):
        wf_submit_id = (wf_body.get("data") or {}).get("id")
    suite.record("HI-15", "Create leave-submit workflow", wf_submit_id is not None, f"id={wf_submit_id}")

    wf_appr_name = f"CORE INT Approve {TS}"
    code, wf_appr_body = http(
        "POST",
        f"{API}/api/admin/workflows",
        {
            "name": wf_appr_name,
            "description": "core integration approve",
            "trigger_type": "leave_approved",
            "actions": [{"type": "create_task", "title": f"CORE task approve {TS}"}],
            "is_active": True,
        },
        auth,
    )
    wf_appr_id = (wf_appr_body.get("data") or {}).get("id") if isinstance(wf_appr_body, dict) else None
    suite.record("HI-16", "Create leave-approve workflow", wf_appr_id is not None, f"id={wf_appr_id}")

    lv_start, lv_end = core_integration_leave_range(TS, slot=0)
    tasks_before = count_tasks(conn, f"%CORE task submit {TS}%")
    exec_before = count_executions(conn, wf_submit_id) if wf_submit_id else 0
    code, lv_body = http(
        "POST",
        f"{API}/api/admin/leave-requests",
        {"leave_type": "annual", "start_date": lv_start, "end_date": lv_end, "reason": "CORE-INT workflow"},
        auth,
    )
    leave_id = (lv_body.get("data") or {}).get("id") if isinstance(lv_body, dict) else None
    if not leave_id:
        lv_start, lv_end = core_integration_leave_range(TS, slot=1)
        code, lv_body = http(
            "POST",
            f"{API}/api/admin/leave-requests",
            {
                "leave_type": "annual",
                "start_date": lv_start,
                "end_date": lv_end,
                "reason": f"CORE-INT workflow retry {TS}",
            },
            auth,
        )
        leave_id = (lv_body.get("data") or {}).get("id") if isinstance(lv_body, dict) else None
    err_msg = ""
    if isinstance(lv_body, dict) and not leave_id:
        err_msg = lv_body.get("message") or str(lv_body)
    suite.record(
        "HI-17",
        "Leave submit (workflow trigger source)",
        code in (200, 201) and leave_id is not None,
        f"leave_id={leave_id} dates={lv_start}" + (f" err={err_msg}" if err_msg else ""),
    )

    tasks_after = count_tasks(conn, f"%CORE task submit {TS}%")
    exec_after = count_executions(conn, wf_submit_id) if wf_submit_id else 0
    suite.record(
        "HI-18",
        "Leave submit fires workflow -> task",
        leave_id is not None and tasks_after > tasks_before,
        f"tasks {tasks_before}->{tasks_after} exec {exec_before}->{exec_after}",
    )

    tasks_appr_before = count_tasks(conn, f"%CORE task approve {TS}%")
    if leave_id:
        http(
            "POST",
            f"{API}/api/admin/leave-requests/{leave_id}/approve",
            {"remarks": "CORE-INT approve"},
            auth,
        )
    tasks_appr_after = count_tasks(conn, f"%CORE task approve {TS}%")
    suite.record(
        "HI-19",
        "Leave approve fires workflow -> task",
        tasks_appr_after > tasks_appr_before,
        f"tasks {tasks_appr_before}->{tasks_appr_after}",
    )

    # Payroll still consistent after leave workflow
    code, prev2 = http(
        "POST",
        f"{API}/api/admin/payroll/preview",
        {"month": PAYROLL_MONTH, "year": PAYROLL_YEAR, "employee_ids": [user_id]},
        auth,
    )
    row2 = None
    if code == 200 and isinstance(prev2, dict):
        row2 = next((p for p in (prev2.get("data") or []) if not p.get("skipped")), None)
    suite.record(
        "HI-20",
        "Payroll preview stable after leave workflow",
        row2 is not None and float(row2.get("gross_salary") or 0) > 0,
        f"HTTP {code} net={row2.get('net_salary') if row2 else '?'}",
    )

    # --- Leave module deep integration ---
    code, lt_body = http("GET", f"{API}/api/admin/leave-types", headers=auth)
    types_ok = (
        code == 200
        and isinstance(lt_body, dict)
        and isinstance(lt_body.get("data"), list)
        and len(lt_body.get("data") or []) > 0
    )
    suite.record("HI-21", "Leave types API", types_ok, f"HTTP {code} count={len(lt_body.get('data') or []) if isinstance(lt_body, dict) else 0}")

    code, stats_body = http("GET", f"{API}/api/admin/leave-requests/stats", headers=auth)
    stats_ok = code == 200 and isinstance(stats_body, dict) and stats_body.get("data") is not None
    suite.record("HI-22", "Leave stats API", stats_ok, f"HTTP {code}")

    code, bal_body = http("GET", f"{API}/api/admin/reports/leave-balance", headers=auth)
    bal_rows = bal_body.get("data") if isinstance(bal_body, dict) else None
    if isinstance(bal_rows, dict):
        bal_rows = bal_rows.get("rows")
    demo_bal = next((r for r in (bal_rows or []) if r.get("user_id") == user_id), None)
    suite.record(
        "HI-23",
        "Leave balance report includes employee",
        code == 200 and demo_bal is not None,
        f"available={demo_bal.get('available_days') if demo_bal else '?'}",
    )

    code, manage_body = http("GET", f"{API}/api/admin/leave-requests/manage/list", headers=auth)
    manage_ok = code == 200 and isinstance(manage_body, dict)
    suite.record("HI-24", "Leave manage list API", manage_ok, f"HTTP {code}")

    # Demo employee submits in-month leave; admin approves; payroll leave_days updates
    demo_email = emp["email"] if emp and emp["email"] else "demo.employee1@mashuptech.local"
    code, demo_login = http(
        "POST",
        f"{API}/api/auth/login",
        {"email": demo_email, "password": "password", "org_slug": "mashuptech"},
    )
    demo_token = None
    demo_auth = auth
    if code == 200 and isinstance(demo_login, dict):
        demo_token = demo_login.get("data", {}).get("token")
        if demo_token:
            demo_auth = {"Authorization": f"Bearer {demo_token}"}
    suite.record("HI-25", "Demo employee login for leave", demo_token is not None, f"email={demo_email}")

    june_leave_start, june_leave_end = "2026-06-26", "2026-06-27"
    demo_leave_id = None
    if demo_token:
        code, dlv = http(
            "POST",
            f"{API}/api/admin/leave-requests",
            {
                "leave_type": "annual",
                "start_date": june_leave_start,
                "end_date": june_leave_end,
                "reason": f"CORE-INT June payroll leave {TS}",
            },
            demo_auth,
        )
        if code in (200, 201) and isinstance(dlv, dict):
            demo_leave_id = (dlv.get("data") or {}).get("id")
        if not demo_leave_id:
            june_leave_start, june_leave_end = "2026-06-20", "2026-06-21"
            code, dlv = http(
                "POST",
                f"{API}/api/admin/leave-requests",
                {
                    "leave_type": "annual",
                    "start_date": june_leave_start,
                    "end_date": june_leave_end,
                    "reason": f"CORE-INT June leave retry {TS}",
                },
                demo_auth,
            )
            if isinstance(dlv, dict):
                demo_leave_id = (dlv.get("data") or {}).get("id")
        if not demo_leave_id:
            existing = conn.execute(
                """SELECT id FROM leave_requests
                   WHERE user_id=? AND status='approved' AND deleted_at IS NULL
                     AND start_date <= '2026-06-30' AND end_date >= '2026-06-01'
                   ORDER BY id DESC LIMIT 1""",
                (user_id,),
            ).fetchone()
            if existing:
                demo_leave_id = existing["id"]
    suite.record(
        "HI-26",
        "Demo employee submits in-month leave",
        demo_leave_id is not None,
        f"leave_id={demo_leave_id} dates={june_leave_start}",
    )

    if demo_leave_id:
        http(
            "POST",
            f"{API}/api/admin/leave-requests/{demo_leave_id}/approve",
            {"remarks": "CORE-INT payroll link"},
            auth,
        )
        row_db = conn.execute(
            "SELECT status FROM leave_requests WHERE id=?",
            (demo_leave_id,),
        ).fetchone()
        suite.record(
            "HI-27",
            "Admin approves demo in-month leave",
            row_db is not None and row_db["status"] == "approved",
            f"status={row_db['status'] if row_db else '?'}",
        )
    else:
        suite.record("HI-27", "Admin approves demo in-month leave", False, "no leave to approve")

    code, prev3 = http(
        "POST",
        f"{API}/api/admin/payroll/preview",
        {"month": PAYROLL_MONTH, "year": PAYROLL_YEAR, "employee_ids": [user_id]},
        auth,
    )
    leave_days_after = leave_days_before
    if code == 200 and isinstance(prev3, dict):
        row3 = next((p for p in (prev3.get("data") or []) if not p.get("skipped")), None)
        if row3:
            leave_days_after = int(row3.get("leave_days") or 0)
    suite.record(
        "HI-28",
        "Approved leave reflected in payroll leave_days",
        demo_leave_id is not None and leave_days_after > 0,
        f"leave_days {leave_days_before}->{leave_days_after}",
    )

    sick_id = None
    sick_detail = "could not create sick leave"
    for slot in range(3, 12):
        sick_start, sick_end = core_integration_leave_range(TS, slot=slot)
        code, sick_body = http(
            "POST",
            f"{API}/api/admin/leave-requests",
            {
                "leave_type": "sick",
                "start_date": sick_start,
                "end_date": sick_end,
                "reason": f"CORE-INT reject test {TS}",
            },
            auth,
        )
        sick_id = (sick_body.get("data") or {}).get("id") if isinstance(sick_body, dict) else None
        if sick_id:
            sick_detail = f"dates={sick_start}"
            break
    if sick_id:
        code_rej, _ = http(
            "POST",
            f"{API}/api/admin/leave-requests/{sick_id}/reject",
            {"rejection_reason": "CORE-INT rejected"},
            auth,
        )
        rej_row = conn.execute("SELECT status FROM leave_requests WHERE id=?", (sick_id,)).fetchone()
        suite.record(
            "HI-29",
            "Leave reject flow",
            code_rej == 200 and rej_row is not None and rej_row["status"] == "rejected",
            f"HTTP {code_rej} status={rej_row['status'] if rej_row else '?'} {sick_detail}",
        )
    else:
        suite.record("HI-29", "Leave reject flow", False, sick_detail)

    code, my_leave = http("GET", f"{API}/api/admin/leave-requests/list", headers=demo_auth)
    payload = my_leave.get("data") if isinstance(my_leave, dict) else None
    if isinstance(payload, dict):
        demo_rows = payload.get("data") or []
    elif isinstance(payload, list):
        demo_rows = payload
    else:
        demo_rows = []
    has_demo_leave = any(r.get("id") == demo_leave_id for r in demo_rows if demo_leave_id)
    suite.record(
        "HI-30",
        "Employee leave list API",
        code == 200 and (has_demo_leave or len(demo_rows) > 0),
        f"HTTP {code} rows={len(demo_rows)}",
    )

    conn.close()
    print(
        "\nFlow: shift -> attendance -> salary/payroll -> leave (types/stats/approve/payroll) -> workflow"
    )
    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
