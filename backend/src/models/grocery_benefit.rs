use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GroceryBenefit {
    pub id: i64,
    pub organization_id: i64,
    pub user_id: i64,
    pub start_date: String,
    pub subsidy_percentage: i64,
    pub monthly_allowance: f64,
    pub status: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GroceryClaim {
    pub id: i64,
    pub organization_id: i64,
    pub user_id: i64,
    pub benefit_id: i64,
    pub claim_month: i64,
    pub claim_year: i64,
    pub amount: f64,
    pub company_share: f64,
    pub employee_share: f64,
    pub is_free_month: i64,
    pub description: Option<String>,
    pub receipt_url: Option<String>,
    pub status: String,
    pub reviewed_by: Option<i64>,
    pub reviewed_at: Option<String>,
    pub review_notes: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewer_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateGroceryBenefitRequest {
    pub user_id: i64,
    pub start_date: String,
    pub subsidy_percentage: Option<i64>,
    pub monthly_allowance: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGroceryBenefitRequest {
    pub subsidy_percentage: Option<i64>,
    pub monthly_allowance: Option<f64>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateGroceryClaimRequest {
    pub amount: f64,
    pub description: Option<String>,
    pub claim_month: Option<i64>,
    pub claim_year: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct ReviewGroceryClaimRequest {
    pub status: String,
    pub review_notes: Option<String>,
}

impl GroceryBenefit {
    pub fn from_row(row: &crate::db::Row) -> crate::db::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            organization_id: row.get("organization_id")?,
            user_id: row.get("user_id")?,
            start_date: row.get("start_date")?,
            subsidy_percentage: row.get("subsidy_percentage")?,
            monthly_allowance: row.get("monthly_allowance")?,
            status: row.get("status").unwrap_or_else(|_| "active".into()),
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            user_name: row.get("user_name").ok(),
        })
    }
}

impl GroceryClaim {
    pub fn from_row(row: &crate::db::Row) -> crate::db::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            organization_id: row.get("organization_id")?,
            user_id: row.get("user_id")?,
            benefit_id: row.get("benefit_id")?,
            claim_month: row.get("claim_month")?,
            claim_year: row.get("claim_year")?,
            amount: row.get("amount")?,
            company_share: row.get("company_share")?,
            employee_share: row.get("employee_share")?,
            is_free_month: row.get("is_free_month")?,
            description: row.get("description")?,
            receipt_url: row.get("receipt_url")?,
            status: row.get("status").unwrap_or_else(|_| "pending".into()),
            reviewed_by: row.get("reviewed_by")?,
            reviewed_at: row.get("reviewed_at")?,
            review_notes: row.get("review_notes")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            user_name: row.get("user_name").ok(),
            reviewer_name: row.get("reviewer_name").ok(),
        })
    }
}
