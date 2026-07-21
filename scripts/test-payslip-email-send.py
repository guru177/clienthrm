import os
import json
import sqlite3
import sys
import urllib.error
import urllib.request

BASE = "http://localhost:3001/api"
TARGET = "guruprasad6282@gmail.com"
DB = r"c:\Users\ASUS\Pictures\HRM\database\database.sqlite"
LOGIN = {
    "email": "info@retaildaddy.in",
    "password": os.environ.get("HRM_PASSWORD", "Guru!1234"),
    "org_slug": "mashuptech",
}
GMAIL = {
    "mail_host": "smtp.gmail.com",
    "mail_port": "587",
    "mail_username": "info@raintechpos.com",
    "mail_password": "oanunbqqbiawchea",
    "mail_from_address": "info@raintechpos.com",
    "mail_from_name": "Raintech HRM",
    "mail_encryption": "tls",
}


def login_token():
    req = urllib.request.Request(
        BASE + "/auth/login",
        data=json.dumps(LOGIN).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)["data"]["token"]


def send_payslip(token, payslip_id):
    req = urllib.request.Request(
        BASE + f"/admin/payslips/{payslip_id}/send-email",
        data=b"{}",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.load(resp)
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode() or "{}")


def main():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute(
        """
        SELECT p.id, p.user_id, u.name, u.email
        FROM payslips p JOIN users u ON u.id = p.user_id
        WHERE u.organization_id = 1 AND p.status = 'generated'
        ORDER BY p.year DESC, p.month DESC, p.id DESC LIMIT 1
        """
    )
    row = cur.fetchone()
    if not row:
        print("No generated payslip")
        return 1

    cur.execute(
        "SELECT key, value FROM app_settings WHERE organization_id = 1 AND key LIKE 'mail_%'"
    )
    backup = {r["key"]: r["value"] for r in cur.fetchall()}

    for key, value in GMAIL.items():
        cur.execute(
            """
            INSERT INTO app_settings (organization_id, key, value, updated_at)
            VALUES (1, ?, ?, datetime('now'))
            ON CONFLICT(organization_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
            """,
            (key, value),
        )

    cur.execute(
        "SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?",
        (TARGET, row["user_id"]),
    )
    conflict = cur.fetchone()
    if conflict:
        cur.execute(
            "UPDATE users SET email = ? WHERE id = ?",
            (f"payslip-test-{conflict['id']}@mashuptech.local", conflict["id"]),
        )

    cur.execute("UPDATE users SET email = ? WHERE id = ?", (TARGET, row["user_id"]))
    conn.commit()

    print(f"Sending payslip {row['id']} ({row['name']}) to {TARGET} via Gmail SMTP...")
    token = login_token()
    status, body = send_payslip(token, row["id"])
    print("HTTP", status)
    print(json.dumps(body, indent=2))

    for key, value in backup.items():
        cur.execute(
            """
            INSERT INTO app_settings (organization_id, key, value, updated_at)
            VALUES (1, ?, ?, datetime('now'))
            ON CONFLICT(organization_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
            """,
            (key, value),
        )
    conn.commit()
    print("Restored App Settings mail_* values")

    return 0 if status == 200 and body.get("success") else 1


if __name__ == "__main__":
    sys.exit(main())
