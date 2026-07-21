"""Shared helpers for API integration tests."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import date

API = os.environ.get("HRM_API", "http://127.0.0.1:3001")

# Local defaults matching current seed passwords (override via env).
TENANT_EMAIL = os.environ.get("HRM_EMAIL", "info@retaildaddy.in")
TENANT_PASSWORD = os.environ.get("HRM_PASSWORD", "Guru!1234")
TENANT_ORG = os.environ.get("HRM_ORG", "mashuptech")
PLATFORM_EMAIL = os.environ.get("PLATFORM_ADMIN_EMAIL", "admin@retaildaddy.in")
PLATFORM_PASSWORD = os.environ.get("PLATFORM_ADMIN_PASSWORD", "LocalTest123!")

TENANT_LOGIN = {
    "email": TENANT_EMAIL,
    "password": TENANT_PASSWORD,
    "org_slug": TENANT_ORG,
}
PLATFORM_LOGIN = {
    "email": PLATFORM_EMAIL,
    "password": PLATFORM_PASSWORD,
}

# Leave validation requires at least 10 characters.
MIN_LEAVE_REASON = "Automated test leave request reason"


def login_tenant() -> str | None:
    code, body = http("POST", f"{API}/api/auth/login", TENANT_LOGIN)
    if code != 200 or not isinstance(body, dict):
        return None
    return body.get("data", {}).get("token")


def login_platform() -> str | None:
    code, body = http("POST", f"{API}/api/platform/auth/login", PLATFORM_LOGIN)
    if code != 200 or not isinstance(body, dict):
        return None
    return body.get("data", {}).get("token")


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def db_connect():
    """Return a DB connection for direct SQL checks (Postgres preferred)."""
    pg_url = os.environ.get("DATABASE_URL", "postgres://hrm:hrm@127.0.0.1:5433/hrm")
    if pg_url.startswith("postgres"):
        try:
            import psycopg2
            import psycopg2.extras

            conn = psycopg2.connect(pg_url)
            conn.autocommit = True
            return _PgCompat(conn)
        except Exception as e:  # noqa: BLE001
            raise RuntimeError(f"PostgreSQL connect failed: {e}") from e

    import sqlite3

    path = os.environ.get(
        "DATABASE_PATH",
        os.path.join(os.path.dirname(__file__), "..", "database", "database.sqlite"),
    )
    return sqlite3.connect(path, timeout=30)


class _PgCompat:
    """Minimal sqlite3-like wrapper over psycopg2 for legacy test suites."""

    def __init__(self, conn):
        self._conn = conn
        self.row_factory = None  # sqlite3 compat no-op

    def execute(self, sql, params=()):
        cur = self._conn.cursor()
        if params:
            # Preserve LIKE '%' wildcards while converting SQLite '?' to '%s'.
            marked = sql.replace("?", "\x00")
            marked = marked.replace("%", "%%").replace("\x00", "%s")
            # SQLite datetime('now') → Postgres CURRENT_TIMESTAMP
            marked = marked.replace("datetime('now')", "CURRENT_TIMESTAMP")
            marked = marked.replace('datetime("now")', "CURRENT_TIMESTAMP")
            cur.execute(marked, params)
        else:
            sql = sql.replace("datetime('now')", "CURRENT_TIMESTAMP")
            sql = sql.replace('datetime("now")', "CURRENT_TIMESTAMP")
            cur.execute(sql)
        return _PgCursor(cur)

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


class _PgCursor:
    def __init__(self, cur):
        self._cur = cur
        self._cols = [d[0] for d in (cur.description or [])]

    def fetchone(self):
        row = self._cur.fetchone()
        if row is None:
            return None
        return _PgRow(row, self._cols)

    def fetchall(self):
        return [_PgRow(r, self._cols) for r in self._cur.fetchall()]

    def __iter__(self):
        for r in self._cur:
            yield _PgRow(r, self._cols)


class _PgRow(tuple):
    """Tuple row with sqlite3.Row-like name access for legacy suites."""

    def __new__(cls, row, cols):
        obj = tuple.__new__(cls, row)
        obj._cols = list(cols)
        return obj

    def keys(self):
        return list(self._cols)

    def __getitem__(self, key):
        if isinstance(key, str):
            return tuple.__getitem__(self, self._cols.index(key))
        return tuple.__getitem__(self, key)


def http(
    method: str,
    url: str,
    data: dict | None = None,
    headers: dict | None = None,
    timeout: int = 30,
) -> tuple[int, dict | str | None]:
    hdrs = dict(headers or {})
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
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


def leave_reason(label: str) -> str:
    """Build a leave reason that satisfies the 10-character minimum."""
    text = f"{label} — automated integration test"
    return text if len(text.strip()) >= 10 else MIN_LEAVE_REASON


def default_shift_template_id(auth: dict[str, str]) -> int | None:
    code, body = http("GET", f"{API}/api/admin/shifts", headers=auth)
    if code != 200 or not isinstance(body, dict):
        return None
    rows = body.get("data") or []
    if not isinstance(rows, list):
        return None
    for row in rows:
        if row.get("is_default"):
            return row.get("id")
    return rows[0].get("id") if rows else None


def ensure_today_roster_for_clock_in(auth: dict[str, str], user_id: int) -> bool:
    """Roster the user for today so clock-in works on weekends too."""
    shift_id = default_shift_template_id(auth)
    if not shift_id:
        return False
    today = date.today().isoformat()
    code, _ = http(
        "POST",
        f"{API}/api/admin/shifts/daily-roster",
        {
            "entries": [
                {
                    "user_id": user_id,
                    "roster_date": today,
                    "shift_template_id": shift_id,
                    "is_day_off": False,
                }
            ]
        },
        auth,
    )
    return code in (200, 201)


DEMO_EMPLOYEE_NAME = "Demo Employee 1"
DEMO_EMPLOYEE_EMAIL = os.environ.get("DEMO_EMPLOYEE_EMAIL", "demo.employee1@mashuptech.test")
DEMO_EMPLOYEE_PASSWORD = os.environ.get("DEMO_EMPLOYEE_PASSWORD", TENANT_PASSWORD)
BIOMETRIC_SN = os.environ.get("BIOMETRIC_SN", "A250902070")


def ensure_demo_employee_1(token: str | None = None) -> int | None:
    """Ensure mashuptech has Demo Employee 1 with shift, salary, open employment, and PIN map.

    Returns user id or None on failure.
    """
    tok = token or login_tenant()
    if not tok:
        return None
    auth = auth_header(tok)
    conn = db_connect()
    try:
        row = conn.execute(
            """SELECT u.id FROM users u
               INNER JOIN organizations o ON o.id = u.organization_id AND o.slug = ?
               WHERE u.name LIKE 'Demo Employee 1%' AND u.deleted_at IS NULL LIMIT 1""",
            (TENANT_ORG,),
        ).fetchone()
        user_id = int(row[0]) if row else None

        if not user_id:
            code, body = http(
                "POST",
                f"{API}/api/admin/users",
                {
                    "name": DEMO_EMPLOYEE_NAME,
                    "email": DEMO_EMPLOYEE_EMAIL,
                    "password": DEMO_EMPLOYEE_PASSWORD,
                    "password_confirmation": DEMO_EMPLOYEE_PASSWORD,
                    "status": "active",
                },
                auth,
            )
            if code in (200, 201) and isinstance(body, dict):
                data = body.get("data") or {}
                user_id = data.get("id") or (data.get("user") or {}).get("id")
            if not user_id:
                # Email may already exist under another name — look up by email
                row = conn.execute(
                    """SELECT u.id FROM users u
                       INNER JOIN organizations o ON o.id = u.organization_id AND o.slug = ?
                       WHERE u.email = ? AND u.deleted_at IS NULL LIMIT 1""",
                    (TENANT_ORG, DEMO_EMPLOYEE_EMAIL),
                ).fetchone()
                if row:
                    user_id = int(row[0])
                    conn.execute(
                        "UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?",
                        (DEMO_EMPLOYEE_NAME, user_id),
                    )
                    conn.commit()
            if not user_id:
                return None

        conn.execute(
            """UPDATE users SET date_of_exit = NULL,
                   date_of_joining = COALESCE(date_of_joining, '2020-01-01'),
                   status = 'active', updated_at = datetime('now')
               WHERE id = ?""",
            (user_id,),
        )
        conn.commit()

        # Shift assignment covering 2026 test days
        shift_id = default_shift_template_id(auth)
        if shift_id:
            http(
                "POST",
                f"{API}/api/admin/shifts/assign-user",
                {
                    "user_id": user_id,
                    "shift_template_id": shift_id,
                    "effective_from": "2020-01-01",
                },
                auth,
            )

        # Minimal salary structure if missing
        as_of = "2026-01-01"
        has_sal = conn.execute(
            """SELECT 1 FROM salary_structure_items WHERE user_id=? AND effective_from <= ? LIMIT 1""",
            (user_id, as_of),
        ).fetchone()
        if not has_sal:
            org = conn.execute(
                "SELECT id FROM organizations WHERE slug = ? LIMIT 1", (TENANT_ORG,)
            ).fetchone()
            org_id = int(org[0]) if org else None
            comp = None
            if org_id:
                comp = conn.execute(
                    """SELECT id FROM salary_components
                       WHERE organization_id = ?
                       ORDER BY id LIMIT 1""",
                    (org_id,),
                ).fetchone()
            if comp:
                http(
                    "POST",
                    f"{API}/api/admin/users/{user_id}/salary-structure",
                    {
                        "effective_from": as_of,
                        "items": [{"salary_component_id": int(comp[0]), "amount": 30000}],
                    },
                    auth,
                )

        # Ensure device exists then map PIN 1 -> demo employee
        device = conn.execute(
            "SELECT 1 FROM biometric_devices WHERE serial_number = ? LIMIT 1",
            (BIOMETRIC_SN,),
        ).fetchone()
        if not device:
            http(
                "POST",
                f"{API}/api/admin/biometric/devices",
                {
                    "serial_number": BIOMETRIC_SN,
                    "name": "BIO-PARK D01 (test)",
                    "location": "Main entrance",
                },
                auth,
            )
        http(
            "POST",
            f"{API}/api/admin/biometric/mapping",
            {
                "device_serial": BIOMETRIC_SN,
                "device_pin": "1",
                "user_id": user_id,
            },
            auth,
        )
        # PIN 2 -> admin (biometric batch / multi-user cases)
        http(
            "POST",
            f"{API}/api/admin/biometric/mapping",
            {
                "device_serial": BIOMETRIC_SN,
                "device_pin": "2",
                "user_id": 1,
            },
            auth,
        )

        return int(user_id)
    finally:
        conn.close()
