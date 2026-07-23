use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Holiday {
    pub id: i64,
    pub name: String,
    pub date: String,
    pub description: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateHolidayRequest {
    pub name: String,
    pub date: String,
    pub description: Option<String>,
    /// Ignored — company holidays are always paid. Kept for API compatibility.
    #[serde(default)]
    #[allow(dead_code)]
    pub is_paid: Option<bool>,
}

impl Holiday {
    pub fn from_row(row: &crate::db::Row) -> crate::db::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            date: row.get("date")?,
            description: row.get("description")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}
