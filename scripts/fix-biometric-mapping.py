"""Fix PIN mappings for device A250902070 and retroactively process punches."""
import sqlite3
from datetime import datetime

DB = r"c:\Users\ASUS\Pictures\HRM\database\database.sqlite"
SN = "A250902070"
NOW = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

# PIN 1 -> Demo Employee 1 (user id 2), PIN 4088 -> Super Admin (user id 1)
MAPPINGS = [
    ("1", 2),
    ("4088", 1),
]

conn = sqlite3.connect(DB)

# Remove wrong serial mapping
conn.execute("DELETE FROM biometric_user_map WHERE device_serial = 'BIOPARK_D01_DEMO'")

for pin, user_id in MAPPINGS:
    conn.execute(
        """INSERT INTO biometric_user_map (device_serial, device_pin, user_id, created_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(device_serial, device_pin) DO UPDATE SET user_id=excluded.user_id""",
        (SN, pin, user_id, NOW),
    )
    print(f"Mapped {SN} PIN {pin} -> user {user_id}")

# Retroactive: attach user_id to unmapped punches and mark for reprocessing
for pin, user_id in MAPPINGS:
    conn.execute(
        """UPDATE biometric_punches SET user_id = ?
           WHERE device_serial = ? AND device_pin = ? AND user_id IS NULL""",
        (user_id, SN, pin),
    )

conn.commit()

print("\nMappings:", conn.execute("SELECT device_serial, device_pin, user_id FROM biometric_user_map").fetchall())
print("Unmapped punches left:", conn.execute(
    "SELECT COUNT(*) FROM biometric_punches WHERE device_serial=? AND user_id IS NULL", (SN,)
).fetchone())
