use crate::db::Connection;
use std::collections::HashSet;

use crate::plan_limits::{load_org_plan, permissions_for_module, permissions_from_modules};

/// The six system roles every organization should have.
pub const DEFAULT_ROLE_DEFS: &[(&str, &str, &str)] = &[
    (
        "Admin",
        "admin",
        "Full administrator access to all subscribed modules",
    ),
    (
        "Manager",
        "manager",
        "Supervises teams with access to attendance, leave, and operational modules",
    ),
    (
        "Branch Admin",
        "branch-admin",
        "Administers assigned branches only (users, attendance, leave within branch scope)",
    ),
    (
        "HR",
        "hr",
        "People operations: users, leave, payroll, attendance, and HR reports",
    ),
    (
        "Doctor",
        "doctor",
        "Creates and updates employee medical consultations (SOAP) and prescriptions",
    ),
    (
        "Employee",
        "employee",
        "Standard employee self-service access to day-to-day HRM features",
    ),
];

pub fn is_system_role_slug(slug: &str) -> bool {
    let s = slug.trim().to_lowercase();
    matches!(
        s.as_str(),
        "admin"
            | "administrator"
            | "manager"
            | "branch-admin"
            | "hr"
            | "doctor"
            | "employee"
            | "user"
    )
}

fn grant_permissions_to_role_in_org(
    conn: &Connection,
    org_id: i64,
    role_slugs: &[&str],
    permission_slugs: &HashSet<String>,
) {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    for role_slug in role_slugs {
        for perm_slug in permission_slugs {
            let _ = conn.execute(
                "INSERT INTO permission_role (permission_id, role_id, created_at, updated_at)
                 SELECT p.id, r.id, ?4, ?4
                 FROM (
                     SELECT MIN(id) AS id, slug FROM permissions GROUP BY slug
                 ) p
                 INNER JOIN roles r ON r.organization_id = ?1 AND lower(r.slug) = lower(?2)
                 WHERE p.slug = ?3
                 AND NOT EXISTS (
                   SELECT 1 FROM permission_role pr2
                   WHERE pr2.permission_id = p.id AND pr2.role_id = r.id
                 )",
                crate::params![org_id, role_slug, perm_slug, &now],
            );
        }
    }
}

fn prune_admin_permissions_outside_plan(conn: &Connection, org_id: i64, plan_perms: &HashSet<String>) {
    if plan_perms.is_empty() {
        return;
    }
    let placeholders: String = plan_perms
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(", ");
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    for slug in plan_perms {
        params.push(crate::db::into_param_value(slug.clone()));
    }
    let sql = format!(
        "DELETE FROM permission_role
         WHERE role_id IN (
           SELECT id FROM roles
           WHERE organization_id = ?1 AND lower(slug) IN ('admin', 'administrator')
         )
         AND permission_id IN (
           SELECT id FROM permissions WHERE slug NOT IN ({placeholders})
         )"
    );
    let _ = conn.execute(&sql, &params);
}

fn permission_set_for_modules(modules: &[&str]) -> HashSet<String> {
    let mut set = HashSet::new();
    for module in modules {
        for slug in permissions_for_module(module) {
            set.insert(slug.to_string());
        }
    }
    set
}

fn intersect_role_modules(role_modules: &[&str], plan_modules: &[String]) -> HashSet<String> {
    let plan_set: HashSet<String> = plan_modules.iter().cloned().collect();
    let filtered: Vec<&str> = role_modules
        .iter()
        .filter(|m| plan_set.contains(**m))
        .copied()
        .collect();
    permission_set_for_modules(&filtered)
}

fn prune_role_permissions_outside_plan(
    conn: &Connection,
    org_id: i64,
    role_slugs: &[&str],
    plan_perms: &HashSet<String>,
) {
    if plan_perms.is_empty() || role_slugs.is_empty() {
        return;
    }
    let role_in: String = role_slugs
        .iter()
        .map(|s| format!("'{}'", s.to_lowercase()))
        .collect::<Vec<_>>()
        .join(", ");
    let perm_placeholders: String = plan_perms
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(", ");
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    for slug in plan_perms {
        params.push(crate::db::into_param_value(slug.clone()));
    }
    let sql = format!(
        "DELETE FROM permission_role
         WHERE role_id IN (
           SELECT id FROM roles
           WHERE organization_id = ?1 AND lower(slug) IN ({role_in})
         )
         AND permission_id IN (
           SELECT id FROM permissions WHERE slug NOT IN ({perm_placeholders})
         )"
    );
    let _ = conn.execute(&sql, &params);
}

fn prune_employee_leave_admin_permissions(conn: &Connection, org_id: i64) {
    let _ = conn.execute(
        "DELETE FROM permission_role
         WHERE role_id IN (
           SELECT id FROM roles
           WHERE organization_id = ?1 AND lower(slug) IN ('employee', 'user')
         )
         AND permission_id IN (
           SELECT id FROM permissions
           WHERE slug IN ('manage-leave-requests', 'approve-leave-requests', 'reject-leave-requests')
         )",
        [org_id],
    );
}

fn delete_role_cascade(conn: &Connection, org_id: i64, role_id: i64) {
    let _ = conn.execute(
        "DELETE FROM permission_role WHERE role_id = ?1",
        [role_id],
    );
    let _ = conn.execute("DELETE FROM role_user WHERE role_id = ?1", [role_id]);
    let _ = conn.execute(
        "DELETE FROM roles WHERE id = ?1 AND organization_id = ?2",
        crate::params![role_id, org_id],
    );
}

/// Remove QA/test junk and obsolete CRM roles; keep the six system defaults.
fn cleanup_non_default_roles(conn: &Connection, org_id: i64) {
    let rows: Vec<(i64, String, String, String)> = conn
        .prepare(
            "SELECT id,
                    lower(COALESCE(slug, '')),
                    lower(TRIM(COALESCE(description, ''))),
                    TRIM(COALESCE(name, ''))
             FROM roles WHERE organization_id = ?1",
        )
        .ok()
        .map(|stmt| {
            stmt.query_map([org_id], |row| {
                Ok((
                    row.get_idx::<i64>(0)?,
                    row.get_idx::<String>(1)?,
                    row.get_idx::<String>(2)?,
                    row.get_idx::<String>(3)?,
                ))
            })
        })
        .unwrap_or_default();

    for (role_id, slug, desc, name) in rows {
        if is_system_role_slug(&slug) {
            continue;
        }
        let role_digits = slug
            .strip_prefix("role")
            .map(|rest| !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()))
            .unwrap_or(false);
        let is_junk = name.is_empty()
            || desc == "test"
            || role_digits
            || matches!(
                slug.as_str(),
                "sales-representative" | "sales_representative" | "sales representative"
            );
        if is_junk {
            delete_role_cascade(conn, org_id, role_id);
        }
    }
}

fn ensure_default_roles(conn: &Connection, org_id: i64) {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Migrate legacy "User" → "Employee"
    let _ = conn.execute(
        "UPDATE roles
         SET name = 'Employee',
             slug = 'employee',
             description = 'Standard employee self-service access to day-to-day HRM features',
             is_default = 1,
             updated_at = ?2
         WHERE organization_id = ?1 AND lower(slug) = 'user'",
        crate::params![org_id, &now],
    );

    // If both employee and user somehow exist, keep employee and drop user.
    let employee_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM roles WHERE organization_id = ?1 AND lower(slug) = 'employee' LIMIT 1",
            crate::params![org_id],
            |r| r.get_idx::<i64>(0),
        )
        .ok();
    if let Some(emp_id) = employee_id {
        let user_ids: Vec<i64> = conn
            .prepare(
                "SELECT id FROM roles WHERE organization_id = ?1 AND lower(slug) = 'user'",
            )
            .ok()
            .map(|stmt| stmt.query_map([org_id], |row| row.get_idx::<i64>(0)))
            .unwrap_or_default();
        for uid in user_ids {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO role_user (user_id, role_id, created_at, updated_at)
                 SELECT user_id, ?1, ?3, ?3 FROM role_user WHERE role_id = ?2",
                crate::params![emp_id, uid, &now],
            );
            let _ = conn.execute(
                "INSERT OR IGNORE INTO permission_role (permission_id, role_id, created_at, updated_at)
                 SELECT permission_id, ?1, ?3, ?3 FROM permission_role WHERE role_id = ?2",
                crate::params![emp_id, uid, &now],
            );
            delete_role_cascade(conn, org_id, uid);
        }
    }

    for (name, slug, description) in DEFAULT_ROLE_DEFS {
        let exists = conn
            .query_row(
                "SELECT 1 FROM roles WHERE organization_id = ?1 AND lower(slug) = lower(?2) LIMIT 1",
                crate::params![org_id, *slug],
                |_| Ok(()),
            )
            .is_ok();
        if exists {
            let is_default = if *slug == "employee" { 1_i64 } else { 0_i64 };
            let _ = conn.execute(
                "UPDATE roles
                 SET name = ?3, description = ?4, is_default = ?5, updated_at = ?6
                 WHERE organization_id = ?1 AND lower(slug) = lower(?2)",
                crate::params![org_id, *slug, *name, *description, is_default, &now],
            );
        } else {
            let is_default = if *slug == "employee" { 1_i64 } else { 0_i64 };
            let _ = conn.execute(
                "INSERT INTO roles (name, slug, description, is_default, organization_id, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                crate::params![*name, *slug, *description, is_default, org_id, &now],
            );
        }
    }
}

/// Keep role memberships and default permission sets aligned with HRM modules per organization.
pub fn sync_role_defaults(conn: &Connection) {
    let org_ids: Vec<i64> = conn
        .prepare("SELECT id FROM organizations WHERE status != 'deleted'")
        .ok()
        .map(|stmt| stmt.query_map([], |row| row.get_idx::<i64>(0)))
        .unwrap_or_else(|| vec![1]);

    let manager_modules = [
        "dashboard",
        "users",
        "departments",
        "designations",
        "attendance",
        "shifts",
        "biometric",
        "leave",
        "leave_manage",
        "holidays",
        "tasks",
        "projects",
        "workflows",
        "reports",
    ];
    let branch_admin_modules = [
        "dashboard",
        "users",
        "centers",
        "departments",
        "designations",
        "attendance",
        "shifts",
        "biometric",
        "manual_attendance",
        "leave",
        "leave_manage",
        "holidays",
        "tasks",
        "projects",
        "reports",
    ];
    let hr_modules = [
        "dashboard",
        "users",
        "departments",
        "designations",
        "centers",
        "attendance",
        "shifts",
        "biometric",
        "manual_attendance",
        "leave",
        "leave_manage",
        "holidays",
        "payroll",
        "my_payslips",
        "grocery_benefits",
        "assets",
        "reports",
        "tasks",
        "notifications",
    ];
    let employee_modules = [
        "dashboard",
        "attendance",
        "leave",
        "holidays",
        "my_payslips",
        "my_doctor_reports",
        "my_grocery_benefits",
        "my_assets",
    ];
    let doctor_modules = ["dashboard", "doctor_reports"];

    let sync_now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    for org_id in org_ids {
        cleanup_non_default_roles(conn, org_id);
        ensure_default_roles(conn, org_id);

        let plan_modules = load_org_plan(conn, org_id)
            .map(|p| p.modules)
            .unwrap_or_default();
        let plan_perms: HashSet<String> = permissions_from_modules(&plan_modules)
            .into_iter()
            .collect();

        grant_permissions_to_role_in_org(
            conn,
            org_id,
            &["admin", "administrator"],
            &plan_perms,
        );
        prune_admin_permissions_outside_plan(conn, org_id, &plan_perms);

        grant_permissions_to_role_in_org(
            conn,
            org_id,
            &["manager"],
            &intersect_role_modules(&manager_modules, &plan_modules),
        );
        prune_role_permissions_outside_plan(conn, org_id, &["manager"], &plan_perms);

        grant_permissions_to_role_in_org(
            conn,
            org_id,
            &["branch-admin"],
            &intersect_role_modules(&branch_admin_modules, &plan_modules),
        );
        prune_role_permissions_outside_plan(conn, org_id, &["branch-admin"], &plan_perms);

        grant_permissions_to_role_in_org(
            conn,
            org_id,
            &["hr"],
            &intersect_role_modules(&hr_modules, &plan_modules),
        );
        prune_role_permissions_outside_plan(conn, org_id, &["hr"], &plan_perms);

        // Org-wide branch bypass: admins only (never manager / branch-admin / hr).
        let mut all_centers = HashSet::new();
        all_centers.insert("access-all-centers".to_string());
        grant_permissions_to_role_in_org(conn, org_id, &["admin", "administrator"], &all_centers);
        let _ = conn.execute(
            "DELETE FROM permission_role
             WHERE permission_id = (SELECT id FROM permissions WHERE slug = 'access-all-centers')
               AND role_id IN (
                 SELECT id FROM roles
                 WHERE organization_id = ?1
                   AND lower(slug) NOT IN ('admin', 'administrator')
               )",
            [org_id],
        );

        grant_permissions_to_role_in_org(
            conn,
            org_id,
            &["employee", "user"],
            &intersect_role_modules(&employee_modules, &plan_modules),
        );
        prune_role_permissions_outside_plan(conn, org_id, &["employee", "user"], &plan_perms);

        if plan_modules.iter().any(|m| m == "leave") {
            let mut employee_leave = HashSet::new();
            employee_leave.insert("view-leave-requests".to_string());
            employee_leave.insert("create-leave-requests".to_string());
            grant_permissions_to_role_in_org(conn, org_id, &["employee", "user"], &employee_leave);
        }
        prune_employee_leave_admin_permissions(conn, org_id);

        let mut doctor_perms = intersect_role_modules(&doctor_modules, &plan_modules);
        if plan_modules.iter().any(|m| m == "doctor_reports") {
            doctor_perms.insert("view-users".to_string());
        }
        grant_permissions_to_role_in_org(conn, org_id, &["doctor"], &doctor_perms);
        prune_role_permissions_outside_plan(conn, org_id, &["doctor"], &plan_perms);

        // Users with no role get Employee by default (use bound timestamps — Postgres role_user uses TIMESTAMP).
        let _ = conn.execute(
            "INSERT OR IGNORE INTO role_user (user_id, role_id, created_at, updated_at)
             SELECT u.id, r.id, ?2, ?2
             FROM users u
             INNER JOIN roles r ON r.organization_id = u.organization_id AND lower(r.slug) = 'employee'
             WHERE u.organization_id = ?1
               AND u.deleted_at IS NULL
               AND u.is_super_admin = 0
               AND NOT EXISTS (SELECT 1 FROM role_user ru WHERE ru.user_id = u.id)",
            crate::params![org_id, &sync_now],
        );

        // Super admins with no role get Admin (do not stack on top of an existing role).
        let _ = conn.execute(
            "INSERT OR IGNORE INTO role_user (user_id, role_id, created_at, updated_at)
             SELECT u.id, r.id, ?2, ?2
             FROM users u
             INNER JOIN roles r ON r.organization_id = u.organization_id AND lower(r.slug) IN ('admin', 'administrator')
             WHERE u.organization_id = ?1
               AND u.deleted_at IS NULL
               AND u.is_super_admin = 1
               AND NOT EXISTS (SELECT 1 FROM role_user ru WHERE ru.user_id = u.id)",
            crate::params![org_id, &sync_now],
        );
    }
}

/// Ensure a user has at least the default Employee role (e.g. after create when role_ids were invalid).
pub fn ensure_default_employee_role(conn: &Connection, org_id: i64, user_id: i64) {
    let has_role: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM role_user WHERE user_id = ?1",
            crate::params![user_id],
            |row| row.get_idx::<i64>(0).map(|n| n > 0),
        )
        .unwrap_or(false);
    if has_role {
        return;
    }
    let Some(role_id) = default_employee_role_id(conn, org_id) else {
        return;
    };
    let _ = replace_user_with_single_role(conn, org_id, user_id, role_id);
}

/// Replace all org role memberships for a user with exactly one role.
pub fn replace_user_with_single_role(
    conn: &Connection,
    org_id: i64,
    user_id: i64,
    role_id: i64,
) -> bool {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "DELETE FROM role_user
         WHERE user_id = ?1
           AND role_id IN (SELECT id FROM roles WHERE organization_id = ?2)",
        crate::params![user_id, org_id],
    );
    conn.execute(
        "INSERT OR IGNORE INTO role_user (user_id, role_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4)",
        crate::params![user_id, role_id, &now, &now],
    )
    .is_ok()
}

/// Resolve the default Employee role id for an organization (falls back to legacy `user`).
pub fn default_employee_role_id(conn: &Connection, org_id: i64) -> Option<i64> {
    conn.query_row(
        "SELECT id FROM roles
         WHERE organization_id = ?1 AND lower(slug) IN ('employee', 'user')
         ORDER BY CASE WHEN lower(slug) = 'employee' THEN 0 ELSE 1 END, id
         LIMIT 1",
        crate::params![org_id],
        |r| r.get_idx::<i64>(0),
    )
    .ok()
}
