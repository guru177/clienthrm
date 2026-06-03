use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Role {
    pub id: i64,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub is_default: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoleRequest {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub permission_ids: Option<Vec<i64>>,
}

impl Role {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            slug: row.get("slug")?,
            description: row.get("description")?,
            is_default: row.get::<_, Option<bool>>("is_default")?.unwrap_or(false),
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}
