use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct CreateLeaveRequest {
    pub leave_type: String,
    pub start_date: String,
    pub end_date: String,
    pub reason: Option<String>,
}
