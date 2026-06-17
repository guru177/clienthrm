"""Revert tenant/org admin; keep platform admin as admin@retaildaddy.in."""
import sqlite3
import sys

import bcrypt

DB = r"c:\Users\ASUS\Pictures\HRM\database\database.sqlite"
ORG_EMAIL = "admin@mashuptech.in"
ORG_PASSWORD = "password"
ORG_USER_NAME = "Super Admin"
ORG_NAME = "MashupTech"
ORG_SLUG = "mashuptech"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def main() -> int:
    hashed = hash_password(ORG_PASSWORD)
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE users
        SET name = ?, email = ?, password = ?, is_super_admin = 1, updated_at = datetime('now')
        WHERE id = 1 AND deleted_at IS NULL
        """,
        (ORG_USER_NAME, ORG_EMAIL, hashed),
    )
    if cur.rowcount == 0:
        print("Primary tenant user (id=1) not found")
        conn.close()
        return 1

    cur.execute(
        """
        UPDATE organizations
        SET name = ?, slug = ?, updated_at = datetime('now')
        WHERE id = 1
        """,
        (ORG_NAME, ORG_SLUG),
    )

    conn.commit()

    cur.execute("SELECT id, email, name FROM platform_admins WHERE id = 1")
    print("platform_admins (unchanged):", dict(cur.fetchone()))
    cur.execute(
        "SELECT id, name, email, organization_id, is_super_admin FROM users WHERE id = 1"
    )
    print("users (reverted):", dict(cur.fetchone()))
    cur.execute("SELECT id, name, slug FROM organizations WHERE id = 1")
    print("organizations (reverted):", dict(cur.fetchone()))

    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
