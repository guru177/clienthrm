use actix_web::body::{BoxBody, EitherBody, MessageBody};
use actix_web::dev::{ServiceRequest, ServiceResponse};
use actix_web::http::Method;
use actix_web::{middleware::Next, Error, HttpResponse};

use crate::db::DbPool;
use crate::middleware::auth::extract_claims;
use crate::models::user::JwtClaims;
use crate::models::ApiError;

/// Load permission slugs for a user (super admin gets `*`).
pub fn load_user_permissions(
    conn: &crate::db::Connection,
    user_id: i64,
    is_super_admin: bool,
) -> Vec<String> {
    if is_super_admin {
        return vec!["*".to_string()];
    }
    let stmt = match conn.prepare(
        "SELECT DISTINCT p.slug FROM permissions p
         JOIN permission_role pr ON p.id = pr.permission_id
         JOIN role_user ru ON pr.role_id = ru.role_id
         JOIN roles r ON r.id = ru.role_id
         JOIN users u ON u.id = ru.user_id AND u.organization_id = r.organization_id
         WHERE ru.user_id = ?1",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map([user_id], |row| row.get_idx::<String>(0))
}

pub fn has_permission(permissions: &[String], slug: &str) -> bool {
    permissions.iter().any(|p| p == "*" || p == slug)
}

fn permission_satisfied(permissions: &[String], slug: &str) -> bool {
    if has_permission(permissions, slug) {
        return true;
    }
    if slug == "manage-leave-requests" {
        return has_permission(permissions, "approve-leave-requests")
            || has_permission(permissions, "reject-leave-requests");
    }
    if slug == "approve-leave-requests" || slug == "reject-leave-requests" {
        return has_permission(permissions, "manage-leave-requests");
    }
    if slug == "mark-attendance" {
        return has_permission(permissions, "manage-attendance")
            || has_permission(permissions, "mark-attendance");
    }
    false
}

fn crud_perm(
    method: &Method,
    view: &'static str,
    create: &'static str,
    edit: &'static str,
    delete: &'static str,
) -> &'static str {
    match *method {
        Method::GET | Method::HEAD => view,
        Method::POST => create,
        Method::PUT | Method::PATCH => edit,
        Method::DELETE => delete,
        _ => view,
    }
}

/// Returns required permission slug, or `None` if any authenticated user may access.
pub fn required_permission(method: &Method, path: &str) -> Option<&'static str> {
    if path.starts_with("/api/onboarding/")
        || path.starts_with("/api/admin/settings/profile")
        || path.starts_with("/api/admin/settings/password")
        || path == "/api/admin/announcements"
    {
        return None;
    }
    if path.starts_with("/api/admin/org-notifications") {
        if path.ends_with("/upload-banner") && *method == Method::POST {
            return Some("manage-org-notifications");
        }
        if path.ends_with("/sent") && *method == Method::GET {
            return Some("manage-org-notifications");
        }
        if path == "/api/admin/org-notifications" && *method == Method::POST {
            return Some("manage-org-notifications");
        }
        return None;
    }
    if path.starts_with("/api/admin/billing") || path.starts_with("/api/admin/kb") {
        return Some("manage-subscription");
    }
    if path.starts_with("/api/admin/support/tickets") {
        return Some("view-support");
    }
    if path == "/api/admin/leave-types" && *method == Method::GET {
        return None;
    }
    if path.starts_with("/api/admin/settings/app") || path.starts_with("/api/admin/settings/centers")
        || path.starts_with("/api/admin/settings/leave-types")
        || path.starts_with("/api/admin/settings/leave-policy")
        || path.starts_with("/api/admin/leave-credits")
    {
        return Some("manage-settings");
    }
    if *method == Method::DELETE
        && path.starts_with("/api/admin/leave-requests/")
        && !path.contains("/approve")
        && !path.contains("/reject")
        && !path.contains("/remarks")
    {
        return None;
    }
    if path.starts_with("/api/admin/payslips/") && path.ends_with("/pdf") && *method == Method::GET {
        return None;
    }
    if path.contains("/leave-requests/") && path.contains("/approve") {
        return Some("approve-leave-requests");
    }
    if path.contains("/leave-requests/") && path.contains("/reject") {
        return Some("reject-leave-requests");
    }
    if path.contains("/leave-requests/manage") {
        return Some("manage-leave-requests");
    }
    if path.contains("/leave-requests/") && path.contains("/remarks") {
        return Some("manage-leave-requests");
    }
    if path.starts_with("/api/admin/dashboard") {
        return Some("view-dashboard");
    }
    if path == "/api/admin/users/list" && method == Method::GET {
        return Some("view-users");
    }
    if (path == "/api/admin/payroll/preview" || path == "/api/admin/payroll/generate")
        && method == Method::POST
    {
        return Some("manage-payroll");
    }
    if path.contains("/payslips/") && path.ends_with("/unlock") && method == Method::POST {
        return Some("manage-payroll");
    }
    if path.contains("/salary-structure") && method != Method::GET {
        return Some("manage-payroll");
    }
    if path.starts_with("/api/admin/roles") {
        return Some(crud_perm(
            method,
            "view-roles",
            "create-roles",
            "edit-roles",
            "delete-roles",
        ));
    }
    if path.starts_with("/api/admin/users") {
        return Some(crud_perm(
            method,
            "view-users",
            "create-users",
            "edit-users",
            "delete-users",
        ));
    }
    if path.starts_with("/api/admin/permissions") {
        return Some(crud_perm(
            method,
            "view-permissions",
            "create-permissions",
            "edit-permissions",
            "delete-permissions",
        ));
    }
    if path.starts_with("/api/admin/departments") {
        return Some(crud_perm(
            method,
            "view-departments",
            "create-departments",
            "edit-departments",
            "delete-departments",
        ));
    }
    if path.starts_with("/api/admin/designations") {
        return Some(crud_perm(
            method,
            "view-designations",
            "create-designations",
            "edit-designations",
            "delete-designations",
        ));
    }
    if path.starts_with("/api/admin/careers") {
        return Some(crud_perm(
            method,
            "view-jobs",
            "create-jobs",
            "edit-jobs",
            "delete-jobs",
        ));
    }
    if path.starts_with("/api/admin/job-applications") {
        return Some(if *method == Method::GET {
            "view-jobs"
        } else {
            "edit-jobs"
        });
    }
    if path.starts_with("/api/admin/integrations/") {
        return Some("manage-settings");
    }
    if path.starts_with("/api/admin/manager/") {
        if path.contains("/approve") {
            return Some("approve-leave-requests");
        }
        if path.contains("/reject") {
            return Some("reject-leave-requests");
        }
        if path.contains("/leave") {
            return Some("approve-leave-requests");
        }
        return Some("view-attendance");
    }
    if path.starts_with("/api/admin/attendance/clock-in")
        || path.starts_with("/api/admin/attendance/clock-out")
    {
        return Some("clock-inout");
    }
    if path.starts_with("/api/admin/attendance/manual") {
        return Some("mark-attendance");
    }
    if path.starts_with("/api/admin/biometric") {
        return Some(if *method == Method::GET {
            "view-attendance"
        } else {
            "manage-attendance"
        });
    }
    if path.starts_with("/api/admin/attendance/users") {
        return Some("view-attendance");
    }
    if path.starts_with("/api/admin/attendance") {
        // Admin writes (manual entry, edit, delete) require manage-attendance;
        // reads stay on view-attendance. Self-service clock-in/out is handled above.
        return Some(if *method == Method::GET {
            "view-attendance"
        } else {
            "manage-attendance"
        });
    }
    if path.starts_with("/api/admin/shifts") {
        return Some(if *method == Method::GET {
            "view-attendance"
        } else {
            "manage-attendance"
        });
    }
    if path.starts_with("/api/admin/leave-requests") {
        if *method == Method::GET {
            return Some("view-leave-requests");
        }
        if *method == Method::POST {
            return Some("create-leave-requests");
        }
        return Some("manage-leave-requests");
    }
    if path == "/api/admin/me/doctor-reports" && *method == Method::GET {
        return Some("view-my-doctor-reports");
    }
    if path.starts_with("/api/admin/doctor-reports") {
        return Some(crud_perm(
            method,
            "view-doctor-reports",
            "create-doctor-reports",
            "edit-doctor-reports",
            "delete-doctor-reports",
        ));
    }
    if path.starts_with("/api/admin/me/") {
        return None;
    }
    if path.starts_with("/api/admin/holidays") {
        return Some(crud_perm(
            method,
            "view-holidays",
            "create-holidays",
            "edit-holidays",
            "delete-holidays",
        ));
    }
    if path.starts_with("/api/admin/reports") {
        return Some(if *method == Method::GET {
            "view-reports"
        } else {
            "export-reports"
        });
    }
    if path.starts_with("/api/admin/salaries")
        || path.starts_with("/api/admin/payroll")
        || path.starts_with("/api/admin/payslips")
        || path.contains("/payslips/bulk-download")
        || path.contains("/payslips/bulk-send-email")
    {
        if path == "/api/admin/me/payslips" && *method == Method::GET {
            return Some("view-my-payslips");
        }
        return Some(if *method == Method::GET {
            "view-payroll"
        } else {
            "manage-payroll"
        });
    }
    if path.starts_with("/api/admin/workflows") {
        if path.contains("/toggle") {
            return Some("toggle-workflows");
        }
        return Some(crud_perm(
            method,
            "view-workflows",
            "create-workflows",
            "edit-workflows",
            "delete-workflows",
        ));
    }
    if path.starts_with("/api/admin/tasks") {
        if path.contains("/status") {
            return Some("update-task-status");
        }
        return Some(crud_perm(
            method,
            "view-tasks",
            "create-tasks",
            "edit-tasks",
            "delete-tasks",
        ));
    }
    if path.starts_with("/api/admin/projects") {
        return Some(crud_perm(
            method,
            "view-projects",
            "create-projects",
            "edit-projects",
            "delete-projects",
        ));
    }
    if path.starts_with("/api/admin/chat") {
        return Some("view-chat");
    }
    // `/api/admin/assets*`, `/api/admin/asset-allocations`, `/api/admin/asset-expenses`,
    // `/api/admin/my-assets*`, `/api/admin/grocery-benefits*`, `/api/admin/grocery-claims*`
    // deliberately return `None` here. These prefixes mix admin management with employee
    // self-service (`grocery-claims` POST is an employee action; `grocery-claims/{id}/review`
    // POST is admin; `my-assets/expenses` POST is employee). Gating them by method at the
    // middleware would either lock out employees or under-gate admins. Each handler
    // enforces the correct slug (`view-assets`/`manage-assets`,
    // `view-grocery-benefits`/`manage-grocery-benefits`/`view-my-grocery-benefits`)
    // before touching data, and those checks were verified in the QA sweep.
    None
}

/// Check WebSocket access after JWT validation in the handler.
pub fn ensure_ws_access(
    conn: &crate::db::Connection,
    claims: &JwtClaims,
    path: &str,
) -> Result<(), String> {
    let (org_id, is_super_admin) = crate::tenant::verify_tenant_session(conn, claims)?;
    crate::subscription_period::ensure_org_subscription_enforced(conn, org_id)?;

    let slug = if path.contains("/chat/ws") {
        "view-chat"
    } else if path.contains("/biometric/ws") {
        "view-attendance"
    } else {
        return Ok(());
    };

    let mut perms = load_user_permissions(conn, claims.sub, is_super_admin);
    if let Some(plan) = crate::plan_limits::load_org_plan(conn, org_id) {
        perms = crate::plan_limits::apply_plan_to_permissions(perms, &plan);
    }
    if !has_permission(&perms, slug) {
        return Err(format!("Missing permission: {}", slug));
    }
    Ok(())
}

/// Resolve super-admin from DB for handler-level checks.
pub fn effective_super_admin(
    conn: &crate::db::Connection,
    claims: &crate::models::user::JwtClaims,
    org_id: i64,
) -> bool {
    crate::tenant::user_is_super_admin(conn, claims.sub, org_id)
}

pub async fn rbac_middleware<B>(
    req: ServiceRequest,
    next: Next<B>,
) -> Result<ServiceResponse<EitherBody<BoxBody, B>>, Error>
where
    B: MessageBody + 'static,
{
    if *req.method() == Method::OPTIONS {
        let res = next.call(req).await?;
        return Ok(res.map_into_right_body());
    }

    let path = req.path().to_string();
    if !path.starts_with("/api/admin") {
        let res = next.call(req).await?;
        return Ok(res.map_into_right_body());
    }

    // WebSocket and file downloads authenticate via ?token= in the handler.
    if path.ends_with("/ws") || path.starts_with("/api/admin/files/") {
        let res = next.call(req).await?;
        return Ok(res.map_into_right_body());
    }

    // Always return HttpResponse (not Err) so outer CORS middleware can attach
    // Access-Control-* headers. Returning Err(ErrorUnauthorized) produced plain
    // 401s without CORS, which browsers surface as a misleading CORS failure
    // when the SPA calls the API cross-origin (e.g. hrm.hoteldaddy.in → hrm-api).
    let claims = match extract_claims(&req) {
        Ok(c) => c,
        Err(e) => {
            let body = HttpResponse::Unauthorized().json(ApiError::new(&e.to_string()));
            return Ok(req.into_response(body.map_into_boxed_body()).map_into_left_body());
        }
    };

    let Some(pool) = req.app_data::<actix_web::web::Data<DbPool>>() else {
        let body = HttpResponse::Forbidden().json(ApiError::new("Server configuration error"));
        return Ok(req.into_response(body.map_into_boxed_body()).map_into_left_body());
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => {
            let body = HttpResponse::Forbidden().json(ApiError::new("Database unavailable"));
            return Ok(req.into_response(body.map_into_boxed_body()).map_into_left_body());
        }
    };

    let (org_id, is_super_admin) = match crate::tenant::verify_tenant_session(&conn, &claims) {
        Ok(v) => v,
        Err(msg) => {
            let body = HttpResponse::Forbidden().json(ApiError::new(&msg));
            return Ok(req.into_response(body.map_into_boxed_body()).map_into_left_body());
        }
    };

    if let Err(msg) = crate::subscription_period::ensure_org_subscription_enforced(&conn, org_id) {
        let body = HttpResponse::Forbidden().json(ApiError::new(&msg));
        return Ok(req.into_response(body.map_into_boxed_body()).map_into_left_body());
    }

    if let Some(slug) = required_permission(req.method(), &path) {
        let mut perms = load_user_permissions(&conn, claims.sub, is_super_admin);
        if let Some(plan) = crate::plan_limits::load_org_plan(&conn, org_id) {
            perms = crate::plan_limits::apply_plan_to_permissions(perms, &plan);
        }
        if !permission_satisfied(&perms, slug) {
            let body = HttpResponse::Forbidden().json(ApiError::new(&format!(
                "Missing permission: {}",
                slug
            )));
            return Ok(req.into_response(body.map_into_boxed_body()).map_into_left_body());
        }
    }

    let res = next.call(req).await?;
    Ok(res.map_into_right_body())
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::http::Method;

    #[test]
    fn has_permission_wildcard_and_exact() {
        assert!(has_permission(&["*".into()], "view-users"));
        assert!(has_permission(&["view-users".into()], "view-users"));
        assert!(!has_permission(&["view-users".into()], "delete-users"));
    }

    #[test]
    fn permission_satisfied_leave_aliases() {
        let manage = vec!["manage-leave-requests".into()];
        assert!(permission_satisfied(&manage, "approve-leave-requests"));
        assert!(permission_satisfied(&manage, "reject-leave-requests"));

        let approve = vec!["approve-leave-requests".into()];
        assert!(permission_satisfied(&approve, "manage-leave-requests"));
    }

    #[test]
    fn required_permission_users_list() {
        assert_eq!(
            required_permission(&Method::GET, "/api/admin/users/list"),
            Some("view-users")
        );
        assert_eq!(
            required_permission(&Method::POST, "/api/admin/users"),
            Some("create-users")
        );
    }

    #[test]
    fn required_permission_public_onboarding_none() {
        assert_eq!(
            required_permission(&Method::POST, "/api/onboarding/complete"),
            None
        );
    }

    #[test]
    fn required_permission_health_not_admin() {
        assert_eq!(required_permission(&Method::GET, "/api/health"), None);
    }
}
