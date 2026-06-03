use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Attendance {
    pub id: i64,
    pub user_id: i64,
    pub date: String,
    pub clock_in: Option<String>,
    pub clock_out: Option<String>,
    pub status: Option<String>,
    pub notes: Option<String>,
    pub clock_in_lat: Option<f64>,
    pub clock_in_lng: Option<f64>,
    pub clock_in_photo: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ClockInRequest {
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub photo: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MarkAttendanceRequest {
    pub date: String,
    pub status: String,
    pub notes: Option<String>,
}

impl Attendance {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            user_id: row.get("user_id")?,
            date: row.get("date")?,
            clock_in: row.get("clock_in")?,
            clock_out: row.get("clock_out")?,
            status: row.get("status")?,
            notes: row.get("notes")?,
            clock_in_lat: row.get("clock_in_lat").ok(),
            clock_in_lng: row.get("clock_in_lng").ok(),
            clock_in_photo: row.get("clock_in_photo").ok(),
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}
