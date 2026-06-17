import sqlite3
import bcrypt

DB = r"c:\Users\ASUS\Pictures\HRM\database\database.sqlite"
EMAIL = "admin@retaildaddy.in"
PASSWORD = "retaildaddy@0123"
NAME = "Retail Daddy Admin"

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

hashed = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(rounds=12)).decode()
# bcrypt crate in Rust uses $2b$, Python bcrypt produces compatible hash

# Check platform_admins
cur.execute("SELECT id, email FROM platform_admins")
platform_admins = cur.fetchall()
print("Platform admins:", [dict(r) for r in platform_admins])

# Check users
cur.execute(
    "SELECT id, name, email, organization_id, is_super_admin FROM users WHERE deleted_at IS NULL AND email LIKE '%retail%' OR email LIKE '%admin%'"
)
print("Matching users:", [dict(r) for r in cur.fetchall()])

cur.execute(
    "SELECT id, name, slug FROM organizations ORDER BY id"
)
print("Organizations:", [dict(r) for r in cur.fetchall()])

conn.close()
