use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Asset {
    pub id: i64,
    pub organization_id: i64,
    pub name: String,
    pub asset_type: String,
    pub identifier: Option<String>,
    pub status: String,
    pub purchase_date: Option<String>,
    pub purchase_cost: Option<f64>,
    pub notes: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AssetAllocation {
    pub id: i64,
    pub organization_id: i64,
    pub asset_id: i64,
    pub user_id: i64,
    pub allocated_date: String,
    pub return_date: Option<String>,
    pub allocation_condition: Option<String>,
    pub return_condition: Option<String>,
    pub status: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AssetExpense {
    pub id: i64,
    pub organization_id: i64,
    pub asset_id: i64,
    pub user_id: Option<i64>,
    pub expense_type: String,
    pub amount: f64,
    pub expense_date: String,
    pub description: Option<String>,
    pub receipt_url: Option<String>,
    pub status: String,
    pub reviewed_by: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewer_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAssetRequest {
    pub name: String,
    pub asset_type: String,
    pub identifier: Option<String>,
    pub status: Option<String>,
    pub purchase_date: Option<String>,
    pub purchase_cost: Option<f64>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAssetRequest {
    pub name: Option<String>,
    pub asset_type: Option<String>,
    pub identifier: Option<String>,
    pub status: Option<String>,
    pub purchase_date: Option<String>,
    pub purchase_cost: Option<f64>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AllocateAssetRequest {
    pub asset_id: i64,
    pub user_id: i64,
    pub allocated_date: String,
    pub allocation_condition: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReturnAssetRequest {
    pub return_date: String,
    pub return_condition: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAssetExpenseRequest {
    pub asset_id: i64,
    pub expense_type: String,
    pub amount: f64,
    pub expense_date: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReviewAssetExpenseRequest {
    pub status: String,
}

impl Asset {
    pub fn from_row(row: &crate::db::Row) -> crate::db::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            organization_id: row.get("organization_id")?,
            name: row.get("name")?,
            asset_type: row.get("asset_type")?,
            identifier: row.get("identifier")?,
            status: row.get("status").unwrap_or_else(|_| "available".into()),
            purchase_date: row.get("purchase_date")?,
            purchase_cost: row.get("purchase_cost")?,
            notes: row.get("notes")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

impl AssetAllocation {
    pub fn from_row(row: &crate::db::Row) -> crate::db::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            organization_id: row.get("organization_id")?,
            asset_id: row.get("asset_id")?,
            user_id: row.get("user_id")?,
            allocated_date: row.get("allocated_date")?,
            return_date: row.get("return_date")?,
            allocation_condition: row.get("allocation_condition")?,
            return_condition: row.get("return_condition")?,
            status: row.get("status").unwrap_or_else(|_| "active".into()),
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            asset_name: row.get("asset_name").ok(),
            user_name: row.get("user_name").ok(),
        })
    }
}

impl AssetExpense {
    pub fn from_row(row: &crate::db::Row) -> crate::db::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            organization_id: row.get("organization_id")?,
            asset_id: row.get("asset_id")?,
            user_id: row.get("user_id")?,
            expense_type: row.get("expense_type")?,
            amount: row.get("amount")?,
            expense_date: row.get("expense_date")?,
            description: row.get("description")?,
            receipt_url: row.get("receipt_url")?,
            status: row.get("status").unwrap_or_else(|_| "pending".into()),
            reviewed_by: row.get("reviewed_by")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            asset_name: row.get("asset_name").ok(),
            user_name: row.get("user_name").ok(),
            reviewer_name: row.get("reviewer_name").ok(),
        })
    }
}
