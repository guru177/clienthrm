use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DoctorReport {
    pub id: i64,
    pub organization_id: i64,
    pub employee_user_id: i64,
    pub doctor_user_id: i64,
    pub consultation_date: String,
    pub subjective: String,
    pub objective: String,
    pub assessment: String,
    pub plan: String,
    pub prescription_notes: Option<String>,
    pub prescription_path: Option<String>,
    pub status: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub employee_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doctor_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertDoctorReportRequest {
    pub employee_user_id: i64,
    pub consultation_date: String,
    pub subjective: Option<String>,
    pub objective: Option<String>,
    pub assessment: Option<String>,
    pub plan: Option<String>,
    pub prescription_notes: Option<String>,
    pub status: Option<String>,
}

impl DoctorReport {
    pub fn from_row(row: &crate::db::Row) -> crate::db::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            organization_id: row.get("organization_id")?,
            employee_user_id: row.get("employee_user_id")?,
            doctor_user_id: row.get("doctor_user_id")?,
            consultation_date: row.get("consultation_date")?,
            subjective: row.get("subjective").unwrap_or_default(),
            objective: row.get("objective").unwrap_or_default(),
            assessment: row.get("assessment").unwrap_or_default(),
            plan: row.get("plan").unwrap_or_default(),
            prescription_notes: row.get("prescription_notes")?,
            prescription_path: row.get("prescription_path")?,
            status: row.get("status").unwrap_or_else(|_| "draft".into()),
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            employee_name: row.get("employee_name").ok(),
            doctor_name: row.get("doctor_name").ok(),
        })
    }
}
