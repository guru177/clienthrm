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

impl SalaryComponent {
    pub fn from_row(row: &crate::db::Row) -> crate::db::Result<Self> {
        let component_type: String = row
            .get::<Option<String>>("component_type")
            .ok()
            .flatten()
            .or_else(|| row.get::<Option<String>>("type").ok().flatten())
            .unwrap_or_else(|| "earning".to_string());
        let default_value: Option<f64> = row
            .get::<Option<f64>>("default_value")
            .ok()
            .flatten()
            .or_else(|| row.get::<Option<f64>>("amount").ok().flatten());
        let is_taxable = row
            .get::<Option<i64>>("is_taxable")
            .ok()
            .flatten()
            .map(|v| v != 0)
            .or_else(|| {
                row.get::<Option<i64>>("is_pre_tax")
                    .ok()
                    .flatten()
                    .map(|v| v != 0)
            })
            .unwrap_or(false);
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            slug: row
                .get::<Option<String>>("slug")
                .ok()
                .flatten()
                .unwrap_or_default(),
            component_type,
            calculation_type: row.get("calculation_type")?,
            default_value,
            is_taxable,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}
