import os
import sqlite3

paths = [
    r"c:\Users\ASUS\Pictures\HRM\database\database.sqlite",
    r"c:\Users\ASUS\Pictures\HRM\backend\database.sqlite",
]

for path in paths:
    if not os.path.exists(path):
        continue
    print("DB:", path)
    conn = sqlite3.connect(path)
    tables = [
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
    ]
    pivot = [t for t in tables if "role" in t or "perm" in t]
    print("Pivot tables:", pivot)
    for table in ["role_user", "permission_role", "model_has_roles", "role_has_permissions"]:
        if table in tables:
            count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            print(f"  {table}: {count}")
    rows = conn.execute(
        """
        SELECT r.id, r.slug, r.organization_id,
               (SELECT COUNT(*) FROM permission_role pr WHERE pr.role_id = r.id),
               (SELECT COUNT(*) FROM role_user ru WHERE ru.role_id = r.id)
        FROM roles r ORDER BY r.id
        """
    ).fetchall()
    print("roles (id, slug, org, perm_count, user_count):", rows)
    conn.close()
