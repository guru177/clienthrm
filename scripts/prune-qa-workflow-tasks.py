#!/usr/bin/env python3
"""Remove QA/workflow-generated tasks that bloat the Tasks UI and Playwright tests."""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys

DB = os.path.join(os.path.dirname(__file__), "..", "database", "database.sqlite")

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


def main() -> int:
    parser = argparse.ArgumentParser(description="Prune QA workflow tasks from dev SQLite")
    parser.add_argument("--dry-run", action="store_true", help="Count only, do not delete")
    args = parser.parse_args()

    if not os.path.isfile(DB):
        print(f"ERROR: database not found: {DB}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
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

    if args.dry_run:
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


if __name__ == "__main__":
    sys.exit(main())
