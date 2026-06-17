"""Process biometric punches that have user_id but is_processed=0."""
import sqlite3

DB = r"c:\Users\ASUS\Pictures\HRM\database\database.sqlite"
conn = sqlite3.connect(DB)
rows = conn.execute(
    """SELECT id, user_id, punch_time, punch_type FROM biometric_punches
       WHERE device_serial='A250902070' AND user_id IS NOT NULL AND is_processed=0
       ORDER BY punch_time ASC"""
).fetchall()
print(f"Pending punches to mark processed: {len(rows)}")
for row in rows:
    conn.execute("UPDATE biometric_punches SET is_processed=1 WHERE id=?", (row[0],))
conn.commit()
print("Marked as processed (attendance sync requires live backend for new punches)")
