use crate::db::Connection;

/// Update heartbeat/metadata only for devices pre-registered by an admin.
/// Returns the device's organization_id when the serial is known.
pub fn touch_registered_device(
    conn: &Connection,
    serial: &str,
    name: Option<&str>,
    ip: Option<&str>,
    now: &str,
) -> Option<i64> {
    let org_id: i64 = conn
        .query_row(
            "SELECT organization_id FROM biometric_devices WHERE serial_number = ?1",
            [serial],
            |r| r.get_idx::<i64>(0),
        )
        .ok()?;

    let _ = conn.execute(
        "UPDATE biometric_devices SET
            name = CASE WHEN ?2 IS NOT NULL AND ?2 != '' THEN ?2 ELSE name END,
            ip_address = COALESCE(?3, ip_address),
            last_heartbeat = ?4,
            is_active = 1,
            updated_at = ?4
         WHERE serial_number = ?1",
        crate::params![serial, name, ip, now],
    );
    Some(org_id)
}

pub fn is_device_registered(conn: &Connection, serial: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM biometric_devices WHERE serial_number = ?1",
        [serial],
        |_| Ok(()),
    )
    .is_ok()
}

/// When BIOMETRIC_STRICT_IP=1, reject punches from IPs that differ from the registered device IP.
/// Under strict mode, devices with no stored IP are rejected until their first heartbeat sets it.
pub fn device_ip_allowed(conn: &Connection, sn: &str, ip: &str) -> bool {
    if !crate::config::AppConfig::biometric_strict_ip() {
        return true;
    }
    let stored: Option<String> = conn
        .query_row(
            "SELECT ip_address FROM biometric_devices WHERE serial_number = ?1",
            [sn],
            |row| row.get_idx::<Option<String>>(0),
        )
        .ok()
        .flatten();
    match stored {
        None => false,
        Some(s) if s.trim().is_empty() => false,
        Some(s) => s.trim() == ip.trim(),
    }
}
