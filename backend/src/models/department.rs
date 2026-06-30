use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Department {
    pub id: i64,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDepartmentRequest {
    pub name: String,
    pub description: Option<String>,
    pub is_active: Option<bool>,
}

impl Department {
    pub fn is_active_from_row(row: &crate::db::Row) -> bool {
        row.get::<Option<i64>>("is_active")
            .ok()
            .flatten()
            .or_else(|| row.get::<Option<bool>>("is_active").ok().flatten().map(|b| if b { 1 } else { 0 }))
            .unwrap_or(1)
            != 0
    }

    pub fn from_row(row: &crate::db::Row) -> crate::db::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            slug: row.get("slug")?,
            description: row.get("description")?,
            is_active: Self::is_active_from_row(row),
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}
