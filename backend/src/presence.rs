use actix_web::HttpRequest;
use crate::db::Connection;

pub fn client_ip(req: &HttpRequest) -> String {
    if let Some(forwarded) = req.headers().get("X-Forwarded-For") {
        if let Ok(value) = forwarded.to_str() {
            if let Some(first) = value.split(',').next() {
                let ip = first.trim();
                if !ip.is_empty() {
                    return ip.to_string();
                }
            }
        }
    }
    if let Some(real_ip) = req.headers().get("X-Real-IP") {
        if let Ok(value) = real_ip.to_str() {
            let ip = value.trim();
            if !ip.is_empty() {
                return ip.to_string();
            }
        }
    }
    req.peer_addr()
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

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
    conn.execute(
        "INSERT INTO user_presence (user_id, organization_id, ip_address, latitude, longitude, city, region, accuracy_meters, last_active_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
         ON CONFLICT(user_id) DO UPDATE SET
            ip_address = excluded.ip_address,
            latitude = CASE
                WHEN excluded.latitude IS NOT NULL AND excluded.longitude IS NOT NULL
                THEN excluded.latitude ELSE user_presence.latitude END,
            longitude = CASE
                WHEN excluded.latitude IS NOT NULL AND excluded.longitude IS NOT NULL
                THEN excluded.longitude ELSE user_presence.longitude END,
            city = COALESCE(excluded.city, user_presence.city),
            region = COALESCE(excluded.region, user_presence.region),
            accuracy_meters = COALESCE(excluded.accuracy_meters, user_presence.accuracy_meters),
            last_active_at = excluded.last_active_at,
            updated_at = excluded.updated_at",
        crate::params![
            user_id,
            organization_id,
            ip_address,
            latitude,
            longitude,
            city,
            region,
            accuracy_meters,
            &now
        ],
    )?;
    Ok(())
}
