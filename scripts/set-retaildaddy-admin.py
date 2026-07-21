"""Set platform admin credentials only (does not touch tenant/org users)."""
import sqlite3
import sys

import bcrypt

DB = r"c:\Users\ASUS\Pictures\HRM\database\database.sqlite"
EMAIL = "admin@retaildaddy.in"
PASSWORD = "retaildaddy@0123"
NAME = "Retail Daddy Admin"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def main() -> int:
    hashed = hash_password(PASSWORD)
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE platform_admins
        SET name = ?, email = ?, password = ?, updated_at = datetime('now')
        WHERE id = 1
        """,
        (NAME, EMAIL, hashed),
    )
    if cur.rowcount == 0:
        cur.execute(
            """
            INSERT INTO platform_admins (name, email, password, created_at, updated_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now'))
            """,
            (NAME, EMAIL, hashed),
        )
    print("Platform admin updated:", EMAIL)

    conn.commit()

    cur.execute("SELECT id, email, name FROM platform_admins WHERE lower(email) = lower(?)", (EMAIL,))
    print("platform_admins:", dict(cur.fetchone()))

    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
