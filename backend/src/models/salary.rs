use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SalaryComponent {
    pub id: i64,
    pub name: String,
    pub slug: String,
    pub component_type: String,
    pub calculation_type: Option<String>,
    pub default_value: Option<f64>,
    pub is_taxable: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SalaryStructure {
    pub id: i64,
    pub user_id: i64,
    pub ctc: f64,
    pub effective_from: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSalaryComponentRequest {
    pub name: String,
    pub component_type: String,
    pub calculation_type: Option<String>,
    pub default_value: Option<f64>,
    pub is_taxable: Option<bool>,
}

impl SalaryComponent {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            slug: row.get("slug")?,
            component_type: row.get("component_type")?,
            calculation_type: row.get("calculation_type")?,
            default_value: row.get("default_value")?,
            is_taxable: row.get::<_, Option<bool>>("is_taxable")?.unwrap_or(false),
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}
