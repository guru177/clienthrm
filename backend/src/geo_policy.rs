//! Center geofence checks for attendance clock-in.

/// Haversine distance in meters between two WGS84 points.
pub fn haversine_meters(lat1: f64, lng1: f64, lat2: f64, lng2: f64) -> f64 {
    const R: f64 = 6_371_000.0;
    let (phi1, phi2) = (lat1.to_radians(), lat2.to_radians());
    let d_phi = (lat2 - lat1).to_radians();
    let d_lambda = (lng2 - lng1).to_radians();
    let a = (d_phi / 2.0).sin().powi(2)
        + phi1.cos() * phi2.cos() * (d_lambda / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
    R * c
}

#[derive(Debug, Clone)]
pub struct Geofence {
    pub center_id: i64,
    pub lat: f64,
    pub lng: f64,
    pub radius_meters: f64,
}

/// Resolve geofence for a user via department → center.
pub fn geofence_for_user(conn: &crate::db::Connection, user_id: i64, org_id: i64) -> Option<Geofence> {
    conn.query_row(
        "SELECT c.id, c.latitude, c.longitude, c.geofence_radius_m
         FROM users u
         INNER JOIN departments d ON d.id = u.department_id AND d.organization_id = ?2
         INNER JOIN centers c ON c.id = d.center_id AND c.organization_id = ?2
         WHERE u.id = ?1 AND u.organization_id = ?2 AND u.deleted_at IS NULL
           AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
           AND COALESCE(c.geofence_radius_m, 0) > 0",
        crate::params![user_id, org_id],
        |r| {
            Ok(Geofence {
                center_id: r.get_idx::<i64>(0)?,
                lat: r.get_idx::<f64>(1)?,
                lng: r.get_idx::<f64>(2)?,
                radius_meters: r.get_idx::<f64>(3)?,
            })
        },
    )
    .ok()
}

/// Returns (out_of_zone, distance_m). If no fence or no coords, not out of zone.
pub fn evaluate_punch(
    fence: Option<&Geofence>,
    punch_lat: Option<f64>,
    punch_lng: Option<f64>,
) -> (bool, Option<f64>) {
    let Some(fence) = fence else {
        return (false, None);
    };
    let (Some(lat), Some(lng)) = (punch_lat, punch_lng) else {
        // Location missing while fence configured → treat as out of zone
        return (true, None);
    };
    let dist = haversine_meters(fence.lat, fence.lng, lat, lng);
    (dist > fence.radius_meters, Some(dist))
}

/// Org policy: `flag` (default) or `reject`.
pub fn geofence_policy(conn: &crate::db::Connection, org_id: i64) -> String {
    conn.query_row(
        "SELECT value FROM app_settings WHERE organization_id = ?1 AND key = 'geofence_policy'",
        crate::params![org_id],
        |r| r.get_idx::<Option<String>>(0),
    )
    .ok()
    .flatten()
    .filter(|s| !s.trim().is_empty())
    .unwrap_or_else(|| "flag".to_string())
}
