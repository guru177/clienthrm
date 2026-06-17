use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Clone)]
pub struct SubscriptionPlan {
    pub id: i64,
    pub name: String,
    pub slug: String,
    pub price_label: String,
    pub billing_period: String,
    pub max_users: i64,
    pub modules: Vec<String>,
    pub features: Vec<String>,
    pub is_active: bool,
    pub sort_order: i64,
    pub org_count: i64,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertSubscriptionPlanRequest {
    pub name: String,
    pub slug: Option<String>,
    pub price_label: Option<String>,
    pub billing_period: Option<String>,
    pub max_users: Option<i64>,
    pub modules: Option<Vec<String>>,
    pub features: Option<Vec<String>>,
    pub is_active: Option<bool>,
    pub sort_order: Option<i64>,
}
