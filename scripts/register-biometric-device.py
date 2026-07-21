"""Register BIO-PARK device SN A250902070 and remove invalid 'unknown' row."""
import sqlite3
from datetime import datetime

DB = r"c:\Users\ASUS\Pictures\HRM\database\database.sqlite"
SN = "A250902070"
NAME = "BIO-PARK D01 (ai518_fp26v_v2.15)"
LOCATION = "Main entrance"
ORG_ID = 1

conn = sqlite3.connect(DB)
now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

for bad in ("unknown",):
    conn.execute("DELETE FROM biometric_user_map WHERE device_serial = ?", (bad,))
    conn.execute("DELETE FROM biometric_punches WHERE device_serial = ?", (bad,))
    conn.execute("DELETE FROM biometric_devices WHERE serial_number = ?", (bad,))

existing = conn.execute(
    "SELECT id FROM biometric_devices WHERE serial_number = ?", (SN,)
).fetchone()

if existing:
    conn.execute(
        """UPDATE biometric_devices SET
            name = ?, location = ?, organization_id = ?, is_active = 1,
            updated_at = ?
           WHERE serial_number = ?""",
        (NAME, LOCATION, ORG_ID, now, SN),
    )
    print(f"Updated device {SN}")
else:
    conn.execute(
        """INSERT INTO biometric_devices
           (serial_number, name, location, organization_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)""",
        (SN, NAME, LOCATION, ORG_ID, now, now),
    )
    print(f"Inserted device {SN}")

conn.commit()
rows = conn.execute(
    "SELECT id, serial_number, name, ip_address, last_heartbeat FROM biometric_devices"
).fetchall()
print("biometric_devices:", rows)
