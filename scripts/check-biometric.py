import sqlite3

c = sqlite3.connect(r"c:\Users\ASUS\Pictures\HRM\database\database.sqlite")
print("=== device ===")
for r in c.execute("SELECT serial_number, ip_address, last_heartbeat FROM biometric_devices").fetchall():
    print(r)
print("\n=== mappings ===")
for r in c.execute("SELECT device_serial, device_pin, user_id FROM biometric_user_map").fetchall():
    print(r)
print("\n=== recent punches ===")
for r in c.execute(
    """SELECT id, device_serial, device_pin, punch_time, user_id, is_processed, created_at
       FROM biometric_punches ORDER BY id DESC LIMIT 15"""
).fetchall():
    print(r)
print("\n=== today punch count ===")
print(c.execute("SELECT COUNT(*) FROM biometric_punches WHERE created_at >= date('now')").fetchone())
print("\n=== unmapped punch pins ===")
for r in c.execute(
    """SELECT DISTINCT device_pin FROM biometric_punches
       WHERE device_serial='A250902070' AND user_id IS NULL LIMIT 20"""
).fetchall():
    print(r)
