"""One-time fix: add organization_id to legacy tables and promote admin@mashuptech.in."""
import sqlite3
import sys

DB = r"c:\Users\ASUS\Pictures\HRM\database\database.sqlite"
ADMIN_EMAIL = "admin@mashuptech.in"

TABLES = [
    "users",
    "departments",
    "designations",
    "roles",
    "centers",
    "shift_templates",
    "user_shift_assignments",
    "biometric_devices",
    "biometric_punches",
    "salary_templates",
    "employee_salary_profiles",
    "leave_types",
    "attendance",
    "leave_requests",
    "holidays",
    "projects",
    "tasks",
    "payslips",
    "salary_components",
    "workflows",
    "job_applications",
    "biometric_user_map",
]


def column_exists(cur, table: str, column: str) -> bool:
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cur.fetchall())


def table_exists(cur, table: str) -> bool:
    cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    )
    return cur.fetchone() is not None


def add_org_column(cur, table: str) -> None:
    if not table_exists(cur, table):
        return
    if column_exists(cur, table, "organization_id"):
        return
    cur.execute(
        f"ALTER TABLE {table} ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1"
    )
    print(f"Added organization_id to {table}")


def main() -> int:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS organizations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'active',
            plan TEXT NOT NULL DEFAULT 'trial',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
        """
    )
    cur.execute(
        """
        INSERT OR IGNORE INTO organizations (id, name, slug, status, plan, created_at, updated_at)
        VALUES (1, 'MashupTech', 'mashuptech', 'active', 'enterprise', datetime('now'), datetime('now'))
        """
    )
    cur.execute(
        """
        UPDATE organizations
        SET name = 'MashupTech', slug = 'mashuptech', updated_at = datetime('now')
        WHERE id = 1
        """
    )

    for table in TABLES:
        add_org_column(cur, table)

    cur.execute(
        """
        UPDATE users
        SET organization_id = 1,
            is_super_admin = CASE WHEN lower(email) = lower(?) THEN 1 ELSE is_super_admin END,
            updated_at = datetime('now')
        WHERE deleted_at IS NULL
        """,
        (ADMIN_EMAIL,),
    )

    cur.execute(
        """
        SELECT id, name, email, organization_id, is_super_admin
        FROM users
        WHERE lower(email) = lower(?)
        """,
        (ADMIN_EMAIL,),
    )
    row = cur.fetchone()
    if not row:
        print(f"User not found: {ADMIN_EMAIL}")
        conn.close()
        return 1

    conn.commit()
    print("Organization:", dict(cur.execute("SELECT id, name, slug FROM organizations WHERE id=1").fetchone()))
    print("Admin user:", dict(row))
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
