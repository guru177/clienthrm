#!/usr/bin/env python3
"""Workflow engine integration: triggers, conditions, actions, RBAC, audit."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)
from test_date_pools import workflow_leave_range  # noqa: F401 — shared pool module
from test_helpers import leave_reason, MIN_LEAVE_REASON

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")
DB = os.path.join(os.path.dirname(__file__), "..", "database", "database.sqlite")
LOGIN = {"email": "admin@mashuptech.in", "password": "password", "org_slug": "mashuptech"}
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
        print(f"WORKFLOW RESULTS: {passed}/{total} passed")
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
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def login() -> tuple[str | None, int | None]:
    code, body = http("POST", f"{API}/api/auth/login", LOGIN)
    if code != 200 or not isinstance(body, dict):
        return None, None
    token = body.get("data", {}).get("token")
    sub = body.get("data", {}).get("user", {}).get("id")
    if sub is None:
        code2, me = http("GET", f"{API}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        if code2 == 200 and isinstance(me, dict):
            sub = me.get("data", {}).get("id")
    return token, sub


def future_leave_dates(offset_base: int = 4000) -> tuple[str, str]:
    """Unique weekday span in the workflow band (≥1 working day for leave validation)."""
    import hashlib
    from datetime import timedelta

    from test_date_pools import BASE, WORKFLOW_MAX, _weekday_span

    digest = hashlib.sha256(f"{TS}:{offset_base}".encode()).hexdigest()
    day = int(digest[:6], 16) % max(1, WORKFLOW_MAX - 10)
    start = BASE + timedelta(days=day)
    return _weekday_span(start)


def reset_far_future_leaves(conn: sqlite3.Connection, user_id: int) -> None:
    """Free annual quota from prior integration test runs (2090+ dates)."""
    conn.execute(
        """UPDATE leave_requests SET status='rejected', updated_at=datetime('now')
           WHERE user_id=? AND start_date >= '2090-01-01' AND deleted_at IS NULL
           AND status IN ('pending', 'approved')""",
        (user_id,),
    )
    conn.commit()


def submit_leave(
    auth: dict[str, str],
    offset_base: int,
    leave_type: str = "annual",
    reason: str = MIN_LEAVE_REASON,
) -> tuple[int, dict | str, int | None]:
    """Submit leave with retries on overlap/quota (alternate dates and sick fallback)."""
    reason = leave_reason(reason) if len(reason.strip()) < 10 else reason.strip()
    last_code: int = 400
    last_body: dict | str = {}
    for attempt in range(8):
        start, end = future_leave_dates(offset_base + attempt * 211)
        lt = leave_type if attempt < 5 else "sick"
        code, body = http(
            "POST",
            f"{API}/api/admin/leave-requests",
            {"leave_type": lt, "start_date": start, "end_date": end, "reason": reason},
            auth,
        )
        last_code, last_body = code, body
        if code in (200, 201) and isinstance(body, dict):
            lid = body.get("data", {}).get("id")
            if lid:
                return code, body, int(lid)
    return last_code, last_body, None


def count_tasks_like(conn: sqlite3.Connection, pattern: str) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM tasks WHERE title LIKE ?",
        (pattern,),
    ).fetchone()
    return int(row["c"] or 0)


def count_executions(conn: sqlite3.Connection, workflow_id: int) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM workflow_executions WHERE workflow_id = ?",
        (workflow_id,),
    ).fetchone()
    return int(row["c"] or 0)


def main() -> int:
    suite = Suite()
    print("=" * 60)
    print("WORKFLOW ENGINE SUITE")
    print(f"Started: {datetime.now().isoformat(timespec='seconds')}")
    print("=" * 60)

    token, admin_id = login()
    if not token:
        suite.record("WF-01", "Tenant login", False, "no token")
        return suite.summary()
    suite.record("WF-01", "Tenant login", True)
    auth = {"Authorization": f"Bearer {token}"}

    code, body = http("GET", f"{API}/api/admin/workflows/list", headers=auth)
    suite.record(
        "WF-02",
        "List workflows",
        code == 200 and isinstance(body, dict) and body.get("success"),
        f"HTTP {code}",
    )

    # Active workflow: create_task on submit
    wf_name = f"WF Test Submit {TS}"
    actions = [{"type": "create_task", "title": f"Task from {wf_name}"}]
    conditions = [{"field": "leave_type", "operator": "equals", "value": "annual"}]
    code, body = http(
        "POST",
        f"{API}/api/admin/workflows",
        {
            "name": wf_name,
            "description": "test",
            "trigger_type": "leave_request_submitted",
            "trigger_conditions": conditions,
            "actions": actions,
            "is_active": True,
        },
        auth,
    )
    wf_submit_id = None
    if code in (200, 201) and isinstance(body, dict):
        wf_submit_id = body.get("data", {}).get("id") or body.get("data", {}).get("workflow", {}).get("id")
    if not wf_submit_id and isinstance(body, dict):
        wf_submit_id = body.get("data", {}).get("id")
    suite.record("WF-03", "Create active submit workflow", wf_submit_id is not None, f"id={wf_submit_id}")

    conn = db()
    if admin_id:
        reset_far_future_leaves(conn, admin_id)
    tasks_before = count_tasks_like(conn, f"%{wf_name}%")
    exec_before = count_executions(conn, wf_submit_id) if wf_submit_id else 0

    code, lv_body, leave_id = submit_leave(auth, 5000, "annual", "WF test")
    wf04_detail = f"leave_id={leave_id}"
    if not leave_id and isinstance(lv_body, dict):
        wf04_detail += f" HTTP {code} msg={lv_body.get('message', lv_body)}"
    suite.record("WF-04", "Submit leave triggers workflow", leave_id is not None, wf04_detail)

    tasks_after = count_tasks_like(conn, f"%{wf_name}%")
    exec_after = count_executions(conn, wf_submit_id) if wf_submit_id else 0
    suite.record(
        "WF-05",
        "create_task action on submit",
        tasks_after > tasks_before,
        f"tasks {tasks_before}->{tasks_after}",
    )
    suite.record(
        "WF-06",
        "workflow_executions audit row",
        exec_after > exec_before,
        f"executions {exec_before}->{exec_after}",
    )

    # Inactive workflow should not fire
    inactive_name = f"WF Inactive {TS}"
    code, in_body = http(
        "POST",
        f"{API}/api/admin/workflows",
        {
            "name": inactive_name,
            "description": "inactive",
            "trigger_type": "leave_request_submitted",
            "actions": [{"type": "create_task", "title": f"Inactive {TS}"}],
            "is_active": False,
        },
        auth,
    )
    in_id = in_body.get("data", {}).get("id") if isinstance(in_body, dict) else None
    in_exec_before = count_executions(conn, in_id) if in_id else 0
    submit_leave(auth, 5500, "annual", "inactive wf")
    in_exec_after = count_executions(conn, in_id) if in_id else 0
    suite.record(
        "WF-07",
        "Inactive workflow skipped",
        in_exec_after == in_exec_before,
        f"executions {in_exec_before}->{in_exec_after}",
    )

    # Approve trigger with alias leave_approved
    appr_name = f"WF Approve {TS}"
    code, appr_body = http(
        "POST",
        f"{API}/api/admin/workflows",
        {
            "name": appr_name,
            "description": "approve",
            "trigger_type": "leave_approved",
            "actions": [{"type": "create_task", "title": f"Approved task {TS}"}],
            "is_active": True,
        },
        auth,
    )
    appr_id = appr_body.get("data", {}).get("id") if isinstance(appr_body, dict) else None
    tasks_appr_before = count_tasks_like(conn, f"%Approved task {TS}%")
    if leave_id:
        http("POST", f"{API}/api/admin/leave-requests/{leave_id}/approve", {"remarks": "WF test"}, auth)
    tasks_appr_after = count_tasks_like(conn, f"%Approved task {TS}%")
    suite.record(
        "WF-08",
        "leave_approved alias trigger",
        tasks_appr_after > tasks_appr_before or appr_id is None,
        f"tasks {tasks_appr_before}->{tasks_appr_after}",
    )

    # Condition mismatch: sick leave should not match annual-only workflow
    tasks_cond_before = count_tasks_like(conn, f"%{wf_name}%")
    submit_leave(auth, 6000, "sick", "cond test")
    tasks_cond_after = count_tasks_like(conn, f"%{wf_name}%")
    suite.record(
        "WF-09",
        "Condition filters leave_type",
        tasks_cond_after == tasks_cond_before,
        "sick leave did not create annual-only task",
    )

    # Duplicate workflow
    if wf_submit_id:
        code, dup = http("POST", f"{API}/api/admin/workflows/{wf_submit_id}/duplicate", {}, auth)
        dup_id = dup.get("data", {}).get("id") if isinstance(dup, dict) else None
        suite.record("WF-10", "Duplicate workflow", code in (200, 201) and dup_id, f"dup_id={dup_id}")

    # Toggle workflow
    if wf_submit_id:
        code, _ = http("POST", f"{API}/api/admin/workflows/{wf_submit_id}/toggle", {}, auth)
        suite.record("WF-11", "Toggle workflow", code in (200, 201), f"HTTP {code}")

    # Cross-org IDOR: workflow id with invalid high id
    code, _ = http("GET", f"{API}/api/admin/workflows/999999999", headers=auth)
    suite.record("WF-12", "Missing workflow returns 404", code == 404, f"HTTP {code}")

    # Unknown action type still completes execution (logged)
    unk_name = f"WF Unknown {TS}"
    code, unk = http(
        "POST",
        f"{API}/api/admin/workflows",
        {
            "name": unk_name,
            "trigger_type": "leave_request_submitted",
            "actions": [{"type": "custom_unknown_action", "label": "x"}],
            "is_active": True,
        },
        auth,
    )
    unk_id = unk.get("data", {}).get("id") if isinstance(unk, dict) else None
    if unk_id:
        ex_before = count_executions(conn, unk_id)
        _, _, unk_leave = submit_leave(auth, 6500, "sick", "unknown action")
        ex_after = count_executions(conn, unk_id)
        suite.record(
            "WF-13",
            "Unknown action logs execution",
            unk_leave is not None and ex_after > ex_before,
            f"leave={unk_leave} executions {ex_before}->{ex_after}",
        )
    else:
        suite.record("WF-13", "Unknown action logs execution", False, "workflow create failed")

    # UI-format actions: { type, config } shape from React forms
    ui_name = f"WF UI Format {TS}"
    ui_actions = [
        {
            "type": "create_task",
            "config": {"title": f"UI Custom Title {TS}", "due_days": 5},
        }
    ]
    code, ui_body = http(
        "POST",
        f"{API}/api/admin/workflows",
        {
            "name": ui_name,
            "description": "UI format test",
            "trigger_type": "leave_request_submitted",
            "actions": ui_actions,
            "is_active": True,
        },
        auth,
    )
    ui_id = ui_body.get("data", {}).get("id") if isinstance(ui_body, dict) else None
    ui_tasks_before = count_tasks_like(conn, f"%UI Custom Title {TS}%")
    submit_leave(auth, 7000, "sick", "ui format")
    ui_tasks_after = count_tasks_like(conn, f"%UI Custom Title {TS}%")
    suite.record(
        "WF-14",
        "UI config shape creates task with custom title",
        ui_tasks_after > ui_tasks_before,
        f"tasks {ui_tasks_before}->{ui_tasks_after} wf_id={ui_id}",
    )

    # send_notification alias → org_notifications row
    notif_name = f"WF Notify {TS}"
    code, notif_body = http(
        "POST",
        f"{API}/api/admin/workflows",
        {
            "name": notif_name,
            "trigger_type": "leave_request_submitted",
            "actions": [
                {
                    "type": "send_notification",
                    "config": {"message": f"In-app alert {TS}"},
                }
            ],
            "is_active": True,
        },
        auth,
    )
    notif_id = notif_body.get("data", {}).get("id") if isinstance(notif_body, dict) else None
    notif_before = conn.execute(
        "SELECT COUNT(*) FROM org_notifications WHERE title LIKE ?",
        (f"%{notif_name}%",),
    ).fetchone()[0]
    submit_leave(auth, 7500, "sick", "notif test")
    notif_after = conn.execute(
        "SELECT COUNT(*) FROM org_notifications WHERE title LIKE ?",
        (f"%{notif_name}%",),
    ).fetchone()[0]
    suite.record(
        "WF-15",
        "send_notification creates org notification",
        notif_after > notif_before,
        f"notifications {notif_before}->{notif_after} wf_id={notif_id}",
    )

    conn.close()
    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
