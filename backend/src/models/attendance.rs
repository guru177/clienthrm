use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Attendance {
    pub id: i64,
    pub user_id: i64,
    pub date: String,
    pub clock_in: Option<String>,
    pub clock_out: Option<String>,
    pub duration_minutes: Option<i64>,
    pub is_late: bool,
    pub is_early_exit: bool,
    pub notes: Option<String>,
    pub status: Option<String>,
    pub clock_in_location: Option<String>,
    pub clock_out_location: Option<String>,
    pub clock_in_face_match_score: Option<f64>,
    pub clock_in_face_verified: bool,
    pub source: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GeoLocation {
    pub lat: f64,
    pub lng: f64,
    pub accuracy: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IpLocation {
    pub ip: Option<String>,
    pub city: Option<String>,
    pub region: Option<String>,
    pub country: Option<String>,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LocationPayload {
    pub geo: GeoLocation,
    pub ip: IpLocation,
}

#[derive(Debug, Deserialize)]
pub struct ClockInRequest {
    pub face_verified: Option<bool>,
    pub face_match_score: Option<f64>,
    pub location: Option<LocationPayload>,
}

#[derive(Debug, Deserialize)]
pub struct ClockOutRequest {
    pub location: Option<LocationPayload>,
}

#[derive(Debug, Deserialize)]
pub struct AttendanceStatsQuery {
    /// Filter stats to one capture source: `app`, `biometric`, or `manual`.
    pub source: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AttendanceListQuery {
    pub search: Option<String>,
    pub status: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    /// When true, only return open sessions (clocked in, not yet clocked out).
    pub only_open: Option<bool>,
    pub user_id: Option<i64>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    /// When true, one row per employee per day: first in, last out, total minutes.
    #[serde(default)]
    pub group_by_day: Option<bool>,
}

/// Admin edit of an existing attendance record (regularization).
#[derive(Debug, Deserialize)]
pub struct UpdateAttendanceRequest {
    pub clock_in: Option<String>,
    pub clock_out: Option<String>,
    pub status: Option<String>,
    pub notes: Option<String>,
    /// When true, clears the clock-out (re-opens the session).
    pub clear_clock_out: Option<bool>,
}

/// Admin manual attendance entry for an employee (missing punch).
#[derive(Debug, Deserialize)]
pub struct CreateAttendanceRequest {
    pub user_id: i64,
    pub date: String,
    pub clock_in: Option<String>,
    pub clock_out: Option<String>,
    pub status: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BulkManualEntry {
    pub user_id: i64,
    pub clock_in: Option<String>,
    pub clock_out: Option<String>,
    pub status: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BulkManualAttendanceRequest {
    pub date: String,
    pub entries: Vec<BulkManualEntry>,
}

impl Attendance {
    pub fn from_row(row: &crate::db::Row) -> crate::db::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            user_id: row.get("user_id")?,
            date: row.get("date")?,
            clock_in: row.get("clock_in")?,
            clock_out: row.get("clock_out")?,
            duration_minutes: row.get("duration_minutes").ok(),
            is_late: row.get_boolish("is_late").unwrap_or(false),
            is_early_exit: row.get_boolish("is_early_exit").unwrap_or(false),
            notes: row.get("notes").ok(),
            status: row.get("status").ok(),
            clock_in_location: row.get("clock_in_location").ok(),
            clock_out_location: row.get("clock_out_location").ok(),
            clock_in_face_match_score: row.get("clock_in_face_match_score").ok(),
            clock_in_face_verified: row.get_boolish("clock_in_face_verified").unwrap_or(false),
            source: row.get("source").ok(),
            created_at: row.get("created_at").ok(),
            updated_at: row.get("updated_at").ok(),
        })
    }
}
