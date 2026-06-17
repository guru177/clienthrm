use serde::{Deserialize, Serialize};

pub const DEFAULT_ORG_ID: i64 = 1;

#[derive(Debug, Serialize, Clone)]
pub struct OrganizationSummary {
    pub id: i64,
    pub name: String,
    pub slug: String,
    pub status: String,
    pub plan: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub company_email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub company_phone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact_person: Option<String>,
}

impl OrganizationSummary {
    pub fn from_row(row: &crate::db::Row) -> crate::db::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            slug: row.get("slug")?,
            status: row.get::<Option<String>>("status")?.unwrap_or_else(|| "active".to_string()),
            plan: row.get::<Option<String>>("plan")?.unwrap_or_else(|| "trial".to_string()),
            company_email: row.get::<Option<String>>("company_email").ok().flatten(),
            company_phone: row.get::<Option<String>>("company_phone").ok().flatten(),
            country: row.get::<Option<String>>("country").ok().flatten(),
            timezone: row.get::<Option<String>>("timezone").ok().flatten(),
            contact_person: row.get::<Option<String>>("contact_person").ok().flatten(),
        })
    }
}

#[derive(Debug, Deserialize)]
pub struct CheckSignupAvailabilityRequest {
    #[serde(default)]
    pub org_slug: Option<String>,
    #[serde(default)]
    pub admin_email: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SignupRequest {
    pub organization_name: String,
    pub org_slug: String,
    pub company_email: String,
    pub company_phone: String,
    pub contact_person: String,
    pub country: String,
    pub timezone: String,
    pub admin_name: String,
    pub admin_email: String,
    pub admin_mobile: String,
    pub admin_password: String,
    pub confirm_password: String,
    #[serde(default)]
    pub verification_id: Option<String>,
    #[serde(default)]
    pub otp: Option<String>,
}
