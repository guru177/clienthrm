use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Career {
    pub id: i64,
    pub title: String,
    pub department: Option<String>,
    pub location: Option<String>,
    pub employment_type: Option<String>,
    pub description: Option<String>,
    pub requirements: Option<String>,
    pub salary_range: Option<String>,
    pub is_active: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCareerRequest {
    pub title: String,
    pub department: Option<String>,
    pub location: Option<String>,
    pub employment_type: Option<String>,
    pub description: Option<String>,
    pub requirements: Option<String>,
    pub salary_range: Option<String>,
}

impl Career {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            title: row.get("title")?,
            department: row.get("department")?,
            location: row.get("location")?,
            employment_type: row.get("employment_type")?,
            description: row.get("description")?,
            requirements: row.get("requirements")?,
            salary_range: row.get("salary_range")?,
            is_active: row.get::<_, Option<bool>>("is_active")?.unwrap_or(true),
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}
