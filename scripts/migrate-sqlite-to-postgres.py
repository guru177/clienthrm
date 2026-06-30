#!/usr/bin/env python3
"""
Migrate Raintech HRM from SQLite to PostgreSQL (schema + data).

Required before first production start with DATABASE_URL.
Copies the full SQLite schema and data into PostgreSQL.

Requirements:
  pip install psycopg2-binary

Usage:
  python scripts/migrate-sqlite-to-postgres.py \\
    --sqlite database/database.sqlite \\
    --pg-url postgres://hrm:secret@localhost:5432/hrm

  # Dry run (print DDL only):
  python scripts/migrate-sqlite-to-postgres.py --sqlite database/database.sqlite --dry-run
"""

from __future__ import annotations

import argparse
import re
import sqlite3
import sys
from typing import Any

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    psycopg2 = None  # type: ignore


SKIP_TABLES = {"sqlite_sequence", "sqlite_stat1", "sqlite_stat4"}

# Create parent tables before children (SQLite master order is alphabetical).
TABLE_CREATE_PRIORITY = [
    "organizations",
    "users",
    "roles",
    "permissions",
    "subscription_plans",
    "biometric_devices",
]


def transform_ddl(sql: str) -> str:
    """Convert SQLite CREATE TABLE to PostgreSQL-compatible DDL."""
    s = sql.strip().rstrip(";")

    s = re.sub(
        r"INTEGER PRIMARY KEY AUTOINCREMENT",
        "SERIAL PRIMARY KEY",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(
        r"(\w+)\s+INTEGER PRIMARY KEY(?!\s+AUTOINCREMENT)",
        r"\1 SERIAL PRIMARY KEY",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(r"datetime\s*\(\s*['\"]now['\"]\s*\)", "CURRENT_TIMESTAMP", s, flags=re.IGNORECASE)
    s = re.sub(r"\bTINYINT\s*\(\s*1\s*\)", "SMALLINT", s, flags=re.IGNORECASE)
    s = re.sub(r"\bTINYINT\b", "SMALLINT", s, flags=re.IGNORECASE)
    s = re.sub(r"SMALLINT\s*\(\s*1\s*\)", "SMALLINT", s, flags=re.IGNORECASE)
    s = re.sub(r"\bDATETIME\b", "TIMESTAMP", s, flags=re.IGNORECASE)
    s = re.sub(r"\bNUMERIC\b", "NUMERIC", s, flags=re.IGNORECASE)
    # SQLite UNIQUE constraints inline — keep as-is (PG accepts most)
    s = re.sub(r"WITHOUT ROWID", "", s, flags=re.IGNORECASE)
    # Drop FK clauses for create-order independence (SQLite data is already consistent).
    s = re.sub(
        r",?\s*FOREIGN KEY\s*\([^)]+\)\s*REFERENCES\s+[^(,\s]+(?:\([^)]*\))?"
        r"(?:\s+ON\s+DELETE\s+(?:CASCADE|SET NULL|SET DEFAULT|RESTRICT|NO ACTION))?"
        r"(?:\s+ON\s+UPDATE\s+(?:CASCADE|SET NULL|SET DEFAULT|RESTRICT|NO ACTION))?",
        "",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(
        r"\s+REFERENCES\s+[^(,\s]+(?:\([^)]*\))?"
        r"(?:\s+ON\s+DELETE\s+(?:CASCADE|SET NULL|SET DEFAULT|RESTRICT|NO ACTION))?"
        r"(?:\s+ON\s+UPDATE\s+(?:CASCADE|SET NULL|SET DEFAULT|RESTRICT|NO ACTION))?",
        "",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(
        r"\s+ON\s+DELETE\s+(?:CASCADE|SET NULL|SET DEFAULT|RESTRICT|NO ACTION)",
        "",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(
        r"\s+ON\s+UPDATE\s+(?:CASCADE|SET NULL|SET DEFAULT|RESTRICT|NO ACTION)",
        "",
        s,
        flags=re.IGNORECASE,
    )
    # SQLite table-level FK removal can leave stray closing parens / commas.
    while re.search(r",\s*\)", s):
        s = re.sub(r",\s*\)", ")", s)
    while s.count("(") > s.count(")"):
        s = s + ")"
    return s


def list_tables(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()
    names = [r[0] for r in rows if r[0] not in SKIP_TABLES]

    def sort_key(name: str) -> tuple[int, str]:
        try:
            return (TABLE_CREATE_PRIORITY.index(name), name)
        except ValueError:
            return (len(TABLE_CREATE_PRIORITY), name)

    return sorted(names, key=sort_key)


def table_ddl(conn: sqlite3.Connection, table: str) -> str | None:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    if not row or not row[0]:
        return None
    return transform_ddl(row[0])


def sqlite_column_meta(conn: sqlite3.Connection, table: str) -> dict[str, tuple[str, bool]]:
    """Map column name -> (uppercase type, not_null)."""
    meta: dict[str, tuple[str, bool]] = {}
    for _cid, name, col_type, notnull, *_rest in conn.execute(f'PRAGMA table_info("{table}")'):
        meta[name] = ((col_type or "").upper(), bool(notnull))
    return meta


def coerce_empty_typed(col: str, col_type: str, not_null: bool, row: sqlite3.Row) -> Any:
    """SQLite allows '' in typed columns; PostgreSQL does not."""
    if "DATE" in col_type and "TIME" not in col_type:
        created = row["created_at"] if "created_at" in row.keys() else None
        if created:
            return str(created)[:10]
        return "1970-01-01" if not_null else None
    if "TIME" in col_type or "DATETIME" in col_type:
        created = row["created_at"] if "created_at" in row.keys() else None
        return created if created else ("1970-01-01 00:00:00" if not_null else None)
    if any(k in col_type for k in ("INT", "BOOL")):
        return 0 if not_null else None
    if any(k in col_type for k in ("REAL", "FLOA", "DOUB", "NUM", "DEC")):
        return 0 if not_null else None
    return None


def row_for_pg(row: sqlite3.Row, col_meta: dict[str, tuple[str, bool]]) -> dict[str, Any] | None:
    out: dict[str, Any] = {}
    for key in row.keys():
        val = row[key]
        col_type, not_null = col_meta.get(key, ("", False))
        typed = any(
            k in col_type
            for k in ("INT", "REAL", "FLOA", "DOUB", "NUM", "DEC", "DATE", "TIME", "BOOL")
        )
        if val == "" and typed:
            val = coerce_empty_typed(key, col_type, not_null, row)
            if val is None and not_null:
                return None
        out[key] = val
    return out


def copy_table(
    sqlite_conn: sqlite3.Connection,
    pg_conn: Any,
    table: str,
) -> int:
    sqlite_conn.row_factory = sqlite3.Row
    rows = sqlite_conn.execute(f'SELECT * FROM "{table}"').fetchall()
    if not rows:
        return 0

    col_meta = sqlite_column_meta(sqlite_conn, table)
    cols = rows[0].keys()
    col_list = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join(f"%({c})s" for c in cols)
    sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'

    payload: list[dict[str, Any]] = []
    skipped = 0
    for r in rows:
        mapped = row_for_pg(r, col_meta)
        if mapped is None:
            skipped += 1
            continue
        payload.append(mapped)
    if skipped:
        print(f"  {table}: skipped {skipped} row(s) with invalid NOT NULL typed values")

    if not payload:
        return 0

    with pg_conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, sql, payload, page_size=500)
    pg_conn.commit()
    return len(rows)


def reset_sequences(pg_conn: Any, tables: list[str]) -> None:
    """Align SERIAL sequences after explicit id inserts."""
    with pg_conn.cursor() as cur:
        for table in tables:
            cur.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
                  AND column_default LIKE 'nextval%%'
                """,
                (table,),
            )
            serial_cols = [r[0] for r in cur.fetchall()]
            for col in serial_cols:
                cur.execute(
                    f"""
                    SELECT setval(
                        pg_get_serial_sequence(%s, %s),
                        COALESCE((SELECT MAX("{col}") FROM "{table}"), 1),
                        true
                    )
                    """,
                    (table, col),
                )
    pg_conn.commit()


def migrate(sqlite_path: str, pg_url: str | None, dry_run: bool) -> None:
    sqlite_conn = sqlite3.connect(sqlite_path)
    tables = list_tables(sqlite_conn)
    print(f"Found {len(tables)} tables in {sqlite_path}")

    ddls: list[tuple[str, str]] = []
    for table in tables:
        ddl = table_ddl(sqlite_conn, table)
        if ddl:
            ddls.append((table, ddl))

    if dry_run:
        for table, ddl in ddls:
            print(f"\n-- {table}\n{ddl};")
        print(f"\n-- Would copy data for {len(tables)} tables")
        return

    if not pg_url:
        print("Error: --pg-url required unless --dry-run", file=sys.stderr)
        sys.exit(1)
    if psycopg2 is None:
        print("Error: pip install psycopg2-binary", file=sys.stderr)
        sys.exit(1)

    pg_conn = psycopg2.connect(pg_url)
    pg_conn.autocommit = False

    with pg_conn.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")
        cur.execute("SET session_replication_role = 'replica'")
    pg_conn.commit()

    with pg_conn.cursor() as cur:
        for table, ddl in ddls:
            cur.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')
            cur.execute(ddl)
    pg_conn.commit()
    print(f"Created {len(ddls)} tables")

    total = 0
    for table in tables:
        n = copy_table(sqlite_conn, pg_conn, table)
        if n:
            print(f"  {table}: {n} rows")
            total += n

    with pg_conn.cursor() as cur:
        cur.execute("SET session_replication_role = 'origin'")
    pg_conn.commit()

    reset_sequences(pg_conn, tables)

    with pg_conn.cursor() as cur:
        cur.execute("ANALYZE")
    pg_conn.commit()

    pg_conn.close()
    sqlite_conn.close()
    print(f"\nDone. {total} rows copied to PostgreSQL.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate HRM SQLite → PostgreSQL")
    parser.add_argument(
        "--sqlite",
        default="database/database.sqlite",
        help="Path to SQLite database file",
    )
    parser.add_argument(
        "--pg-url",
        default=None,
        help="PostgreSQL URL, e.g. postgres://user:pass@host:5432/hrm",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print transformed DDL without connecting to PostgreSQL",
    )
    args = parser.parse_args()
    migrate(args.sqlite, args.pg_url, args.dry_run)


if __name__ == "__main__":
    main()
