//! User presence tracking (IP, geo, last active).

use crate::db::Connection;

/// Re-export shared client IP resolution (honors TRUST_PROXY).
pub use crate::rate_limit::client_ip;

pub fn upsert_user_presence(
    conn: &Connection,
    user_id: i64,
    organization_id: i64,
    ip_address: &str,
    latitude: Option<f64>,
    longitude: Option<f64>,
    city: Option<&str>,
    region: Option<&str>,
    accuracy_meters: Option<f64>,
) -> crate::db::Result<()> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let updated = conn.execute(
        "UPDATE user_presence SET ip_address = ?2, organization_id = ?3, last_active_at = ?4, updated_at = ?5 WHERE user_id = ?1",
        crate::params![user_id, ip_address, organization_id, &now, &now],
    )?;

    if updated == 0 {
        conn.execute(
            "INSERT INTO user_presence (user_id, organization_id, ip_address, last_active_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)",
            crate::params![user_id, organization_id, ip_address, &now],
        )?;
    }

    if latitude.is_some() && longitude.is_some() {
        let _ = conn.execute(
            "UPDATE user_presence SET
                latitude = ?2, longitude = ?3,
                city = COALESCE(?4, city), region = COALESCE(?5, region),
                accuracy_meters = COALESCE(?6, accuracy_meters), updated_at = ?7
             WHERE user_id = ?1",
            crate::params![
                user_id,
                latitude,
                longitude,
                city,
                region,
                accuracy_meters,
                &now
            ],
        );
    }

    Ok(())
}
