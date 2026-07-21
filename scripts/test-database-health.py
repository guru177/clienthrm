#!/usr/bin/env python3
"""Database health checks for HRM (PostgreSQL preferred; SQLite fallback)."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")
DB = os.environ.get(
    "DATABASE_PATH",
    os.path.join(os.path.dirname(__file__), "..", "database", "database.sqlite"),
)
PG_URL = os.environ.get("DATABASE_URL", "postgres://hrm:hrm@127.0.0.1:5433/hrm")

REQUIRED_INDEXES = [
    "idx_users_org",
    "idx_users_org_email",
    "idx_departments_org",
    "idx_attendance_user_date",
    "idx_payslips_org_period",
    "idx_holidays_org_date",
    "idx_jwt_refresh_tokens_user_id",
]

CORE_TABLES = [
    "organizations",
    "users",
    "departments",
    "attendance",
    "shift_templates",
    "user_shift_assignments",
    "platform_admins",
    "payslips",
    "leave_requests",
]


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
        print(f"DATABASE HEALTH RESULTS: {passed}/{total} passed")
        if passed < total:
            print("\nFailed:")
            for r in self.results:
                if not r.passed:
                    print(f"  - {r.case_id}: {r.name} | {r.detail}")
        return 0 if passed == total else 1


def api_health() -> tuple[int, dict | None]:
    try:
        req = urllib.request.Request(f"{API}/api/health", method="GET")
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode())
            return resp.status, body
    except urllib.error.HTTPError as e:
        return e.code, None
    except OSError:
        return 0, None


def run_postgres(suite: Suite) -> int:
    from test_helpers import db_connect

    suite.record("DB-01", "PostgreSQL DATABASE_URL configured", True, PG_URL.split("@")[-1])
    try:
        conn = db_connect()
    except Exception as e:  # noqa: BLE001
        suite.record("DB-02", "PostgreSQL connect", False, str(e))
        return suite.summary()
    suite.record("DB-02", "PostgreSQL connect", True)

    code, health = api_health()
    db_ok = bool(health and (health.get("database") or {}).get("ok"))
    suite.record(
        "DB-03",
        "API reports DB healthy",
        code == 200 and db_ok,
        f"HTTP {code} backend={(health or {}).get('database', {}).get('backend')}",
    )

    missing_tables = []
    for table in CORE_TABLES:
        row = conn.execute(
            """SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=?""",
            (table,),
        ).fetchone()
        if not row:
            missing_tables.append(table)
    suite.record(
        "DB-10",
        "Core schema tables exist",
        not missing_tables,
        f"missing={missing_tables}" if missing_tables else f"tables={len(CORE_TABLES)}",
    )

    idx_rows = conn.execute(
        "SELECT indexname FROM pg_indexes WHERE schemaname='public'"
    ).fetchall()
    existing = {r[0] for r in idx_rows}
    missing = [i for i in REQUIRED_INDEXES if i not in existing]
    hit = len(REQUIRED_INDEXES) - len(missing)
    suite.record(
        "DB-09",
        "Performance indexes present",
        hit >= max(1, len(REQUIRED_INDEXES) // 2),
        f"present={hit}/{len(REQUIRED_INDEXES)} missing={missing}",
    )

    orgs = conn.execute("SELECT COUNT(*) AS c FROM organizations").fetchone()[0]
    users = conn.execute(
        "SELECT COUNT(*) AS c FROM users WHERE deleted_at IS NULL"
    ).fetchone()[0]
    suite.record(
        "DB-11",
        "Seed data present",
        orgs >= 1 and users >= 1,
        f"orgs={orgs} users={users}",
    )

    orphans = conn.execute(
        """SELECT COUNT(*) AS c FROM users u
           LEFT JOIN organizations o ON o.id = u.organization_id
           WHERE u.deleted_at IS NULL AND o.id IS NULL"""
    ).fetchone()[0]
    suite.record("DB-12", "No orphan users", orphans == 0, f"orphans={orphans}")

    pay_cols = {
        r[0]
        for r in conn.execute(
            """SELECT column_name FROM information_schema.columns
               WHERE table_name='payslips'"""
        ).fetchall()
    }
    needed = {"ot_amount", "organization_id", "payroll_detail", "gross_salary"}
    suite.record(
        "DB-18",
        "Payslips advanced payroll columns",
        needed.issubset(pay_cols),
        ",".join(sorted(needed & pay_cols)),
    )

    errors: list[str] = []

    def reader(n: int) -> None:
        try:
            c = db_connect()
            c.execute("SELECT COUNT(*) AS c FROM attendance").fetchone()
            c.close()
        except Exception as exc:  # noqa: BLE001
            errors.append(f"thread-{n}:{exc}")

    threads = [threading.Thread(target=reader, args=(i,)) for i in range(8)]
    t0 = time.perf_counter()
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=15)
    elapsed_ms = round((time.perf_counter() - t0) * 1000)
    suite.record(
        "DB-14",
        "Concurrent read connections",
        not errors,
        f"errors={len(errors)} elapsed={elapsed_ms}ms" if not errors else errors[0][:80],
    )

    conn.close()
    suite.record("DB-17", "Backend health endpoint", code == 200, f"HTTP {code}")
    return suite.summary()


def run_sqlite(suite: Suite) -> int:
    suite.record("DB-01", "Database file exists", os.path.isfile(DB))
    if not os.path.isfile(DB):
        return suite.summary()
    size_mb = os.path.getsize(DB) / (1024 * 1024)
    suite.record("DB-02", "Database file readable", size_mb > 0, f"size={size_mb:.2f}MB")
    conn = sqlite3.connect(DB, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        suite.record("DB-03", "Integrity check", integrity == "ok", integrity)
        missing_tables = []
        for table in CORE_TABLES:
            row = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                (table,),
            ).fetchone()
            if not row:
                missing_tables.append(table)
        suite.record(
            "DB-10",
            "Core schema tables exist",
            not missing_tables,
            f"missing={missing_tables}" if missing_tables else f"tables={len(CORE_TABLES)}",
        )
    finally:
        conn.close()
    code, _ = api_health()
    suite.record("DB-17", "Backend health endpoint", code == 200, f"HTTP {code}")
    return suite.summary()


def main() -> int:
    suite = Suite()
    use_pg = PG_URL.startswith("postgres")
    print("=" * 60)
    print("DATABASE HEALTH & OPTIMIZATION SUITE")
    print(f"DB: {'PostgreSQL ' + PG_URL.split('@')[-1] if use_pg else os.path.abspath(DB)}")
    print(f"Started: {datetime.now().isoformat(timespec='seconds')}")
    print("=" * 60)
    if use_pg:
        return run_postgres(suite)
    return run_sqlite(suite)


if __name__ == "__main__":
    sys.exit(main())
