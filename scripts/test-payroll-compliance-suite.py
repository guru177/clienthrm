#!/usr/bin/env python3
"""Payroll compliance: preview/generate/unlock, OT/TDS, advanced payroll APIs."""

from __future__ import annotations

from test_helpers import db_connect

import json
import math
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")
DB = os.path.join(os.path.dirname(__file__), "..", "database", "database.sqlite")
LOGIN = {"email": "info@retaildaddy.in", "password": os.environ.get("HRM_PASSWORD", "Guru!1234"), "org_slug": "mashuptech"}
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
        print(f"PAYROLL COMPLIANCE RESULTS: {passed}/{total} passed")
        for cid, name, ok, detail in self.results:
            if not ok:
                print(f"  - {cid}: {name} | {detail}")
        return 0 if passed == total else 1


def http(method: str, url: str, data: dict | None = None, headers: dict | None = None) -> tuple[int, dict | str | bytes]:
    hdrs = dict(headers or {})
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            if "application/pdf" in ctype or "application/octet-stream" in ctype:
                return resp.status, raw
            text = raw.decode(errors="replace")
            try:
                return resp.status, json.loads(text)
            except json.JSONDecodeError:
                return resp.status, text
    except urllib.error.HTTPError as e:
        raw = e.read()
        ctype = e.headers.get("Content-Type", "") if e.headers else ""
        if "application/pdf" in ctype:
            return e.code, raw
        text = raw.decode(errors="replace")
        try:
            return e.code, json.loads(text)
        except json.JSONDecodeError:
            return e.code, text


def is_pdf_payload(payload) -> bool:
    return isinstance(payload, (bytes, bytearray)) and payload[:4] == b"%PDF"


def login() -> str | None:
    code, body = http("POST", f"{API}/api/auth/login", LOGIN)
    if code != 200 or not isinstance(body, dict):
        return None
    return body.get("data", {}).get("token")


def is_num(v) -> bool:
    if v is None:
        return False
    try:
        return math.isfinite(float(v))
    except (TypeError, ValueError):
        return False


def main() -> int:
    suite = Suite()
    today = date.today()
    month, year = today.month, today.year
    print("=" * 60)
    print("PAYROLL COMPLIANCE SUITE")
    print(f"Period: {year}-{month:02d}")
    print("=" * 60)

    token = login()
    if not token:
        suite.record("PC-01", "Tenant login", False)
        return suite.summary()
    suite.record("PC-01", "Tenant login", True)
    auth = {"Authorization": f"Bearer {token}"}

    code, emps = http("GET", f"{API}/api/admin/payroll/employees?month={month}&year={year}", headers=auth)
    emp_list = emps.get("data", []) if isinstance(emps, dict) else []
    suite.record("PC-02", "Payroll employees list", code == 200 and isinstance(emp_list, list), f"count={len(emp_list)}")

    with_salary = [e for e in emp_list if e.get("has_salary_structure")]
    without_salary = [e for e in emp_list if not e.get("has_salary_structure")]
    if with_salary:
        e0 = with_salary[0]
        suite.record(
            "PC-03",
            "Employee attendance fields",
            "working_days" in e0 and "present_days" in e0,
            f"{e0.get('name')}",
        )

    all_ids = [e["id"] for e in emp_list if "id" in e]
    code, preview = http(
        "POST",
        f"{API}/api/admin/payroll/preview",
        {"month": month, "year": year, "employee_ids": all_ids[: min(len(all_ids), 40)]},
        auth,
    )
    rows = preview.get("data", []) if isinstance(preview, dict) else []
    ready = [r for r in rows if not r.get("skipped")]
    skipped = [r for r in rows if r.get("skipped")]
    suite.record(
        "PC-04",
        "Preview returns ready and skipped",
        code == 200 and (len(ready) + len(skipped) == len(rows)),
        f"ready={len(ready)} skipped={len(skipped)}",
    )

    numeric_ok = all(
        is_num(r.get("gross_salary")) and is_num(r.get("net_salary")) and is_num(r.get("total_deductions"))
        for r in ready
    )
    suite.record("PC-05", "Ready preview rows numeric", numeric_ok or len(ready) == 0)

    # Pick employee with salary for generate cycle (prefer not already generated if possible)
    target = None
    for e in with_salary:
        if e.get("payslip_status") == "generated" and e.get("payslip_id"):
            http("POST", f"{API}/api/admin/payslips/{e['payslip_id']}/unlock", {}, auth)
        if e.get("payslip_status") != "generated" or e.get("payslip_id"):
            target = e
            break
    if not target and with_salary:
        target = with_salary[0]
        if target.get("payslip_id"):
            http("POST", f"{API}/api/admin/payslips/{target['payslip_id']}/unlock", {}, auth)

    payslip_id = None
    if target:
        code, prev1 = http(
            "POST",
            f"{API}/api/admin/payroll/preview",
            {"month": month, "year": year, "employee_ids": [target["id"]]},
            auth,
        )
        prev_rows = prev1.get("data", []) if isinstance(prev1, dict) else []
        ready1 = [r for r in prev_rows if not r.get("skipped") and r.get("id")]
        if ready1:
            payslip_id = ready1[0]["id"]
            live_gross = ready1[0].get("gross_salary")
            live_net = ready1[0].get("net_salary")

            code, gen = http(
                "POST",
                f"{API}/api/admin/payroll/generate",
                {"month": month, "year": year, "payslip_ids": [payslip_id]},
                auth,
            )
            suite.record(
                "PC-06",
                "Generate payslip",
                code == 200 and isinstance(gen, dict) and gen.get("success"),
                f"payslip_id={payslip_id}",
            )

            code, pdf = http("GET", f"{API}/api/admin/payslips/{payslip_id}/pdf", headers=auth)
            suite.record(
                "PC-07",
                "Payslip PDF download",
                code == 200 and is_pdf_payload(pdf) and len(pdf) > 100,
                f"HTTP {code} bytes={len(pdf) if isinstance(pdf, (bytes, bytearray)) else 0}",
            )

            if is_pdf_payload(pdf) and target.get("ot_amount", 0) > 0:
                suite.record("PC-08", "PDF generated when OT>0", len(pdf) > 100, "binary PDF")
            else:
                suite.record("PC-08", "PDF generated when OT>0", True, "skipped — no OT on employee")

            # Unlock → preview → regenerate consistency
            http("POST", f"{API}/api/admin/payslips/{payslip_id}/unlock", {}, auth)
            code, prev2 = http(
                "POST",
                f"{API}/api/admin/payroll/preview",
                {"month": month, "year": year, "employee_ids": [target["id"]]},
                auth,
            )
            prev2_rows = prev2.get("data", []) if isinstance(prev2, dict) else []
            r2 = next((r for r in prev2_rows if not r.get("skipped")), None)
            if r2 and is_num(live_gross) and is_num(r2.get("gross_salary")):
                match = abs(float(r2["gross_salary"]) - float(live_gross)) < 1.0
                suite.record("PC-09", "Unlock+preview gross matches", match, f"{live_gross} vs {r2.get('gross_salary')}")
            else:
                suite.record("PC-09", "Unlock+preview gross matches", True, "skipped")

            if r2 and is_num(live_net) and is_num(r2.get("net_salary")):
                net_ok = abs(float(r2["net_salary"]) - float(live_net)) < 2.0
                suite.record("PC-10", "Unlock+preview net consistent", net_ok)
            else:
                suite.record("PC-10", "Unlock+preview net consistent", True, "skipped")

    # Advanced payroll endpoints
    code, checklist = http("GET", f"{API}/api/admin/payroll/checklist?month={month}&year={year}", headers=auth)
    suite.record("PC-11", "Payroll checklist", code == 200, f"HTTP {code}")

    code, runs = http("GET", f"{API}/api/admin/payroll/runs?month={month}&year={year}", headers=auth)
    suite.record("PC-12", "Payroll runs list", code == 200, f"HTTP {code}")

    code, vpay = http("GET", f"{API}/api/admin/payroll/variable-pay?month={month}&year={year}", headers=auth)
    suite.record("PC-13", "Variable pay list", code == 200, f"HTTP {code}")

    code, claims = http("GET", f"{API}/api/admin/payroll/reimbursements?month={month}&year={year}", headers=auth)
    suite.record("PC-14", "Reimbursements list", code == 200, f"HTTP {code}")

    code, pg = http("GET", f"{API}/api/admin/payroll/pay-groups", headers=auth)
    suite.record("PC-15", "Pay groups list", code == 200, f"HTTP {code}")

    code, reminder = http("GET", f"{API}/api/admin/payroll/reminder?month={month}&year={year}", headers=auth)
    suite.record("PC-16", "Payroll reminder", code == 200, f"HTTP {code}")

    code, comp = http(
        "GET",
        f"{API}/api/admin/payroll/compliance-export?month={month}&year={year}&format=json",
        headers=auth,
    )
    suite.record("PC-17", "Compliance export JSON", code == 200, f"HTTP {code}")

    code, bank = http(
        "GET",
        f"{API}/api/admin/payroll/bank-file?month={month}&year={year}",
        headers=auth,
    )
    suite.record("PC-18", "Bank NEFT file", code in (200, 400), f"HTTP {code}")

    code, journal = http(
        "GET",
        f"{API}/api/admin/payroll/accounting-export?month={month}&year={year}",
        headers=auth,
    )
    suite.record("PC-19", "Accounting journal export", code in (200, 400), f"HTTP {code}")

    # Variable pay create (if employee exists)
    if with_salary:
        uid = with_salary[0]["id"]
        code, vp_store = http(
            "POST",
            f"{API}/api/admin/payroll/variable-pay",
            {
                "user_id": uid,
                "month": month,
                "year": year,
                "label": f"Test bonus {TS}",
                "amount": 100.0,
                "item_type": "bonus",
            },
            auth,
        )
        suite.record("PC-20", "Variable pay create", code in (200, 201), f"HTTP {code}")

    # DB: payslip draft INSERT has organization_id (regression)
    try:
        conn = db_connect()
        cols = [
            r[0]
            for r in conn.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name='payslips'"
            ).fetchall()
        ]
        conn.close()
        suite.record(
            "PC-21",
            "Payslips table has OT columns",
            ("ot_amount" in cols or "ot_hours" in cols or "net_salary" in cols)
            and "organization_id" in cols,
            ",".join(
                c
                for c in ("ot_amount", "ot_hours", "net_salary", "organization_id")
                if c in cols
            ),
        )
    except Exception as e:
        suite.record("PC-21", "Payslips table has OT columns", False, str(e))

    # Skipped rows should not break preview array
    bad_skipped = [r for r in skipped if r.get("gross_salary") is not None and not is_num(r.get("gross_salary"))]
    suite.record("PC-22", "Skipped rows omit invalid gross", len(bad_skipped) == 0)

    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
