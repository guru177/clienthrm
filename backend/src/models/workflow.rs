use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Workflow {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub trigger_type: Option<String>,
    pub trigger_config: Option<String>,
    pub actions: Option<String>,
    pub is_active: bool,
    pub execution_count: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkflowRequest {
    pub name: String,
    pub description: Option<String>,
    pub trigger_type: Option<String>,
    pub trigger_config: Option<String>,
    pub actions: Option<String>,
}

impl Workflow {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            description: row.get("description")?,
            trigger_type: row.get("trigger_type")?,
            trigger_config: row.get("trigger_config")?,
            actions: row.get("actions")?,
            is_active: row.get::<_, Option<bool>>("is_active")?.unwrap_or(false),
            execution_count: row.get("execution_count")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}
