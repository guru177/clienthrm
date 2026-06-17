import sqlite3

DB = r"c:\Users\ASUS\Pictures\HRM\database\database.sqlite"
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()
print("platform_admins:", [dict(r) for r in cur.execute("SELECT id,email,name FROM platform_admins")])
print("orgs:", [dict(r) for r in cur.execute("SELECT id,name,slug FROM organizations")])
print("users:", [dict(r) for r in cur.execute(
    "SELECT id,name,email,organization_id,is_super_admin FROM users WHERE deleted_at IS NULL"
)])
conn.close()
