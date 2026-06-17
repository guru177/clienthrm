use serde::{Deserialize, Serialize};

/// A registered biometric device
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BiometricDevice {
    pub id: i64,
    pub serial_number: String,
    pub name: Option<String>,
    pub model: Option<String>,
    pub ip_address: Option<String>,
    pub location: Option<String>,
    pub is_active: bool,
    pub last_heartbeat: Option<String>,
    pub firmware_version: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

impl BiometricDevice {
    pub fn from_row(row: &crate::db::Row) -> crate::db::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            serial_number: row.get("serial_number")?,
            name: row.get("name")?,
            model: row.get("model")?,
            ip_address: row.get("ip_address")?,
            location: row.get("location")?,
            is_active: row.get::<i64>("is_active").unwrap_or(1) == 1,
            last_heartbeat: row.get("last_heartbeat")?,
            firmware_version: row.get("firmware_version")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

/// Request body for creating/updating user mapping
#[derive(Debug, Deserialize)]
pub struct UserMapRequest {
    pub device_serial: String,
    pub device_pin: String,
    pub user_id: i64,
}

/// Query parameters for iClock requests
#[derive(Debug, Deserialize)]
pub struct IClockQuery {
    #[serde(rename = "SN")]
    pub sn: Option<String>,
    pub table: Option<String>,
}
