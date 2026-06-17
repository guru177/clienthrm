use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct PlatformAdmin {
    pub id: i64,
    pub name: String,
    pub email: String,
    pub password: String,
    pub role: String,
    pub is_active: bool,
    pub totp_enabled: bool,
    pub totp_secret: Option<String>,
    pub last_login_at: Option<String>,
}

impl PlatformAdmin {
    pub fn from_row(row: &crate::db::Row) -> crate::db::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            email: row.get("email")?,
            password: row.get("password")?,
            role: row
                .get::<Option<String>>("role")?
                .unwrap_or_else(|| "admin".to_string()),
            is_active: row
                .get::<Option<i64>>("is_active")?
                .map(|v| v != 0)
                .unwrap_or(true),
            totp_enabled: row
                .get::<Option<i64>>("totp_enabled")?
                .map(|v| v != 0)
                .unwrap_or(false),
            totp_secret: row.get::<Option<String>>("totp_secret").ok().flatten(),
            last_login_at: row.get::<Option<String>>("last_login_at").ok().flatten(),
        })
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlatformJwtClaims {
    pub sub: i64,
    pub email: String,
    pub aud: String,
    pub exp: usize,
    pub iat: usize,
    #[serde(default)]
    pub jti: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PlatformLoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct PlatformTwoFactorVerifyRequest {
    pub pre_auth_token: String,
    pub code: String,
}

#[derive(Debug, Deserialize)]
pub struct PlatformTwoFactorEnableRequest {
    pub code: String,
}

#[derive(Debug, Deserialize)]
pub struct PlatformTwoFactorDisableRequest {
    pub password: String,
    #[serde(default)]
    pub code: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateOrganizationRequest {
    pub name: String,
    pub slug: String,
    pub plan: Option<String>,
    pub admin_name: String,
    pub admin_email: String,
    pub admin_password: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateOrganizationRequest {
    pub name: Option<String>,
    pub status: Option<String>,
    pub plan: Option<String>,
    pub renew_subscription: Option<bool>,
    /// Extend current subscription by N days (7, 14, 30, etc.)
    pub extend_days: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePlatformAdminRequest {
    pub name: String,
    pub email: String,
    pub password: String,
    #[serde(default)]
    pub role: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePlatformAdminRequest {
    pub name: Option<String>,
    pub role: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ResetPlatformAdminPasswordRequest {
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct PlatformOrgNoteRequest {
    pub body: String,
    #[serde(default)]
    pub pinned: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct PlatformAnnouncementRequest {
    pub title: String,
    pub body: Option<String>,
    pub severity: Option<String>,
    pub audience: Option<String>,
    pub organization_id: Option<i64>,
    pub published: Option<bool>,
    pub starts_at: Option<String>,
    pub ends_at: Option<String>,
    pub image_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TenantFeatureOverrideRequest {
    pub module_slug: String,
    pub enabled: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PlatformReleaseRequest {
    pub version: String,
    pub title: String,
    pub body: Option<String>,
    pub audience: Option<String>,
    pub severity: Option<String>,
    pub status: Option<String>,
}

pub fn role_rank(role: &str) -> i32 {
    match role {
        "owner" => 4,
        "admin" => 3,
        "support" => 2,
        "read_only" => 1,
        _ => 0,
    }
}

pub fn is_role_at_least(role: &str, min: &str) -> bool {
    role_rank(role) >= role_rank(min)
}
