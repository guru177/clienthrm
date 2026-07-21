#!/usr/bin/env python3
"""Remove QA/workflow-generated tasks that bloat the Tasks UI and Playwright tests."""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SQLITE_DB = os.path.join(ROOT, "database", "database.sqlite")
BACKEND_ENV = os.path.join(ROOT, "backend", ".env")

# Titles/descriptions created by test-workflow-suite, test-hrm-core-integration, api-input-flow
QA_WHERE = """
    description LIKE '%Auto-created by workflow%'
    OR title LIKE 'WF %'
    OR title LIKE '%: WF %'
    OR title LIKE '%WF Test%'
    OR title LIKE '%WF Inactive%'
    OR title LIKE '%WF Approve%'
    OR title LIKE '%WF Unknown%'
    OR title LIKE '%WF UI Format%'
    OR title LIKE '%WF Notify%'
    OR title LIKE '%CORE task%'
    OR title LIKE '%CORE-INT%'
    OR title LIKE '%Task from WF %'
    OR title LIKE '%Approved task %'
    OR title LIKE '%Inactive %'
    OR title LIKE 'API Task %'
    OR title LIKE 'Workflow task%'
"""


def read_backend_database_url() -> str:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"].strip()
    if not os.path.isfile(BACKEND_ENV):
        return ""
    with open(BACKEND_ENV, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or not line.startswith("DATABASE_URL="):
                continue
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def sqlite_has_tasks_table(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tasks'"
    ).fetchone()
    return row is not None


def prune_sqlite(db_path: str, dry_run: bool) -> int:
    if not os.path.isfile(db_path):
        print(f"SKIP: SQLite database not found: {db_path}")
        return 0

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    if not sqlite_has_tasks_table(conn):
        print("SKIP: SQLite tasks table not found; nothing to prune.")
        conn.close()
        return 0

    total = conn.execute("SELECT COUNT(*) AS c FROM tasks").fetchone()["c"]
    qa_count = conn.execute(f"SELECT COUNT(*) AS c FROM tasks WHERE {QA_WHERE}").fetchone()["c"]

    print(f"Total tasks: {total}")
    print(f"QA/workflow tasks to remove: {qa_count}")
    print(f"Would remain: {total - qa_count}")

    samples = conn.execute(
        f"SELECT id, title FROM tasks WHERE {QA_WHERE} ORDER BY id DESC LIMIT 5"
    ).fetchall()
    if samples:
        print("\nSample titles:")
        for row in samples:
            title = (row["title"] or "")[:70]
            print(f"  id={row['id']} {title}")

    if dry_run:
        conn.close()
        return 0

    if qa_count == 0:
        print("Nothing to prune.")
        conn.close()
        return 0

    deleted = conn.execute(f"DELETE FROM tasks WHERE {QA_WHERE}").rowcount
    conn.commit()
    remaining = conn.execute("SELECT COUNT(*) AS c FROM tasks").fetchone()["c"]
    print(f"\nDeleted: {deleted}")
    print(f"Remaining tasks: {remaining}")
    conn.close()
    return 0


def prune_postgres(database_url: str, dry_run: bool) -> int:
    try:
        import psycopg2
    except ImportError:
        print("SKIP: psycopg2 is not installed; cannot prune PostgreSQL QA tasks.")
        return 0

    conn = psycopg2.connect(database_url)
    cur = conn.cursor()
    cur.execute(
        "SELECT EXISTS ("
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_name = 'tasks'"
        ")"
    )
    if not cur.fetchone()[0]:
        print("SKIP: PostgreSQL tasks table not found; nothing to prune.")
        cur.close()
        conn.close()
        return 0

    cur.execute("SELECT COUNT(*) FROM tasks")
    total = cur.fetchone()[0]
    cur.execute(f"SELECT COUNT(*) FROM tasks WHERE {QA_WHERE}")
    qa_count = cur.fetchone()[0]

    print(f"Total tasks: {total}")
    print(f"QA/workflow tasks to remove: {qa_count}")
    print(f"Would remain: {total - qa_count}")

    cur.execute(f"SELECT id, title FROM tasks WHERE {QA_WHERE} ORDER BY id DESC LIMIT 5")
    samples = cur.fetchall()
    if samples:
        print("\nSample titles:")
        for task_id, title in samples:
            print(f"  id={task_id} {(title or '')[:70]}")

    if dry_run:
        cur.close()
        conn.close()
        return 0

    if qa_count == 0:
        print("Nothing to prune.")
        cur.close()
        conn.close()
        return 0

    cur.execute(f"DELETE FROM tasks WHERE {QA_WHERE}")
    deleted = cur.rowcount
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM tasks")
    remaining = cur.fetchone()[0]
    print(f"\nDeleted: {deleted}")
    print(f"Remaining tasks: {remaining}")
    cur.close()
    conn.close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Prune QA workflow tasks from the dev database")
    parser.add_argument("--dry-run", action="store_true", help="Count only, do not delete")
    parser.add_argument("--database-url", default="", help="Override DATABASE_URL/backend .env")
    args = parser.parse_args()

    database_url = (args.database_url or read_backend_database_url()).strip()
    if database_url.startswith(("postgres://", "postgresql://")):
        return prune_postgres(database_url, args.dry_run)
    return prune_sqlite(SQLITE_DB, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
