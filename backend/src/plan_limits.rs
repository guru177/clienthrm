use crate::db::Connection;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize)]
pub struct OrgPlanInfo {
    pub slug: String,
    pub name: String,
    pub max_users: i64,
    pub modules: Vec<String>,
    pub billing_period: String,
    pub plan_started_at: Option<String>,
    pub plan_expires_at: Option<String>,
    pub days_remaining: Option<i64>,
    pub subscription_expired: bool,
}

fn parse_json_string_list(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw).unwrap_or_default()
}

/// Tenant modules in sidebar / subscription catalog order.
pub const MODULE_CATALOG: &[(&str, &str)] = &[
    ("dashboard", "Dashboard"),
    ("users", "Users & Roles"),
    ("centers", "Centers"),
    ("departments", "Departments"),
    ("designations", "Designations"),
    ("careers", "Job Postings"),
    ("job_applications", "Applications"),
    ("chat", "Team Chat"),
    ("attendance", "Attendance"),
    ("shifts", "Shifts"),
    ("biometric", "Biometric Devices"),
    ("manual_attendance", "Manual Attendance"),
    ("leave", "Leave Requests"),
    ("leave_manage", "Manage Leave"),
    ("holidays", "Holidays"),
    ("payroll", "Salaries & Payroll"),
    ("my_payslips", "My Payslips"),
    ("doctor_reports", "Doctor Reports"),
    ("my_doctor_reports", "My Doctor Reports"),
    ("grocery_benefits", "Grocery Benefits"),
    ("my_grocery_benefits", "My Grocery Benefits"),
    ("assets", "Assets & Maintenance"),
    ("my_assets", "My Assets"),
    ("workflows", "Workflows"),
    ("tasks", "Tasks & Activities"),
    ("projects", "Projects"),
    ("reports", "Reports"),
    ("subscription", "Subscription"),
    ("notifications", "Notifications"),
    ("support", "Support"),
    ("settings", "App Settings"),
];

/// All tenant module keys in catalog order (for plan defaults and enterprise tiers).
pub fn catalog_module_keys() -> Vec<String> {
    MODULE_CATALOG
        .iter()
        .map(|(key, _)| (*key).to_string())
        .collect()
}

pub fn module_label_for_key(key: &str) -> &'static str {
    MODULE_CATALOG
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, label)| *label)
        .unwrap_or("Other")
}

pub fn module_key_for_permission_slug(slug: &str) -> Option<&'static str> {
    for (key, _) in MODULE_CATALOG {
        if permissions_for_module(key).iter().any(|p| *p == slug) {
            return Some(key);
        }
    }
    None
}

pub fn module_sort_index(key: &str) -> usize {
    MODULE_CATALOG
        .iter()
        .position(|(k, _)| *k == key)
        .unwrap_or(MODULE_CATALOG.len())
}

/// Map subscription module keys to RBAC permission slugs used by the tenant app.
pub fn permissions_for_module(module: &str) -> Vec<&'static str> {
    match module {
        "dashboard" => vec!["view-dashboard"],
        "users" => vec![
            "view-users",
            "create-users",
            "edit-users",
            "delete-users",
            "view-roles",
            "create-roles",
            "edit-roles",
            "delete-roles",
            "view-permissions",
            "create-permissions",
            "edit-permissions",
            "delete-permissions",
            "manage-user-roles",
            "manage-permissions",
        ],
        "centers" => vec!["manage-settings"],
        "settings" => vec!["manage-settings"],
        "departments" => vec![
            "view-departments",
            "create-departments",
            "edit-departments",
            "delete-departments",
        ],
        "designations" => vec![
            "view-designations",
            "create-designations",
            "edit-designations",
            "delete-designations",
        ],
        "careers" => vec![
            "view-jobs",
            "create-jobs",
            "edit-jobs",
            "delete-jobs",
        ],
        "job_applications" => vec!["view-jobs"],
        "attendance" => vec![
            "view-attendance",
            "manage-attendance",
            "clock-inout",
        ],
        "shifts" => vec!["view-attendance", "manage-attendance"],
        "biometric" => vec!["view-attendance", "manage-attendance"],
        "manual_attendance" => vec!["view-attendance", "mark-attendance"],
        "leave" => vec![
            "view-leave-requests",
            "create-leave-requests",
        ],
        "leave_manage" => vec![
            "manage-leave-requests",
            "approve-leave-requests",
            "reject-leave-requests",
        ],
        "holidays" => vec![
            "view-holidays",
            "create-holidays",
            "edit-holidays",
            "delete-holidays",
        ],
        "payroll" => vec!["view-payroll", "manage-payroll", "export-payroll", "approve-payroll"],
        "my_payslips" => vec!["view-my-payslips"],
        "doctor_reports" => vec![
            "view-doctor-reports",
            "create-doctor-reports",
            "edit-doctor-reports",
            "delete-doctor-reports",
        ],
        "my_doctor_reports" => vec!["view-my-doctor-reports"],
        "grocery_benefits" => vec!["view-grocery-benefits", "manage-grocery-benefits"],
        "my_grocery_benefits" => vec!["view-my-grocery-benefits"],
        "assets" => vec!["view-assets", "manage-assets"],
        "my_assets" => vec!["view-my-assets"],
        "workflows" => vec![
            "view-workflows",
            "create-workflows",
            "edit-workflows",
            "delete-workflows",
            "toggle-workflows",
        ],
        "tasks" => vec![
            "view-tasks",
            "create-tasks",
            "edit-tasks",
            "delete-tasks",
            "assign-tasks",
            "update-task-status",
        ],
        "projects" => vec![
            "view-projects",
            "create-projects",
            "edit-projects",
            "delete-projects",
            "manage-project-status",
        ],
        "reports" => vec!["view-reports", "export-reports"],
        "chat" => vec!["view-chat"],
        "subscription" => vec!["manage-subscription"],
        "notifications" => vec!["manage-org-notifications"],
        "support" => vec!["view-support"],
        _ => vec![],
    }
}

pub fn permissions_from_modules(modules: &[String]) -> Vec<String> {
    let mut set = HashSet::new();
    for module in modules {
        for perm in permissions_for_module(module) {
            set.insert(perm.to_string());
        }
    }
    let mut perms: Vec<String> = set.into_iter().collect();
    perms.sort();
    perms
}

/// Permission slugs allowed for an organization based on its subscription plan.
pub fn plan_permission_slugs(conn: &Connection, org_id: i64) -> HashSet<String> {
    load_org_plan(conn, org_id)
        .map(|p| permissions_from_modules(&p.modules).into_iter().collect())
        .unwrap_or_default()
}

/// Returns an error message when any permission id is missing or outside the org plan.
pub fn validate_permission_ids_for_org(
    conn: &Connection,
    org_id: i64,
    permission_ids: &[i64],
) -> Result<(), String> {
    if permission_ids.is_empty() {
        return Ok(());
    }
    let allowed = plan_permission_slugs(conn, org_id);
    if allowed.is_empty() {
        return Err("Organization plan has no assignable permissions".to_string());
    }
    for pid in permission_ids {
        let slug: String = conn
            .query_row("SELECT slug FROM permissions WHERE id = ?1", [pid], |r| {
                r.get_idx::<String>(0)
            })
            .map_err(|_| format!("Unknown permission id {}", pid))?;
        if !allowed.contains(&slug) {
            return Err(format!(
                "Permission \"{}\" is not available on your subscription plan",
                slug
            ));
        }
    }
    Ok(())
}

fn permission_display_name(slug: &str) -> String {
    slug.split('-')
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Ensure every RBAC slug referenced by subscription modules exists in permissions.
pub fn seed_all_permissions(conn: &Connection) {
    for (module_key, module_label) in MODULE_CATALOG {
        for slug in permissions_for_module(module_key) {
            let name = permission_display_name(slug);
            let _ = conn.execute(
                "INSERT OR IGNORE INTO permissions (name, slug, description, \"group\", created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))",
                crate::params![
                    name,
                    slug,
                    format!("{name} ({module_label})"),
                    module_label,
                ],
            );
        }
    }
    // Org-wide branch RBAC bypass (not tied to a plan module; granted to admins only).
    let _ = conn.execute(
        "INSERT OR IGNORE INTO permissions (name, slug, description, \"group\", created_at, updated_at)
         VALUES ('Access All Centers', 'access-all-centers',
                 'Bypass branch RBAC and manage all branches in the organization',
                 'Users', datetime('now'), datetime('now'))",
        [],
    );
}

pub fn plan_slug_exists(conn: &Connection, slug: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM subscription_plans WHERE lower(slug) = lower(?1) AND is_active = 1",
        [slug.trim()],
        |_| Ok(()),
    )
    .is_ok()
}

pub fn org_user_count(conn: &Connection, org_id: i64) -> i64 {
    conn.query_row(
        "SELECT COUNT(*) FROM users WHERE organization_id = ?1 AND deleted_at IS NULL",
        [org_id],
        |r| r.get_idx::<i64>(0),
    )
    .unwrap_or(0)
}

pub fn ensure_user_capacity(conn: &Connection, org_id: i64) -> Result<(), String> {
    let plan = load_org_plan(conn, org_id).ok_or_else(|| {
        "Organization subscription plan is invalid or missing. Contact your platform administrator."
            .to_string()
    })?;
    if plan.max_users > 0 && org_user_count(conn, org_id) >= plan.max_users {
        return Err(format!(
            "User limit reached for your {} plan (max {} users)",
            plan.name, plan.max_users
        ));
    }
    Ok(())
}

/// Platform per-tenant module toggles (merged into effective plan modules).
fn load_feature_overrides(conn: &Connection, org_id: i64) -> HashMap<String, bool> {
    let mut map = HashMap::new();
    let Ok(stmt) = conn.prepare(
        "SELECT module_slug, enabled FROM tenant_feature_overrides WHERE organization_id = ?1",
    ) else {
        return map;
    };
    for (slug, enabled) in stmt.query_map([org_id], |row| {
        Ok((row.get_idx::<String>(0)?, row.get_idx::<i64>(1)? != 0))
    }) {
        map.insert(slug, enabled);
    }
    map
}

/// Apply platform feature overrides on top of subscription plan modules.
pub fn apply_feature_overrides(
    conn: &Connection,
    org_id: i64,
    base_modules: Vec<String>,
) -> Vec<String> {
    let overrides = load_feature_overrides(conn, org_id);
    if overrides.is_empty() {
        return base_modules;
    }
    let mut modules: HashSet<String> = base_modules.into_iter().collect();
    for (slug, enabled) in overrides {
        if enabled {
            modules.insert(slug);
        } else {
            modules.remove(&slug);
        }
    }
    let mut out: Vec<String> = modules.into_iter().collect();
    out.sort_by_key(|k| module_sort_index(k));
    out
}

pub fn load_org_plan(conn: &Connection, org_id: i64) -> Option<OrgPlanInfo> {
    let plan_slug: String = conn
        .query_row(
            "SELECT plan FROM organizations WHERE id = ?1 AND status != 'deleted'",
            [org_id],
            |r| r.get_idx::<String>(0),
        )
        .ok()?;

    conn.query_row(
        "SELECT sp.name, sp.slug, sp.max_users, sp.modules, sp.billing_period
         FROM subscription_plans sp
         WHERE lower(sp.slug) = lower(?1)",
        [&plan_slug],
        |row| {
            let modules_raw: String = row
                .get::<Option<String>>("modules")?
                .unwrap_or_else(|| "[]".to_string());
            let slug: String = row.get("slug")?;
            let sub = crate::subscription_period::load_subscription_status(conn, org_id, &slug);
            let modules =
                apply_feature_overrides(conn, org_id, parse_json_string_list(&modules_raw));
            Ok(OrgPlanInfo {
                name: row.get("name")?,
                slug,
                max_users: row.get("max_users")?,
                modules,
                billing_period: sub.billing_period,
                plan_started_at: sub.plan_started_at,
                plan_expires_at: sub.plan_expires_at,
                days_remaining: sub.days_remaining,
                subscription_expired: sub.subscription_expired,
            })
        },
    )
    .ok()
}

/// Restrict user permissions to those allowed by the organization subscription plan.
pub fn apply_plan_to_permissions(user_permissions: Vec<String>, plan: &OrgPlanInfo) -> Vec<String> {
    let plan_permissions = permissions_from_modules(&plan.modules);
    // Empty plan modules = no entitlements (fail closed), not full role permissions.
    if plan.modules.is_empty() || plan_permissions.is_empty() {
        return Vec::new();
    }

    if user_permissions.iter().any(|p| p == "*") {
        return plan_permissions;
    }

    let allowed: HashSet<&str> = plan_permissions.iter().map(String::as_str).collect();
    user_permissions
        .into_iter()
        // Keep branch RBAC bypass even though it is not a plan-module permission.
        .filter(|p| allowed.contains(p.as_str()) || p == "access-all-centers")
        .collect()
}

pub fn resolve_effective_permissions(
    conn: &Connection,
    org_id: i64,
    user_permissions: Vec<String>,
) -> (Vec<String>, Option<OrgPlanInfo>) {
    if crate::subscription_period::ensure_org_subscription_enforced(conn, org_id).is_err() {
        return (Vec::new(), load_org_plan(conn, org_id));
    }

    let plan = load_org_plan(conn, org_id);
    let permissions = match &plan {
        Some(p) if p.subscription_expired => Vec::new(),
        Some(p) => apply_plan_to_permissions(user_permissions, p),
        None => Vec::new(),
    };
    (permissions, plan)
}
