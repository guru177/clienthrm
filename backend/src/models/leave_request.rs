use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LeaveRequest {
    pub id: i64,
    pub user_id: i64,
    pub leave_type: String,
    pub start_date: String,
    pub end_date: String,
    pub reason: Option<String>,
    pub status: String,
    pub remarks: Option<String>,
    pub approved_by: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateLeaveRequest {
    pub leave_type: String,
    pub start_date: String,
    pub end_date: String,
    pub reason: Option<String>,
}

impl LeaveRequest {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            user_id: row.get("user_id")?,
            leave_type: row.get("leave_type")?,
            start_date: row.get("start_date")?,
            end_date: row.get("end_date")?,
            reason: row.get("reason")?,
            status: row.get("status")?,
            remarks: row.get("remarks").ok().flatten(),
            approved_by: row.get("approved_by")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}
