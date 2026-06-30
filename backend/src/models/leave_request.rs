use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct CreateLeaveRequest {
    pub leave_type: String,
    pub start_date: String,
    pub end_date: String,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateLeaveRequest {
    pub leave_type: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub reason: Option<String>,
}
