use crate::db::Connection;

use crate::models::organization::{OrganizationSummary, DEFAULT_ORG_ID};
use crate::models::user::JwtClaims;

pub fn org_id_from_claims(claims: &JwtClaims) -> i64 {
    claims.organization_id
}

/// Resolve tenant from slug. Empty / missing / "default" is rejected — callers must supply org_slug.
pub fn resolve_organization_id(
    conn: &Connection,
    org_slug: Option<&str>,
) -> Result<i64, String> {
    let slug = org_slug.unwrap_or("").trim();
    if slug.is_empty() || slug.eq_ignore_ascii_case("default") {
        return Err("Organization slug is required".to_string());
    }
    conn.query_row(
        "SELECT id FROM organizations WHERE slug = ?1 AND status = 'active'",
        crate::params![slug],
        |r| r.get("id"),
    )
    .map_err(|_| "Organization not found".to_string())
}

pub fn load_organization(conn: &Connection, org_id: i64) -> Option<OrganizationSummary> {
    conn.query_row(
        "SELECT id, name, slug, status, plan, company_email, company_phone, country, timezone, contact_person
         FROM organizations WHERE id = ?1",
        [org_id],
        OrganizationSummary::from_row,
    )
    .ok()
}

pub fn load_org_slug(conn: &Connection, org_id: i64) -> String {
    load_organization(conn, org_id)
        .map(|o| o.slug)
        .unwrap_or_else(|| "default".to_string())
}

pub fn slug_available(conn: &Connection, slug: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM organizations WHERE slug = ?1",
        [slug],
        |_| Ok(()),
    )
    .is_err()
}

pub fn normalize_org_slug(raw: &str) -> String {
    raw.trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

pub fn user_in_organization(conn: &Connection, user_id: i64, org_id: i64) -> bool {
    conn.query_row(
        "SELECT 1 FROM users WHERE id = ?1 AND organization_id = ?2 AND deleted_at IS NULL",
        crate::params![user_id, org_id],
        |_| Ok(()),
    )
    .is_ok()
}

/// Load super-admin flag from DB — never trust JWT claim alone.
pub fn user_is_super_admin(conn: &Connection, user_id: i64, org_id: i64) -> bool {
    conn.query_row(
        "SELECT is_super_admin FROM users
         WHERE id = ?1 AND organization_id = ?2 AND deleted_at IS NULL",
        crate::params![user_id, org_id],
        |r| r.get_idx::<Option<bool>>(0).map(|v| v.unwrap_or(false)),
    )
    .unwrap_or(false)
}

/// Verify JWT subject belongs to the claimed organization. Returns DB super-admin flag.
pub fn verify_tenant_session(
    conn: &Connection,
    claims: &JwtClaims,
) -> Result<(i64, bool), String> {
    if claims.organization_id <= 0 {
        return Err("Invalid organization in token".into());
    }
    let org_id = claims.organization_id;
    if !user_in_organization(conn, claims.sub, org_id) {
        return Err("User is not a member of this organization".into());
    }
    Ok((org_id, user_is_super_admin(conn, claims.sub, org_id)))
}

pub fn role_in_organization(conn: &Connection, role_id: i64, org_id: i64) -> bool {
    conn.query_row(
        "SELECT 1 FROM roles WHERE id = ?1 AND organization_id = ?2",
        crate::params![role_id, org_id],
        |_| Ok(()),
    )
    .is_ok()
}

pub fn department_in_organization(conn: &Connection, dept_id: i64, org_id: i64) -> bool {
    conn.query_row(
        "SELECT 1 FROM departments WHERE id = ?1 AND organization_id = ?2",
        crate::params![dept_id, org_id],
        |_| Ok(()),
    )
    .is_ok()
}

pub fn designation_in_organization(conn: &Connection, desg_id: i64, org_id: i64) -> bool {
    conn.query_row(
        "SELECT 1 FROM designations WHERE id = ?1 AND organization_id = ?2",
        crate::params![desg_id, org_id],
        |_| Ok(()),
    )
    .is_ok()
}

pub fn salary_component_in_organization(
    conn: &Connection,
    component_id: i64,
    org_id: i64,
) -> bool {
    conn.query_row(
        "SELECT 1 FROM salary_components WHERE id = ?1 AND organization_id = ?2",
        crate::params![component_id, org_id],
        |_| Ok(()),
    )
    .is_ok()
}

pub fn center_in_organization(conn: &Connection, center_id: i64, org_id: i64) -> bool {
    conn.query_row(
        "SELECT 1 FROM centers WHERE id = ?1 AND organization_id = ?2",
        crate::params![center_id, org_id],
        |_| Ok(()),
    )
    .is_ok()
}

pub fn project_in_organization(conn: &Connection, project_id: i64, org_id: i64) -> bool {
    conn.query_row(
        "SELECT 1 FROM projects WHERE id = ?1 AND organization_id = ?2",
        crate::params![project_id, org_id],
        |_| Ok(()),
    )
    .is_ok()
}

pub fn chat_space_in_organization(conn: &Connection, space_id: i64, org_id: i64) -> bool {
    conn.query_row(
        "SELECT 1 FROM chat_spaces WHERE id = ?1 AND organization_id = ?2",
        crate::params![space_id, org_id],
        |_| Ok(()),
    )
    .is_ok()
}

pub fn org_id_for_user(conn: &Connection, user_id: i64) -> i64 {
    conn.query_row(
        "SELECT organization_id FROM users WHERE id = ?1",
        [user_id],
        |r| r.get_idx::<i64>(0),
    )
    .unwrap_or(DEFAULT_ORG_ID)
}

pub fn seed_default_app_settings(conn: &Connection, org_id: i64) {
    let statutory_settings = [
        ("annual_leave_quota", "12", "Annual leave days per employee"),
        ("pf_wage_ceiling", "15000", "PF wage ceiling"),
        ("pf_employee_rate", "0.12", "PF employee rate"),
        ("pf_employer_rate", "0.12", "PF employer rate"),
        ("esi_gross_ceiling", "21000", "ESI gross ceiling"),
        ("esi_employee_rate", "0.0075", "ESI employee rate"),
        ("esi_employer_rate", "0.0325", "ESI employer rate"),
        ("esi_admin_rate", "0", "ESI admin rate"),
        ("prof_tax_default", "200", "Default professional tax"),
        ("lw_employee", "50", "Labour welfare employee"),
        ("lw_employer", "50", "Labour welfare employer"),
    ];
    for (key, value, desc) in statutory_settings {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO app_settings (organization_id, key, value, type, description, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'number', ?4, datetime('now'), datetime('now'))",
            crate::params![org_id, key, value, desc],
        );
    }
}

/// Prefill app settings from public signup company profile.
pub fn seed_signup_app_settings(
    conn: &Connection,
    org_id: i64,
    org_name: &str,
    contact_person: &str,
    company_email: &str,
    company_phone: &str,
    country: &str,
    timezone: &str,
) {
    let pairs = [
        ("company_name", org_name, "text", "Legal or display company name"),
        ("contact_person", contact_person, "text", "Primary contact person"),
        ("company_email", company_email, "text", "Company email address"),
        ("company_phone", company_phone, "text", "Company phone number"),
        ("whatsapp_number", company_phone, "text", "WhatsApp number for notifications"),
        ("support_email", company_email, "text", "Support email shown to employees"),
        ("business_location", country, "text", "Business location / country"),
        ("app_timezone", timezone, "text", "Default organization time zone"),
    ];
    for (key, value, typ, desc) in pairs {
        if value.trim().is_empty() {
            continue;
        }
        let _ = conn.execute(
            "INSERT INTO app_settings (organization_id, key, value, type, description, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'))
             ON CONFLICT(organization_id, key) DO UPDATE SET
               value = excluded.value,
               updated_at = datetime('now')",
            crate::params![org_id, key, value.trim(), typ, desc],
        );
    }
}

pub fn seed_new_organization_defaults(conn: &Connection, org_id: i64) {
    seed_default_app_settings(conn, org_id);

    let default_leave_types = [
        ("sick", "Sick Leave", "paid", 0),
        ("annual", "Annual Leave", "paid", 1),
        ("personal", "Personal Leave", "paid", 0),
        ("unpaid", "Unpaid Leave", "unpaid", 0),
        ("emergency", "Emergency Leave", "paid", 0),
    ];
    for (slug, name, payment, quota) in default_leave_types {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO leave_types (organization_id, slug, name, payment_type, counts_toward_quota, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, datetime('now'), datetime('now'))",
            crate::params![org_id, slug, name, payment, quota],
        );
    }

    let _ = crate::shift_logic::ensure_general_shift_template(conn, org_id);
}
