use crate::db::Connection;
use std::collections::HashSet;

use crate::plan_limits::{load_org_plan, permissions_for_module, permissions_from_modules};

fn grant_permissions_to_role_in_org(
    conn: &Connection,
    org_id: i64,
    role_slugs: &[&str],
    permission_slugs: &HashSet<String>,
) {
    for role_slug in role_slugs {
        for perm_slug in permission_slugs {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO permission_role (permission_id, role_id, created_at, updated_at)
                 SELECT p.id, r.id, datetime('now'), datetime('now')
                 FROM permissions p
                 INNER JOIN roles r ON r.organization_id = ?1 AND lower(r.slug) = lower(?2)
                 WHERE p.slug = ?3",
                crate::params![org_id, role_slug, perm_slug],
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

fn prune_user_leave_admin_permissions(conn: &Connection, org_id: i64) {
    let _ = conn.execute(
        "DELETE FROM permission_role
         WHERE role_id IN (
           SELECT id FROM roles WHERE organization_id = ?1 AND lower(slug) = 'user'
         )
         AND permission_id IN (
           SELECT id FROM permissions
           WHERE slug IN ('manage-leave-requests', 'approve-leave-requests', 'reject-leave-requests')
         )",
        [org_id],
    );
}

/// Keep role memberships and default permission sets aligned with HRM modules per organization.
pub fn sync_role_defaults(conn: &Connection) {
    let _ = conn.execute_batch(
        "
        UPDATE roles SET description = 'Full administrator access to all subscribed modules'
        WHERE lower(slug) IN ('admin', 'administrator') AND (description IS NULL OR TRIM(description) = '');

        UPDATE roles SET description = 'Supervises teams with access to attendance, leave, and operational modules'
        WHERE lower(slug) = 'manager' AND (description IS NULL OR TRIM(description) = '');

        UPDATE roles SET description = 'Standard employee access to day-to-day HRM features'
        WHERE lower(slug) = 'user' AND (description IS NULL OR TRIM(description) = '');

        UPDATE roles SET description = 'Focused access for recruitment and job application workflows'
        WHERE lower(slug) IN ('sales-representative', 'sales representative', 'sales_representative')
          AND (description IS NULL OR TRIM(description) = '');
        ",
    );

    let _ = conn.execute(
        "INSERT OR IGNORE INTO role_user (user_id, role_id, created_at, updated_at)
         SELECT u.id, r.id, datetime('now'), datetime('now')
         FROM users u
         INNER JOIN roles r ON r.organization_id = u.organization_id AND lower(r.slug) = 'user'
         WHERE u.deleted_at IS NULL
           AND u.is_super_admin = 0
           AND NOT EXISTS (SELECT 1 FROM role_user ru WHERE ru.user_id = u.id)",
        [],
    );

    let _ = conn.execute(
        "INSERT OR IGNORE INTO role_user (user_id, role_id, created_at, updated_at)
         SELECT u.id, r.id, datetime('now'), datetime('now')
         FROM users u
         INNER JOIN roles r ON r.organization_id = u.organization_id AND lower(r.slug) IN ('admin', 'administrator')
         WHERE u.deleted_at IS NULL
           AND u.is_super_admin = 1
           AND NOT EXISTS (
             SELECT 1 FROM role_user ru WHERE ru.user_id = u.id AND ru.role_id = r.id
           )",
        [],
    );

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
    let user_modules = ["dashboard", "attendance", "leave", "holidays", "my_payslips"];
    let sales_modules = ["dashboard", "careers", "job_applications"];

    let org_ids: Vec<i64> = conn
        .prepare("SELECT id FROM organizations WHERE status != 'deleted'")
        .ok()
        .map(|stmt| stmt.query_map([], |row| row.get_idx::<i64>(0)))
        .unwrap_or_else(|| vec![1]);

    for org_id in org_ids {
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
        prune_role_permissions_outside_plan(
            conn,
            org_id,
            &["manager"],
            &plan_perms,
        );

        grant_permissions_to_role_in_org(
            conn,
            org_id,
            &["user"],
            &intersect_role_modules(&user_modules, &plan_modules),
        );
        prune_role_permissions_outside_plan(conn, org_id, &["user"], &plan_perms);

        if plan_modules.iter().any(|m| m == "leave") {
            let mut employee_leave = HashSet::new();
            employee_leave.insert("view-leave-requests".to_string());
            employee_leave.insert("create-leave-requests".to_string());
            grant_permissions_to_role_in_org(conn, org_id, &["user"], &employee_leave);
        }
        prune_user_leave_admin_permissions(conn, org_id);

        grant_permissions_to_role_in_org(
            conn,
            org_id,
            &[
                "sales-representative",
                "sales representative",
                "sales_representative",
            ],
            &intersect_role_modules(&sales_modules, &plan_modules),
        );
        prune_role_permissions_outside_plan(
            conn,
            org_id,
            &[
                "sales-representative",
                "sales representative",
                "sales_representative",
            ],
            &plan_perms,
        );
    }
}
