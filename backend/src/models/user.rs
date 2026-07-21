use serde::{Deserialize, Deserializer, Serialize};

/// Accept JSON bool, 0/1 numbers, or "0"/"1"/"true"/"false" strings (multipart/form + FE).
fn deserialize_optional_boolish<'de, D>(deserializer: D) -> Result<Option<bool>, D::Error>
where
    D: Deserializer<'de>,
{
    use serde::de::{self, Visitor};
    use std::fmt;

    struct BoolishVisitor;
    impl<'de> Visitor<'de> for BoolishVisitor {
        type Value = Option<bool>;

        fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
            f.write_str("a boolean, 0/1, or string boolish value")
        }

        fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_bool<E: de::Error>(self, v: bool) -> Result<Self::Value, E> {
            Ok(Some(v))
        }

        fn visit_i64<E: de::Error>(self, v: i64) -> Result<Self::Value, E> {
            Ok(Some(v != 0))
        }

        fn visit_u64<E: de::Error>(self, v: u64) -> Result<Self::Value, E> {
            Ok(Some(v != 0))
        }

        fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
            let t = v.trim().to_ascii_lowercase();
            if t.is_empty() {
                return Ok(None);
            }
            match t.as_str() {
                "1" | "true" | "yes" | "on" => Ok(Some(true)),
                "0" | "false" | "no" | "off" => Ok(Some(false)),
                _ => Err(E::custom(format!("invalid boolean value: {v}"))),
            }
        }
    }

    deserializer.deserialize_any(BoolishVisitor)
}

fn deserialize_boolish<'de, D>(deserializer: D) -> Result<bool, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(deserialize_optional_boolish(deserializer)?.unwrap_or(false))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct User {
    pub id: i64,
    pub name: String,
    pub email: String,
    #[serde(skip_serializing)]
    pub password: String,
    pub phone: Option<String>,
    pub avatar: Option<String>,
    pub photo: Option<String>,
    pub bio: Option<String>,
    pub date_of_birth: Option<String>,
    pub gender: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub country: Option<String>,
    pub postal_code: Option<String>,
    pub department_id: Option<i64>,
    pub designation_id: Option<i64>,
    pub manager_id: Option<i64>,
    pub reporting_manager_id: Option<i64>,
    pub employee_id: Option<String>,
    pub join_date: Option<String>,
    pub date_of_joining: Option<String>,
    pub date_of_exit: Option<String>,
    pub work_location: Option<String>,
    pub employment_type: Option<String>,
    pub status: Option<String>,
    pub timezone: Option<String>,
    pub organization_id: i64,
    pub is_super_admin: bool,
    pub is_external: bool,
    #[serde(default)]
    pub hr_managed: bool,
    pub onboarded: bool,
    pub account_number: Option<String>,
    pub ifsc_code: Option<String>,
    pub bank_name: Option<String>,
    pub pan_number: Option<String>,
    pub esi_number: Option<String>,
    pub pf_number: Option<String>,
    pub aadhar_number: Option<String>,
    pub work_state: Option<String>,
    pub tax_regime: Option<String>,
    pub account_type: Option<String>,
    pub emergency_contact: Option<String>,
    pub doc_aadhaar: Option<String>,
    pub doc_pan: Option<String>,
    pub doc_id_proof: Option<String>,
    pub doc_other: Option<String>,
    pub email_verified_at: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ReportingManagerSummary {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct UserSummary {
    pub id: i64,
    pub name: String,
    pub email: String,
    pub phone: Option<String>,
    pub avatar: Option<String>,
    pub photo: Option<String>,
    pub department_id: Option<i64>,
    pub designation_id: Option<i64>,
    pub employee_id: Option<String>,
    pub employment_type: Option<String>,
    pub status: Option<String>,
    pub organization_id: i64,
    pub is_super_admin: bool,
    pub is_external: bool,
    #[serde(default)]
    pub hr_managed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_of_birth: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gender: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub city: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub postal_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_of_joining: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_of_exit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub work_location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub work_state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tax_regime: Option<String>,
    pub reporting_manager_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ifsc_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bank_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pan_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub esi_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pf_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aadhar_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emergency_contact: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc_aadhaar: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc_pan: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc_id_proof: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc_other: Option<String>,
    pub email_verified_at: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub department: Option<super::department::Department>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub designation: Option<super::designation::Designation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub organization: Option<super::organization::OrganizationSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub roles: Option<Vec<super::role::Role>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reporting_manager: Option<ReportingManagerSummary>,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
    #[serde(default)]
    pub org_slug: Option<String>,
}

fn default_organization_id() -> i64 {
    1
}

fn default_tenant_aud() -> String {
    "tenant".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: i64, // user_id
    pub email: String,
    pub exp: usize,
    pub iat: usize,
    #[serde(default = "default_organization_id")]
    pub organization_id: i64,
    #[serde(default)]
    pub org_slug: Option<String>,
    pub is_super_admin: bool,
    pub is_external: bool,
    #[serde(default = "default_tenant_aud")]
    pub aud: String,
    /// Set when a platform admin impersonates a tenant user.
    #[serde(default)]
    pub impersonated_by: Option<i64>,
    #[serde(default)]
    pub impersonation: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub name: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub password_confirmation: Option<String>,
    pub phone: Option<String>,
    pub department_id: Option<i64>,
    pub designation_id: Option<i64>,
    pub employment_type: Option<String>,
    pub employee_id: Option<String>,
    pub date_of_joining: Option<String>,
    pub work_location: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    pub role_ids: Option<Vec<i64>>,
    pub manager_id: Option<i64>,
    pub reporting_manager_id: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_boolish")]
    pub is_external: bool,
    /// When true, employee never logs in — HR runs attendance/leave/pay for them.
    #[serde(default, deserialize_with = "deserialize_boolish")]
    pub hr_managed: bool,
    /// Branches this user may administer (branch RBAC). Empty = fall back to work_location.
    #[serde(default)]
    pub managed_center_ids: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub avatar: Option<String>,
    pub photo: Option<String>,
    pub bio: Option<String>,
    pub date_of_birth: Option<String>,
    pub gender: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub country: Option<String>,
    pub postal_code: Option<String>,
    pub department_id: Option<i64>,
    pub designation_id: Option<i64>,
    pub manager_id: Option<i64>,
    pub reporting_manager_id: Option<i64>,
    pub employee_id: Option<String>,
    pub employment_type: Option<String>,
    pub status: Option<String>,
    pub work_location: Option<String>,
    pub account_number: Option<String>,
    pub ifsc_code: Option<String>,
    pub bank_name: Option<String>,
    pub account_type: Option<String>,
    pub pan_number: Option<String>,
    pub esi_number: Option<String>,
    pub pf_number: Option<String>,
    pub aadhar_number: Option<String>,
    pub date_of_joining: Option<String>,
    pub date_of_exit: Option<String>,
    pub work_state: Option<String>,
    pub tax_regime: Option<String>,
    pub emergency_contact: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_boolish")]
    pub is_external: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_optional_boolish")]
    pub hr_managed: Option<bool>,
    /// Required when turning off hr_managed (enable app login).
    #[serde(default)]
    pub password: Option<String>,

    // Roles
    pub roles: Option<Vec<i64>>,
    /// Branches this user may administer (branch RBAC).
    #[serde(default)]
    pub managed_center_ids: Option<Vec<i64>>,
}

impl User {
    pub fn from_row(row: &crate::db::Row) -> crate::db::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            email: row.get("email")?,
            password: row.get("password")?,
            phone: row.get("phone")?,
            avatar: row.get("avatar")?,
            photo: row.get("photo")?,
            bio: row.get("bio")?,
            date_of_birth: row.get("date_of_birth")?,
            gender: row.get("gender")?,
            address: row.get("address")?,
            city: row.get("city")?,
            state: row.get("state")?,
            country: row.get("country")?,
            postal_code: row.get("postal_code")?,
            department_id: row.get("department_id")?,
            designation_id: row.get("designation_id")?,
            manager_id: row.get("manager_id")?,
            reporting_manager_id: row.get("reporting_manager_id")?,
            employee_id: row.get("employee_id")?,
            join_date: row.get("join_date")?,
            date_of_joining: row.get("date_of_joining")?,
            date_of_exit: row.get("date_of_exit")?,
            work_location: row.get("work_location")?,
            employment_type: row.get("employment_type")?,
            status: row.get("status")?,
            timezone: row.get("timezone")?,
            organization_id: row
                .get::<Option<i64>>("organization_id")?
                .unwrap_or(1),
            is_super_admin: row.get_boolish("is_super_admin")?,
            is_external: row.get_boolish("is_external").unwrap_or(false),
            hr_managed: row.get_boolish("hr_managed").unwrap_or(false),
            onboarded: row.get_boolish("onboarded")?,
            account_number: row.get("account_number")?,
            ifsc_code: row.get("ifsc_code")?,
            bank_name: row.get("bank_name")?,
            pan_number: row.get("pan_number")?,
            esi_number: row.get("esi_number")?,
            pf_number: row.get("pf_number")?,
            aadhar_number: row.get("aadhar_number")?,
            work_state: row.get("work_state").ok().flatten(),
            tax_regime: row.get("tax_regime").ok().flatten(),
            account_type: row.get("account_type").ok().flatten(),
            emergency_contact: row.get("emergency_contact").ok().flatten(),
            doc_aadhaar: row.get("doc_aadhaar").ok().flatten(),
            doc_pan: row.get("doc_pan").ok().flatten(),
            doc_id_proof: row.get("doc_id_proof").ok().flatten(),
            doc_other: row.get("doc_other").ok().flatten(),
            email_verified_at: row.get("email_verified_at")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }

    pub fn to_summary(&self) -> UserSummary {
        UserSummary {
            id: self.id,
            name: self.name.clone(),
            email: self.email.clone(),
            phone: self.phone.clone(),
            avatar: self.avatar.clone(),
            photo: self.photo.clone(),
            department_id: self.department_id,
            designation_id: self.designation_id,
            employee_id: self.employee_id.clone(),
            employment_type: self.employment_type.clone(),
            status: self.status.clone(),
            organization_id: self.organization_id,
            is_super_admin: self.is_super_admin,
            is_external: self.is_external,
            hr_managed: self.hr_managed,
            date_of_birth: self.date_of_birth.clone(),
            gender: self.gender.clone(),
            address: self.address.clone(),
            city: self.city.clone(),
            state: self.state.clone(),
            country: self.country.clone(),
            postal_code: self.postal_code.clone(),
            bio: self.bio.clone(),
            date_of_joining: self.date_of_joining.clone(),
            date_of_exit: self.date_of_exit.clone(),
            work_location: self.work_location.clone(),
            work_state: self.work_state.clone(),
            tax_regime: self.tax_regime.clone(),
            reporting_manager_id: self.reporting_manager_id,
            account_number: self.account_number.clone(),
            ifsc_code: self.ifsc_code.clone(),
            bank_name: self.bank_name.clone(),
            account_type: self.account_type.clone(),
            pan_number: self.pan_number.clone(),
            esi_number: self.esi_number.clone(),
            pf_number: self.pf_number.clone(),
            aadhar_number: self.aadhar_number.clone(),
            emergency_contact: self.emergency_contact.clone(),
            doc_aadhaar: self.doc_aadhaar.clone(),
            doc_pan: self.doc_pan.clone(),
            doc_id_proof: self.doc_id_proof.clone(),
            doc_other: self.doc_other.clone(),
            email_verified_at: self.email_verified_at.clone(),
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
            department: None,
            designation: None,
            organization: None,
            roles: None,
            reporting_manager: None,
        }
    }
}
