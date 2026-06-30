#!/usr/bin/env python3
"""SQLite database health, integrity, and optimization checks for HRM."""

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
PG_URL = os.environ.get("DATABASE_URL", "")

REQUIRED_INDEXES = [
    "idx_users_org",
    "idx_users_org_email",
    "idx_users_org_active",
    "idx_departments_org",
    "idx_user_shift_user_date",
    "idx_bio_punches_device",
    "idx_bio_punches_time",
    "idx_bio_punches_user",
    "idx_bio_punches_org_time",
    "idx_bio_punches_user_time",
    "idx_attendance_user_date",
    "idx_attendance_org_date",
    "idx_leave_requests_user_status_dates",
    "idx_leave_requests_org_status_start",
    "idx_payslips_org_period",
    "idx_holidays_org_date",
    "idx_jwt_refresh_tokens_user_id",
    "idx_platform_audit_created",
    "idx_emp_salary_profile_user",
]

CORE_TABLES = [
    "organizations",
    "users",
    "departments",
    "attendance",
    "shift_templates",
    "user_shift_assignments",
    "platform_admins",
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


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def pragma(conn: sqlite3.Connection, name: str) -> str:
    row = conn.execute(f"PRAGMA {name}").fetchone()
    return str(row[0]) if row else ""


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


def check_sqlite_index_parity(conn: sqlite3.Connection) -> tuple[bool, str]:
    existing = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type='index'").fetchall()
    }
    missing = [i for i in REQUIRED_INDEXES if i not in existing]
    try:
        conn.execute("ANALYZE")
    except sqlite3.Error:
        pass
    if missing:
        return False, f"sqlite missing={missing}"
    return True, f"sqlite parity checked={len(REQUIRED_INDEXES)}"


def check_pg_indexes(conn: sqlite3.Connection | None = None) -> tuple[bool, str]:
    if PG_URL.startswith("postgres"):
        try:
            import psycopg2
        except ImportError:
            return (
                False,
                "DATABASE_URL set but psycopg2 missing — pip install -r scripts/requirements-test.txt",
            )
        pg_conn = psycopg2.connect(PG_URL)
        cur = pg_conn.cursor()
        cur.execute("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")
        existing = {row[0] for row in cur.fetchall()}
        missing = [i for i in REQUIRED_INDEXES if i not in existing]
        cur.execute("ANALYZE")
        pg_conn.commit()
        pg_conn.close()
        return (not missing, f"missing={missing}" if missing else f"pg checked={len(REQUIRED_INDEXES)}")
    if conn is not None:
        return check_sqlite_index_parity(conn)
    return True, "skipped — no database connection"


def main() -> int:
    suite = Suite()
    print("=" * 60)
    print("DATABASE HEALTH & OPTIMIZATION SUITE")
    print(f"DB: {os.path.abspath(DB)}")
    print(f"Started: {datetime.now().isoformat(timespec='seconds')}")
    print("=" * 60)

    suite.record("DB-01", "Database file exists", os.path.isfile(DB))
    if not os.path.isfile(DB):
        return suite.summary()

    size_mb = os.path.getsize(DB) / (1024 * 1024)
    suite.record("DB-02", "Database file readable", size_mb > 0, f"size={size_mb:.2f}MB")

    conn = connect()
    try:
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        suite.record("DB-03", "Integrity check", integrity == "ok", integrity)

        journal = pragma(conn, "journal_mode").lower()
        suite.record("DB-04", "Journal mode WAL (recommended)", journal == "wal", journal)

        fk = pragma(conn, "foreign_keys")
        suite.record("DB-05", "Foreign keys enabled on connection", fk == "1", fk)

        busy = int(pragma(conn, "busy_timeout") or "0")
        suite.record("DB-06", "Busy timeout configured", busy >= 5000, f"{busy}ms")

        page_count = int(pragma(conn, "page_count") or "0")
        page_size = int(pragma(conn, "page_size") or "0")
        freelist = int(pragma(conn, "freelist_count") or "0")
        suite.record(
            "DB-07",
            "Page stats sane",
            page_count > 0 and page_size >= 4096,
            f"pages={page_count} size={page_size} free={freelist}",
        )

        if page_count > 0:
            frag_pct = round(100 * freelist / page_count, 2)
            suite.record(
                "DB-08",
                "Freelist fragmentation acceptable",
                frag_pct < 25,
                f"freelist={frag_pct}%",
            )

        existing_indexes = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
            )
        }
        missing = [idx for idx in REQUIRED_INDEXES if idx not in existing_indexes]
        suite.record(
            "DB-09",
            "Required performance indexes present",
            not missing,
            f"missing={missing}" if missing else f"checked={len(REQUIRED_INDEXES)}",
        )

        missing_tables = []
        for table in CORE_TABLES:
            row = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
            ).fetchone()
            if not row:
                missing_tables.append(table)
        suite.record(
            "DB-10",
            "Core schema tables exist",
            not missing_tables,
            f"missing={missing_tables}" if missing_tables else f"tables={len(CORE_TABLES)}",
        )

        orgs = conn.execute("SELECT COUNT(*) FROM organizations").fetchone()[0]
        users = conn.execute(
            "SELECT COUNT(*) FROM users WHERE deleted_at IS NULL"
        ).fetchone()[0]
        suite.record(
            "DB-11",
            "Seed data present",
            orgs >= 1 and users >= 1,
            f"orgs={orgs} users={users}",
        )

        orphans = conn.execute(
            """
            SELECT COUNT(*) FROM users u
            LEFT JOIN organizations o ON o.id = u.organization_id
            WHERE u.deleted_at IS NULL AND o.id IS NULL
            """
        ).fetchone()[0]
        suite.record("DB-12", "No orphan users (missing org)", orphans == 0, f"orphans={orphans}")

        unassigned_org1 = conn.execute(
            """
            SELECT COUNT(*) FROM users u
            WHERE u.deleted_at IS NULL AND u.organization_id = 1
              AND NOT EXISTS (
                SELECT 1 FROM user_shift_assignments usa
                WHERE usa.user_id = u.id
                  AND usa.effective_from <= date('now')
                  AND (usa.effective_to IS NULL OR usa.effective_to >= date('now'))
              )
            """
        ).fetchone()[0]
        unassigned_all = conn.execute(
            """
            SELECT COUNT(*) FROM users u
            WHERE u.deleted_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM user_shift_assignments usa
                WHERE usa.user_id = u.id
                  AND usa.effective_from <= date('now')
                  AND (usa.effective_to IS NULL OR usa.effective_to >= date('now'))
              )
            """
        ).fetchone()[0]
        suite.record(
            "DB-13",
            "Primary org users have shift assignments",
            unassigned_org1 == 0,
            f"org1_unassigned={unassigned_org1} global_unassigned={unassigned_all}",
        )

        # Concurrent read stress (simulates pool checkout under load)
        errors: list[str] = []

        def reader(n: int) -> None:
            try:
                c = connect()
                c.execute("SELECT COUNT(*) FROM attendance").fetchone()
                c.close()
            except Exception as exc:  # noqa: BLE001
                errors.append(f"thread-{n}:{exc}")

        threads = [threading.Thread(target=reader, args=(i,)) for i in range(12)]
        t0 = time.perf_counter()
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=15)
        elapsed_ms = round((time.perf_counter() - t0) * 1000)
        suite.record(
            "DB-14",
            "Concurrent read connections (12 threads)",
            not errors,
            f"errors={len(errors)} elapsed={elapsed_ms}ms" if not errors else errors[0][:80],
        )

        # Query plan uses index on org-scoped user lookup
        plan_rows = conn.execute(
            "EXPLAIN QUERY PLAN SELECT id FROM users WHERE organization_id = 1 AND email = ?",
            ("admin@mashuptech.in",),
        ).fetchall()
        plan_text = " ".join(str(tuple(row)) for row in plan_rows).lower()
        uses_index = "idx_users_org" in plan_text or "using index" in plan_text
        suite.record(
            "DB-15",
            "User lookup uses index (EXPLAIN)",
            uses_index,
            plan_text[:160],
        )

        conn.execute("PRAGMA optimize")
        suite.record("DB-16", "PRAGMA optimize runs without error", True)

        payslip_cols = {r[1] for r in conn.execute("PRAGMA table_info(payslips)").fetchall()}
        suite.record(
            "DB-18",
            "Payslips advanced payroll columns",
            {"ot_amount", "organization_id", "payroll_detail"}.issubset(payslip_cols),
            ",".join(sorted(payslip_cols & {"ot_amount", "organization_id", "payroll_detail"})),
        )

        pg_ok, pg_detail = check_pg_indexes(conn)
        suite.record("DB-19", "Index parity + ANALYZE", pg_ok, pg_detail)

    finally:
        conn.close()

    code, body = api_health()
    suite.record(
        "DB-17",
        "Backend health endpoint",
        code == 200 and isinstance(body, dict),
        f"HTTP {code}",
    )

    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
