use actix_multipart::Multipart;
use actix_web::{web, HttpRequest, HttpResponse};
use crate::branch_scope::{
    self, append_users_branch_filter, ensure_center_allowed, replace_user_centers,
    resolve_branch_scope, user_in_branch_scope, BranchScope,
};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::user::{User, CreateUserRequest, UpdateUserRequest, UserSummary, ReportingManagerSummary};
use crate::storage;
use crate::tenant::{
    department_in_organization, designation_in_organization, org_id_from_claims,
    role_in_organization, user_in_organization,
};
use futures_util::StreamExt;
use std::collections::HashMap;

fn actor_branch_scope(
    conn: &crate::db::Connection,
    claims: &crate::models::user::JwtClaims,
) -> BranchScope {
    let org_id = org_id_from_claims(claims);
    let is_sa = crate::tenant::user_is_super_admin(conn, claims.sub, org_id);
    let (permissions, _) = crate::plan_limits::resolve_effective_permissions(
        conn,
        org_id,
        crate::middleware::rbac::load_user_permissions(conn, claims.sub, is_sa),
    );
    resolve_branch_scope(conn, claims.sub, org_id, &permissions, is_sa)
}

fn work_location_center_id(work_location: Option<&str>) -> Option<i64> {
    branch_scope::parse_center_id(work_location)
}

fn departments_map(
    conn: &crate::db::Connection,
    org_id: i64,
) -> HashMap<i64, crate::models::department::Department> {
    conn.prepare("SELECT * FROM departments WHERE organization_id = ?1")
        .ok()
        .map(|stmt| {
            stmt.query_map([org_id], crate::models::department::Department::from_row)
                .into_iter()
                .map(|d| (d.id, d))
                .collect()
        })
        .unwrap_or_default()
}

fn designations_map(
    conn: &crate::db::Connection,
    org_id: i64,
) -> HashMap<i64, crate::models::designation::Designation> {
    conn.prepare("SELECT * FROM designations WHERE organization_id = ?1")
        .ok()
        .map(|stmt| {
            stmt.query_map([org_id], crate::models::designation::Designation::from_row)
                .into_iter()
                .map(|d| (d.id, d))
                .collect()
        })
        .unwrap_or_default()
}

fn load_user_summary(conn: &crate::db::Connection, user_id: i64, org_id: i64) -> Option<UserSummary> {
    let user = conn
        .query_row(
            "SELECT * FROM users WHERE id = ?1 AND organization_id = ?2 AND deleted_at IS NULL",
            crate::params![user_id, org_id],
            User::from_row,
        )
        .ok()?;
    let mut summary = user.to_summary();
    if let Some(dept_id) = summary.department_id {
        summary.department = conn
            .query_row(
                "SELECT * FROM departments WHERE id = ?1 AND organization_id = ?2",
                crate::params![dept_id, org_id],
                crate::models::department::Department::from_row,
            )
            .ok();
    }
    if let Some(desg_id) = summary.designation_id {
        summary.designation = conn
            .query_row(
                "SELECT * FROM designations WHERE id = ?1 AND organization_id = ?2",
                crate::params![desg_id, org_id],
                crate::models::designation::Designation::from_row,
            )
            .ok();
    }
    let stmt = conn
        .prepare("SELECT r.* FROM roles r JOIN role_user ru ON r.id = ru.role_id WHERE ru.user_id = ?1")
        .ok()?;
    let roles: Vec<crate::models::role::Role> = stmt
        .query_map([user_id], crate::models::role::Role::from_row)
        ;
    summary.roles = Some(roles);
    if let Some(rmid) = user.reporting_manager_id {
        summary.reporting_manager = conn
            .query_row(
                "SELECT id, name FROM users WHERE id = ?1 AND organization_id = ?2 AND deleted_at IS NULL",
                crate::params![rmid, org_id],
                |row| {
                    Ok(ReportingManagerSummary {
                        id: row.get_idx::<i64>(0)?,
                        name: row.get_idx::<String>(1)?,
                    })
                },
            )
            .ok();
    }
    Some(summary)
}

fn opt_i64(s: &str) -> Option<i64> {
    if s.trim().is_empty() {
        None
    } else {
        s.trim().parse().ok()
    }
}

fn parse_roles(raw: &str) -> Option<Vec<i64>> {
    let t = raw.trim();
    if t.is_empty() {
        return None;
    }
    if t.starts_with('[') {
        return serde_json::from_str(t).ok();
    }
    let ids: Vec<i64> = t.split(',').filter_map(|p| p.trim().parse().ok()).collect();
    if ids.is_empty() {
        None
    } else {
        Some(ids)
    }
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn normalize_string_field(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn employee_id_taken(
    conn: &crate::db::Connection,
    employee_id: &str,
    org_id: i64,
    exclude_user_id: Option<i64>,
) -> bool {
    match exclude_user_id {
        Some(uid) => conn
            .query_row(
                "SELECT 1 FROM users WHERE employee_id=?1 AND organization_id=?2 AND deleted_at IS NULL AND id!=?3",
                crate::params![employee_id, org_id, uid],
                |_| Ok(()),
            )
            .is_ok(),
        None => conn
            .query_row(
                "SELECT 1 FROM users WHERE employee_id=?1 AND organization_id=?2 AND deleted_at IS NULL",
                crate::params![employee_id, org_id],
                |_| Ok(()),
            )
            .is_ok(),
    }
}

/// Active users in an org cannot share the same email (case-insensitive).
fn email_taken(
    conn: &crate::db::Connection,
    email: &str,
    org_id: i64,
    exclude_user_id: Option<i64>,
) -> bool {
    let email = email.trim().to_lowercase();
    if email.is_empty() {
        return false;
    }
    match exclude_user_id {
        Some(uid) => conn
            .query_row(
                "SELECT 1 FROM users
                 WHERE lower(email) = ?1 AND organization_id = ?2 AND deleted_at IS NULL AND id != ?3",
                crate::params![email, org_id, uid],
                |_| Ok(()),
            )
            .is_ok(),
        None => conn
            .query_row(
                "SELECT 1 FROM users
                 WHERE lower(email) = ?1 AND organization_id = ?2 AND deleted_at IS NULL",
                crate::params![email, org_id],
                |_| Ok(()),
            )
            .is_ok(),
    }
}

/// GET /api/admin/users
pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let scope = actor_branch_scope(&conn, &claims);

    let query_string = req.query_string();
    let params: Vec<(String, String)> = serde_urlencoded::from_str(query_string).unwrap_or_default();
    let search = params.iter().find(|(k, _)| k == "search").map(|(_, v)| v.clone());
    let page: i64 = params
        .iter()
        .find(|(k, _)| k == "page")
        .and_then(|(_, v)| v.parse().ok())
        .unwrap_or(1);
    let per_page: i64 = params
        .iter()
        .find(|(k, _)| k == "per_page")
        .and_then(|(_, v)| v.parse().ok())
        .unwrap_or(15);
    let offset = (page - 1) * per_page;

    let mut where_sql =
        "WHERE u.deleted_at IS NULL AND u.organization_id = ?1".to_string();
    let mut bind: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    if let Some(ref s) = search {
        let idx = bind.len() + 1;
        where_sql.push_str(&format!(
            " AND (u.name LIKE ?{idx} OR u.email LIKE ?{idx})"
        ));
        bind.push(crate::db::into_param_value(format!("%{s}%")));
    }
    append_users_branch_filter(&mut where_sql, &mut bind, &scope, "u");

    let total: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM users u {where_sql}"),
            &bind,
            |row| row.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    let limit_idx = bind.len() + 1;
    let offset_idx = bind.len() + 2;
    let sql = format!(
        "SELECT u.* FROM users u {where_sql} ORDER BY u.created_at DESC LIMIT ?{limit_idx} OFFSET ?{offset_idx}"
    );
    bind.push(crate::db::into_param_value(per_page));
    bind.push(crate::db::into_param_value(offset));

    let depts = departments_map(&conn, org_id);
    let desgs = designations_map(&conn, org_id);

    let enrich_user = |user: User| -> serde_json::Value {
        let mut summary = user.to_summary();
        if let Some(dept_id) = summary.department_id {
            summary.department = depts.get(&dept_id).cloned();
        }
        if let Some(desg_id) = summary.designation_id {
            summary.designation = desgs.get(&desg_id).cloned();
        }
        serde_json::to_value(summary).unwrap_or(serde_json::Value::Null)
    };

    let users: Vec<serde_json::Value> = conn
        .prepare(&sql)
        .map(|stmt| {
            stmt.query_map(&bind, |row| User::from_row(row))
                .into_iter()
                .map(enrich_user)
                .collect()
        })
        .unwrap_or_default();

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "type": "success",
        "data": users,
        "total": total,
        "page": page,
        "per_page": per_page,
    }))
}

/// GET /api/admin/users/{id}
pub async fn show(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let user_id = path.into_inner();
    let scope = actor_branch_scope(&conn, &claims);
    if !user_in_branch_scope(&conn, user_id, org_id, &scope) {
        return branch_scope::forbidden_outside_branch();
    }
    match load_user_summary(&conn, user_id, org_id) {
        Some(summary) => {
            let mut value = serde_json::to_value(&summary).unwrap_or(serde_json::Value::Null);
            if let Some(obj) = value.as_object_mut() {
                obj.insert(
                    "managed_center_ids".into(),
                    serde_json::json!(branch_scope::load_user_center_ids(&conn, user_id, org_id)),
                );
            }
            HttpResponse::Ok().json(ApiResponse::success(value))
        }
        None => HttpResponse::NotFound().json(ApiError::new("User not found")),
    }
}

/// POST /api/admin/users
pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<CreateUserRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let scope = actor_branch_scope(&conn, &claims);
    if let Err(resp) = ensure_center_allowed(&scope, work_location_center_id(body.work_location.as_deref())) {
        return resp;
    }
    if let Some(ref ids) = body.managed_center_ids {
        for &cid in ids {
            if let Err(resp) = ensure_center_allowed(&scope, Some(cid)) {
                return resp;
            }
        }
    }

    let name = body.name.trim();
    let hr_managed = body.hr_managed;
    let employee_id = normalize_optional_string(body.employee_id.clone());
    let phone = normalize_optional_string(body.phone.clone());

    if name.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Name is required"));
    }

    let (email, password_plain, skip_welcome_email) = if hr_managed {
        if phone.as_ref().map(|p| p.is_empty()).unwrap_or(true)
            && employee_id.as_ref().map(|e| e.is_empty()).unwrap_or(true)
        {
            return HttpResponse::BadRequest().json(ApiError::new(
                "HR-managed employees need a phone number or employee ID",
            ));
        }
        let slug = employee_id
            .as_deref()
            .map(|s| {
                s.chars()
                    .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
                    .collect::<String>()
                    .to_lowercase()
            })
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| {
                format!(
                    "t{}",
                    uuid::Uuid::new_v4().simple().to_string().chars().take(12).collect::<String>()
                )
            });
        let email = format!("emp{slug}@hr-managed.local");
        let password_plain = format!(
            "hrm-{}-{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        (email, password_plain, true)
    } else {
        let email = body.email.trim().to_lowercase();
        if email.is_empty() || !email.contains('@') {
            return HttpResponse::BadRequest().json(ApiError::new("A valid email is required"));
        }
        if body.password.len() < 8 {
            return HttpResponse::BadRequest().json(ApiError::new("Password must be at least 8 characters"));
        }
        if let Some(ref confirm) = body.password_confirmation {
            if !confirm.is_empty() && confirm != &body.password {
                return HttpResponse::BadRequest().json(ApiError::new("Password confirmation does not match"));
            }
        }
        (email, body.password.clone(), false)
    };

    let exists = email_taken(&conn, &email, org_id, None);
    if exists {
        return HttpResponse::BadRequest().json(ApiError::new("A user with this email already exists"));
    }

    if let Err(msg) = crate::plan_limits::ensure_user_capacity(&conn, org_id) {
        return HttpResponse::BadRequest().json(ApiError::new(&msg));
    }

    if let Some(dept_id) = body.department_id {
        if !department_in_organization(&conn, dept_id, org_id) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("Department does not belong to this organization"));
        }
    }
    if let Some(desg_id) = body.designation_id {
        if !designation_in_organization(&conn, desg_id, org_id) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("Designation does not belong to this organization"));
        }
    }
    if let Some(ref role_ids) = body.role_ids {
        for role_id in role_ids {
            if !role_in_organization(&conn, *role_id, org_id) {
                return HttpResponse::BadRequest()
                    .json(ApiError::new("Role does not belong to this organization"));
            }
        }
    }
    if let Some(mid) = body.manager_id {
        if !user_in_organization(&conn, mid, org_id) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("Manager must be an active user in this organization"));
        }
    }
    if let Some(rmid) = body.reporting_manager_id {
        if !user_in_organization(&conn, rmid, org_id) {
            return HttpResponse::BadRequest().json(ApiError::new(
                "Reporting manager must be an active user in this organization",
            ));
        }
    }

    let hashed = match bcrypt::hash(&password_plain, 12) {
        Ok(h) => h,
        Err(_) => {
            return HttpResponse::InternalServerError()
                .json(ApiError::new("Failed to hash password"))
        }
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if let Some(ref eid) = employee_id {
        if employee_id_taken(&conn, eid, org_id, None) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("Employee ID is already assigned to another user"));
        }
    }

    let status = body
        .status
        .as_deref()
        .filter(|s| matches!(*s, "active" | "inactive" | "suspended"))
        .unwrap_or("active");

    let result = conn.execute(
        "INSERT INTO users (name, email, password, phone, department_id, designation_id, employment_type, is_external, hr_managed, employee_id, date_of_joining, work_location, status, organization_id, manager_id, reporting_manager_id, email_verified_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        crate::params![
            name, email, hashed, phone,
            body.department_id, body.designation_id,
            body.employment_type.as_deref().unwrap_or("full-time"),
            body.is_external as i64,
            hr_managed as i64,
            employee_id, body.date_of_joining, body.work_location,
            status,
            org_id,
            body.manager_id, body.reporting_manager_id,
        ],
    );

    match result {
        Ok(_) => {
            let user_id = conn.last_insert_rowid();

            // Prefer stable emp{id}@ placeholder when no employee_id was provided
            let final_email = if hr_managed && email.contains("@hr-managed.local") && employee_id.is_none() {
                let stable = format!("emp{user_id}@hr-managed.local");
                let taken: bool = conn
                    .query_row(
                        "SELECT COUNT(*) > 0 FROM users WHERE email = ?1 AND organization_id = ?2 AND id != ?3 AND deleted_at IS NULL",
                        crate::params![stable, org_id, user_id],
                        |row| row.get_idx::<i64>(0).map(|n| n > 0),
                    )
                    .unwrap_or(false);
                if !taken {
                    let _ = conn.execute(
                        "UPDATE users SET email = ?1 WHERE id = ?2",
                        crate::params![stable, user_id],
                    );
                    stable
                } else {
                    email.clone()
                }
            } else {
                email.clone()
            };

            // Assign roles if provided; otherwise default to Employee.
            let role_ids: Vec<i64> = match &body.role_ids {
                Some(ids) if !ids.is_empty() => ids.clone(),
                _ => crate::role_defaults::default_employee_role_id(&conn, org_id)
                    .into_iter()
                    .collect(),
            };
            for role_id in role_ids {
                if !role_in_organization(&conn, role_id, org_id) {
                    continue;
                }
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO role_user (user_id, role_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                    crate::params![user_id, role_id, &now, &now],
                );
            }
            crate::role_defaults::ensure_default_employee_role(&conn, org_id, user_id);

            if let Some(ref ids) = body.managed_center_ids {
                if let Err(e) = replace_user_centers(&conn, user_id, org_id, ids) {
                    return HttpResponse::BadRequest().json(ApiError::new(&e));
                }
            } else if let Some(cid) = work_location_center_id(body.work_location.as_deref()) {
                let _ = replace_user_centers(&conn, user_id, org_id, &[cid]);
            }

            let shift_from = body
                .date_of_joining
                .as_deref()
                .filter(|d| !d.is_empty())
                .map(|d| d.to_string())
                .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
            let _ = crate::shift_logic::assign_general_shift_to_user(&conn, user_id, &shift_from);
            crate::chat_department_channels::sync_user_department_channel(&conn, org_id, user_id);

            if !skip_welcome_email {
                let org_name: Option<String> = conn
                    .query_row(
                        "SELECT name FROM organizations WHERE id = ?1",
                        crate::params![org_id],
                        |row| row.get_idx::<String>(0),
                    )
                    .ok();
                let (text, html) = crate::user_lifecycle_email::render_welcome_email(
                    &body.name,
                    &final_email,
                    &password_plain,
                    org_name.as_deref(),
                );
                crate::tenant_email::send_tenant_email(
                    &conn,
                    org_id,
                    &final_email,
                    "Welcome — Your HRM login credentials",
                    text,
                    html,
                );
            }

            crate::workflow_logic::trigger(
                &conn,
                org_id,
                "user_created",
                &serde_json::json!({
                    "user_id": user_id,
                    "email": final_email,
                    "name": body.name,
                    "department_id": body.department_id,
                    "designation_id": body.designation_id,
                    "manager_id": body.manager_id,
                    "reporting_manager_id": body.reporting_manager_id,
                    "status": status,
                    "hr_managed": hr_managed,
                    "organization_id": org_id,
                    "created_by": claims.sub,
                }),
            );

            HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
                "id": user_id,
                "hr_managed": hr_managed,
                "message": if hr_managed {
                    "HR-managed employee created. They will not log in - use Manual Attendance and Leave Requests."
                } else {
                    "User created successfully"
                }
            })))
        }
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed to create user: {}", e))),
    }
}

/// PUT /api/admin/users/{id}
pub async fn update(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<UpdateUserRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let user_id = path.into_inner();

    if !user_in_organization(&conn, user_id, org_id) {
        return HttpResponse::NotFound().json(ApiError::new("User not found"));
    }

    let scope = actor_branch_scope(&conn, &claims);
    if !user_in_branch_scope(&conn, user_id, org_id, &scope) {
        return branch_scope::forbidden_outside_branch();
    }
    if let Err(resp) =
        ensure_center_allowed(&scope, work_location_center_id(body.work_location.as_deref()))
    {
        return resp;
    }
    if let Some(ref ids) = body.managed_center_ids {
        for &cid in ids {
            if let Err(resp) = ensure_center_allowed(&scope, Some(cid)) {
                return resp;
            }
        }
    }

    let previous_status: Option<String> = conn
        .query_row(
            "SELECT status FROM users WHERE id = ?1 AND organization_id = ?2",
            crate::params![user_id, org_id],
            |row| row.get_idx::<Option<String>>(0),
        )
        .ok()
        .flatten();

    if let Some(ref val) = body.name {
        if let Err(msg) = crate::validation::require_non_empty(val, "Name") {
            return HttpResponse::BadRequest().json(ApiError::new(&msg));
        }
    }
    if let Some(ref val) = body.email {
        if let Err(msg) = crate::validation::validate_email(val) {
            return HttpResponse::BadRequest().json(ApiError::new(&msg));
        }
        let email = val.trim().to_lowercase();
        if email_taken(&conn, &email, org_id, Some(user_id)) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("A user with this email already exists"));
        }
    }

    let currently_hr_managed: bool = conn
        .query_row(
            "SELECT COALESCE(hr_managed, 0) FROM users WHERE id = ?1",
            [user_id],
            |r| r.get_idx::<i64>(0),
        )
        .map(|v| v != 0)
        .unwrap_or(false);

    // Enable app login: hr_managed false requires real email + new password
    if body.hr_managed == Some(false) && currently_hr_managed {
        let new_email = body.email.as_deref().map(str::trim).unwrap_or("");
        if new_email.is_empty() || new_email.ends_with("@hr-managed.local") {
            return HttpResponse::BadRequest().json(ApiError::new(
                "Provide a real email to enable app login",
            ));
        }
        if let Err(msg) = crate::validation::validate_email(new_email) {
            return HttpResponse::BadRequest().json(ApiError::new(&msg));
        }
        let pwd = body.password.as_deref().unwrap_or("");
        if pwd.len() < 8 {
            return HttpResponse::BadRequest().json(ApiError::new(
                "Provide a password (min 8 characters) to enable app login",
            ));
        }
    }

    // Switch to HR-managed: need phone or employee_id on the user
    if body.hr_managed == Some(true) && !currently_hr_managed {
        let (phone, emp_id): (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT phone, employee_id FROM users WHERE id = ?1",
                [user_id],
                |r| Ok((r.get_idx::<Option<String>>(0)?, r.get_idx::<Option<String>>(1)?)),
            )
            .unwrap_or((None, None));
        let phone = body.phone.clone().or(phone).filter(|s| !s.trim().is_empty());
        let emp_id = body
            .employee_id
            .clone()
            .or(emp_id)
            .filter(|s| !s.trim().is_empty());
        if phone.is_none() && emp_id.is_none() {
            return HttpResponse::BadRequest().json(ApiError::new(
                "Set a phone number or employee ID before marking as HR-managed",
            ));
        }
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Build dynamic UPDATE query
    let mut sets = Vec::new();
    let mut params: Vec<crate::db::ParamValue> = Vec::new();
    let mut idx = 1;

    macro_rules! maybe_set {
        ($field:ident, $col:expr) => {
            if let Some(ref val) = body.$field {
                sets.push(format!("{} = ?{}", $col, idx));
                params.push(crate::db::into_param_value(val.clone()));
                idx += 1;
            }
        };
    }

    maybe_set!(name, "name");
    if let Some(ref val) = body.email {
        let email = val.trim().to_lowercase();
        sets.push(format!("email = ?{}", idx));
        params.push(crate::db::into_param_value(email));
        idx += 1;
    }
    maybe_set!(phone, "phone");
    maybe_set!(avatar, "avatar");
    maybe_set!(photo, "photo");
    maybe_set!(bio, "bio");
    maybe_set!(date_of_birth, "date_of_birth");
    maybe_set!(gender, "gender");
    maybe_set!(address, "address");
    maybe_set!(city, "city");
    maybe_set!(state, "state");
    maybe_set!(country, "country");
    maybe_set!(postal_code, "postal_code");
    maybe_set!(employment_type, "employment_type");
    maybe_set!(status, "status");
    maybe_set!(work_location, "work_location");
    maybe_set!(is_external, "is_external");
    maybe_set!(work_state, "work_state");
    maybe_set!(tax_regime, "tax_regime");
    maybe_set!(date_of_joining, "date_of_joining");
    maybe_set!(date_of_exit, "date_of_exit");

    if let Some(hm) = body.hr_managed {
        sets.push(format!("hr_managed = ?{}", idx));
        params.push(crate::db::into_param_value(if hm { 1_i64 } else { 0_i64 }));
        idx += 1;
        if hm {
            // Rotate password so any old credentials stop working
            let random_pwd = format!(
                "hrm-{}-{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            );
            if let Ok(hashed) = bcrypt::hash(&random_pwd, 12) {
                sets.push(format!("password = ?{}", idx));
                params.push(crate::db::into_param_value(hashed));
                idx += 1;
            }
        }
    }

    if body.hr_managed == Some(false) && currently_hr_managed {
        if let Some(ref pwd) = body.password {
            if pwd.len() >= 8 {
                match bcrypt::hash(pwd, 12) {
                    Ok(hashed) => {
                        sets.push(format!("password = ?{}", idx));
                        params.push(crate::db::into_param_value(hashed));
                        idx += 1;
                    }
                    Err(_) => {
                        return HttpResponse::InternalServerError()
                            .json(ApiError::new("Failed to hash password"));
                    }
                }
            }
        }
    }
    if body.employee_id.is_some() {
        let employee_id = normalize_optional_string(body.employee_id.clone());
        if let Some(ref eid) = employee_id {
            if employee_id_taken(&conn, eid, org_id, Some(user_id)) {
                return HttpResponse::BadRequest()
                    .json(ApiError::new("Employee ID is already assigned to another user"));
            }
        }
        sets.push(format!("employee_id = ?{}", idx));
        params.push(crate::db::into_param_value(employee_id));
        idx += 1;
    }
    maybe_set!(account_number, "account_number");
    maybe_set!(ifsc_code, "ifsc_code");
    maybe_set!(bank_name, "bank_name");
    maybe_set!(pan_number, "pan_number");
    maybe_set!(esi_number, "esi_number");
    maybe_set!(pf_number, "pf_number");
    maybe_set!(aadhar_number, "aadhar_number");
    maybe_set!(emergency_contact, "emergency_contact");

    if let Some(ref val) = body.account_type {
        sets.push(format!("account_type = ?{}", idx));
        params.push(crate::db::into_param_value(val.clone()));
        idx += 1;
    }

    if let Some(dept_id) = body.department_id {
        if !department_in_organization(&conn, dept_id, org_id) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("Department does not belong to this organization"));
        }
        sets.push(format!("department_id = ?{}", idx));
        params.push(crate::db::into_param_value(dept_id));
        idx += 1;
    }
    if let Some(desg_id) = body.designation_id {
        if !designation_in_organization(&conn, desg_id, org_id) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("Designation does not belong to this organization"));
        }
        sets.push(format!("designation_id = ?{}", idx));
        params.push(crate::db::into_param_value(desg_id));
        idx += 1;
    }

    if let Some(ref roles) = body.roles {
        for role_id in roles {
            if !role_in_organization(&conn, *role_id, org_id) {
                return HttpResponse::BadRequest()
                    .json(ApiError::new("Role does not belong to this organization"));
            }
        }
    }

    if let Some(mid) = body.manager_id {
        if mid == user_id || !user_in_organization(&conn, mid, org_id) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("Manager must be an active user in this organization"));
        }
        sets.push(format!("manager_id = ?{}", idx));
        params.push(crate::db::into_param_value(mid));
        idx += 1;
    }
    if let Some(rmid) = body.reporting_manager_id {
        if rmid == user_id || !user_in_organization(&conn, rmid, org_id) {
            return HttpResponse::BadRequest().json(ApiError::new(
                "Reporting manager must be an active user in this organization",
            ));
        }
        sets.push(format!("reporting_manager_id = ?{}", idx));
        params.push(crate::db::into_param_value(rmid));
        idx += 1;
    }

    if sets.is_empty() && body.roles.is_none() {
        return HttpResponse::BadRequest().json(ApiError::new("No fields to update"));
    }

    let now_for_roles = now.clone();

    if !sets.is_empty() {
        sets.push(format!("updated_at = ?{}", idx));
        params.push(crate::db::into_param_value(now));
        idx += 1;

        params.push(crate::db::into_param_value(user_id));
        params.push(crate::db::into_param_value(org_id));

        let sql = format!(
            "UPDATE users SET {} WHERE id = ?{} AND organization_id = ?{}",
            sets.join(", "),
            idx,
            idx + 1
        );

        if let Err(e) = conn.execute(&sql, &params) {
            return HttpResponse::BadRequest()
                .json(ApiError::new(&format!("Failed to update user: {}", e)));
        }
    } else if body.roles.is_some() {
        // Role-only update must still target a user in this org (checked above).
    }

    if let Some(ref roles) = body.roles {
        let _ = conn.execute(
            "DELETE FROM role_user WHERE user_id = ?1 AND role_id IN (SELECT id FROM roles WHERE organization_id = ?2)",
            crate::params![user_id, org_id],
        );
        for role_id in roles {
            if !role_in_organization(&conn, *role_id, org_id) {
                continue;
            }
            let _ = conn.execute(
                "INSERT OR IGNORE INTO role_user (user_id, role_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                crate::params![user_id, role_id, &now_for_roles, &now_for_roles],
            );
        }
    }

    if let Some(ref ids) = body.managed_center_ids {
        if let Err(e) = replace_user_centers(&conn, user_id, org_id, ids) {
            return HttpResponse::BadRequest().json(ApiError::new(&e));
        }
    }

    crate::chat_department_channels::sync_user_department_channel(&conn, org_id, user_id);

    if let Some(ref new_status) = body.status {
        if previous_status.as_deref() != Some(new_status.as_str()) {
            if let Some(email) = crate::tenant_email::user_email(&conn, user_id) {
                let name = crate::tenant_email::user_name(&conn, user_id)
                    .unwrap_or_else(|| "Employee".to_string());
                let (text, html) =
                    crate::user_lifecycle_email::render_status_changed_email(&name, new_status);
                crate::tenant_email::send_tenant_email(
                    &conn,
                    org_id,
                    &email,
                    "Account Status Updated",
                    text,
                    html,
                );
            }
        }
    }

    match load_user_summary(&conn, user_id, org_id) {
        Some(summary) => HttpResponse::Ok().json(ApiResponse::success(summary)),
        None => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "message": "User updated successfully"
        }))),
    }
}

/// POST /api/admin/users/{id} — multipart form (profile photo + fields)
pub async fn update_form(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    mut payload: Multipart,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let user_id = path.into_inner();
    if load_user_summary(&conn, user_id, org_id).is_none() {
        return HttpResponse::NotFound().json(ApiError::new("User not found"));
    }
    let scope = actor_branch_scope(&conn, &claims);
    if !user_in_branch_scope(&conn, user_id, org_id, &scope) {
        return branch_scope::forbidden_outside_branch();
    }

    let mut fields: HashMap<String, String> = HashMap::new();
    let mut managed_center_ids: Vec<i64> = Vec::new();
    let mut managed_centers_provided = false;
    let mut roles: Vec<i64> = Vec::new();
    let mut photo_data: Option<(Option<String>, Option<String>, Vec<u8>)> = None;
    let mut remove_photo = false;
    let mut doc_uploads: HashMap<String, (Option<String>, Option<String>, Vec<u8>)> = HashMap::new();

    while let Some(field) = payload.next().await {
        let mut field = match field {
            Ok(f) => f,
            Err(e) => {
                return HttpResponse::BadRequest().json(ApiError::new(&format!("Upload error: {}", e)));
            }
        };
        let name = field.name().unwrap_or("").to_string();
        let content_type = field.content_type().map(|ct| ct.to_string());
        let filename = field.content_disposition().and_then(|cd| cd.get_filename().map(|s| s.to_string()));

        let mut bytes = Vec::new();
        while let Some(chunk) = field.next().await {
            match chunk {
                Ok(data) => bytes.extend_from_slice(&data),
                Err(e) => {
                    return HttpResponse::BadRequest().json(ApiError::new(&format!("Upload error: {}", e)));
                }
            }
        }

        if name == "photo" {
            if !bytes.is_empty() {
                photo_data = Some((content_type, filename, bytes));
            }
        } else if matches!(name.as_str(), "doc_aadhaar" | "doc_pan" | "doc_id_proof" | "doc_other") {
            if !bytes.is_empty() {
                doc_uploads.insert(name, (content_type, filename, bytes));
            }
        } else if name == "remove_photo" {
            if let Ok(s) = String::from_utf8(bytes) {
                remove_photo = s.trim() == "1" || s.eq_ignore_ascii_case("true");
            }
        } else if name == "roles[]" {
            if let Ok(s) = String::from_utf8(bytes) {
                if let Ok(id) = s.trim().parse::<i64>() {
                    roles.push(id);
                }
            }
        } else if name == "roles" {
            if let Ok(s) = String::from_utf8(bytes) {
                if let Some(parsed) = parse_roles(&s) {
                    roles.extend(parsed);
                }
            }
        } else if name == "managed_center_ids[]" || name == "managed_center_ids" {
            managed_centers_provided = true;
            if let Ok(s) = String::from_utf8(bytes) {
                let trimmed = s.trim();
                if let Ok(id) = trimmed.parse::<i64>() {
                    managed_center_ids.push(id);
                } else if let Some(parsed) = parse_roles(trimmed) {
                    managed_center_ids.extend(parsed);
                }
            }
        } else if let Ok(text) = String::from_utf8(bytes) {
            fields.insert(name, text);
        }
    }

    if roles.is_empty() {
        if let Some(raw) = fields.get("roles") {
            if let Some(parsed) = parse_roles(raw) {
                roles = parsed;
            }
        }
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut sets = Vec::new();
    let mut params: Vec<crate::db::ParamValue> = Vec::new();
    let mut idx = 1;

    macro_rules! set_field {
        ($key:expr, $col:expr) => {
            if let Some(val) = fields.get($key) {
                sets.push(format!("{} = ?{}", $col, idx));
                params.push(crate::db::into_param_value(val.clone()));
                idx += 1;
            }
        };
    }

    set_field!("name", "name");
    if let Some(val) = fields.get("email") {
        let email = val.trim().to_lowercase();
        if let Err(msg) = crate::validation::validate_email(&email) {
            return HttpResponse::BadRequest().json(ApiError::new(&msg));
        }
        if email_taken(&conn, &email, org_id, Some(user_id)) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("A user with this email already exists"));
        }
        sets.push(format!("email = ?{}", idx));
        params.push(crate::db::into_param_value(email));
        idx += 1;
    }
    set_field!("phone", "phone");
    set_field!("date_of_birth", "date_of_birth");
    set_field!("gender", "gender");
    set_field!("address", "address");
    set_field!("city", "city");
    set_field!("state", "state");
    set_field!("country", "country");
    set_field!("postal_code", "postal_code");
    set_field!("bio", "bio");
    set_field!("employment_type", "employment_type");
    set_field!("work_state", "work_state");
    set_field!("tax_regime", "tax_regime");
    if fields.contains_key("employee_id") {
        let employee_id = normalize_string_field(fields.get("employee_id").map(|s| s.as_str()).unwrap_or(""));
        if let Some(ref eid) = employee_id {
            if employee_id_taken(&conn, eid, org_id, Some(user_id)) {
                return HttpResponse::BadRequest()
                    .json(ApiError::new("Employee ID is already assigned to another user"));
            }
        }
        sets.push(format!("employee_id = ?{}", idx));
        params.push(crate::db::into_param_value(employee_id));
        idx += 1;
    }
    set_field!("status", "status");
    set_field!("work_location", "work_location");
    set_field!("date_of_joining", "date_of_joining");
    set_field!("account_number", "account_number");
    set_field!("ifsc_code", "ifsc_code");
    set_field!("bank_name", "bank_name");
    set_field!("account_type", "account_type");
    set_field!("pan_number", "pan_number");
    set_field!("esi_number", "esi_number");
    set_field!("pf_number", "pf_number");
    set_field!("aadhar_number", "aadhar_number");
    set_field!("date_of_exit", "date_of_exit");
    set_field!("emergency_contact", "emergency_contact");

    if let Some(v) = fields.get("department_id").and_then(|s| opt_i64(s)) {
        sets.push(format!("department_id = ?{}", idx));
        params.push(crate::db::into_param_value(v));
        idx += 1;
    }
    if let Some(v) = fields.get("designation_id").and_then(|s| opt_i64(s)) {
        sets.push(format!("designation_id = ?{}", idx));
        params.push(crate::db::into_param_value(v));
        idx += 1;
    }
    if let Some(v) = fields.get("manager_id").and_then(|s| opt_i64(s)) {
        sets.push(format!("manager_id = ?{}", idx));
        params.push(crate::db::into_param_value(v));
        idx += 1;
    }
    if let Some(v) = fields.get("reporting_manager_id").and_then(|s| opt_i64(s)) {
        sets.push(format!("reporting_manager_id = ?{}", idx));
        params.push(crate::db::into_param_value(v));
        idx += 1;
    }
    if let Some(v) = fields.get("is_external") {
        let is_ext = v == "true" || v == "1";
        sets.push(format!("is_external = ?{}", idx));
        params.push(crate::db::into_param_value(if is_ext { 1 } else { 0 }));
        idx += 1;
    }
    if let Some(v) = fields.get("hr_managed") {
        let hm = v == "true" || v == "1";
        sets.push(format!("hr_managed = ?{}", idx));
        params.push(crate::db::into_param_value(if hm { 1 } else { 0 }));
        idx += 1;
        if hm {
            let random_pwd = format!(
                "hrm-{}-{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            );
            if let Ok(hashed) = bcrypt::hash(&random_pwd, 12) {
                sets.push(format!("password = ?{}", idx));
                params.push(crate::db::into_param_value(hashed));
                idx += 1;
            }
        } else if let Some(pwd) = fields.get("password").filter(|p| p.len() >= 8) {
            if let Ok(hashed) = bcrypt::hash(pwd, 12) {
                sets.push(format!("password = ?{}", idx));
                params.push(crate::db::into_param_value(hashed));
                idx += 1;
            }
        }
    }

    if remove_photo {
        if let Ok(old) = conn.query_row(
            "SELECT photo FROM users WHERE id=?1",
            [user_id],
            |r| r.get_idx::<Option<String>>(0),
        ) {
            if let Some(ref p) = old {
                storage::delete_photo_path(p);
            }
        }
        sets.push(format!("photo = ?{}", idx));
        params.push(crate::db::into_param_value(None::<String>));
        idx += 1;
    } else if let Some((mime, fname, data)) = photo_data {
        match storage::save_user_photo(&data, mime.as_deref(), fname.as_deref()) {
            Ok(path) => {
                if let Ok(old) = conn.query_row(
                    "SELECT photo FROM users WHERE id=?1",
                    [user_id],
                    |r| r.get_idx::<Option<String>>(0),
                ) {
                    if let Some(ref p) = old {
                        storage::delete_photo_path(p);
                    }
                }
                sets.push(format!("photo = ?{}", idx));
                params.push(crate::db::into_param_value(path));
                idx += 1;
            }
            Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&e)),
        }
    }

    for (col, (mime, fname, data)) in doc_uploads {
        match storage::save_user_document(&data, mime.as_deref(), fname.as_deref()) {
            Ok(path) => {
                if let Ok(old) = conn.query_row(
                    &format!("SELECT {col} FROM users WHERE id=?1"),
                    [user_id],
                    |r| r.get_idx::<Option<String>>(0),
                ) {
                    if let Some(ref p) = old {
                        storage::delete_photo_path(p);
                    }
                }
                sets.push(format!("{col} = ?{}", idx));
                params.push(crate::db::into_param_value(path));
                idx += 1;
            }
            Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&e)),
        }
    }

    if sets.is_empty() && roles.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("No fields to update"));
    }

    if let Some(v) = fields.get("department_id").and_then(|s| opt_i64(s)) {
        if !department_in_organization(&conn, v, org_id) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("Department does not belong to this organization"));
        }
    }
    if let Some(v) = fields.get("designation_id").and_then(|s| opt_i64(s)) {
        if !designation_in_organization(&conn, v, org_id) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("Designation does not belong to this organization"));
        }
    }
    for role_id in &roles {
        if !role_in_organization(&conn, *role_id, org_id) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("Role does not belong to this organization"));
        }
    }
    if let Err(resp) = ensure_center_allowed(
        &scope,
        work_location_center_id(fields.get("work_location").map(|s| s.as_str())),
    ) {
        return resp;
    }
    if managed_centers_provided {
        for &cid in &managed_center_ids {
            if let Err(resp) = ensure_center_allowed(&scope, Some(cid)) {
                return resp;
            }
        }
    }
    if let Some(raw) = fields.get("manager_id").and_then(|s| opt_i64(s)) {
        if raw == user_id || !user_in_organization(&conn, raw, org_id) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("Manager must be an active user in this organization"));
        }
    }
    if let Some(raw) = fields.get("reporting_manager_id").and_then(|s| opt_i64(s)) {
        if raw == user_id || !user_in_organization(&conn, raw, org_id) {
            return HttpResponse::BadRequest().json(ApiError::new(
                "Reporting manager must be an active user in this organization",
            ));
        }
    }

    if !sets.is_empty() {
        sets.push(format!("updated_at = ?{}", idx));
        let now_for_roles = now.clone();
        params.push(crate::db::into_param_value(now.clone()));
        idx += 1;
        params.push(crate::db::into_param_value(user_id));
        params.push(crate::db::into_param_value(org_id));

        let sql = format!("UPDATE users SET {} WHERE id = ?{} AND organization_id = ?{}", sets.join(", "), idx, idx + 1);
        if let Err(e) = conn.execute(&sql, &params) {
            return HttpResponse::BadRequest().json(ApiError::new(&format!("Failed to update user: {}", e)));
        }

        if !roles.is_empty() {
            let _ = conn.execute(
                "DELETE FROM role_user WHERE user_id = ?1 AND role_id IN (SELECT id FROM roles WHERE organization_id = ?2)",
                crate::params![user_id, org_id],
            );
            for role_id in &roles {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO role_user (user_id, role_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                    crate::params![user_id, role_id, &now_for_roles, &now_for_roles],
                );
            }
        }

        if fields.contains_key("department_id") {
            crate::chat_department_channels::sync_user_department_channel(&conn, org_id, user_id);
        }
    } else if !roles.is_empty() {
        let _ = conn.execute(
            "DELETE FROM role_user WHERE user_id = ?1 AND role_id IN (SELECT id FROM roles WHERE organization_id = ?2)",
            crate::params![user_id, org_id],
        );
        for role_id in &roles {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO role_user (user_id, role_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                crate::params![user_id, role_id, &now, &now],
            );
        }
    }

    if managed_centers_provided {
        if let Err(e) = replace_user_centers(&conn, user_id, org_id, &managed_center_ids) {
            return HttpResponse::BadRequest().json(ApiError::new(&e));
        }
    }

    match load_user_summary(&conn, user_id, org_id) {
        Some(summary) => HttpResponse::Ok().json(ApiResponse::success(summary)),
        None => HttpResponse::NotFound().json(ApiError::new("User not found")),
    }
}

/// DELETE /api/admin/users/{id}
pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let user_id = path.into_inner();
    let scope = actor_branch_scope(&conn, &claims);
    if !user_in_branch_scope(&conn, user_id, org_id, &scope) {
        return branch_scope::forbidden_outside_branch();
    }
    let now = chrono::Utc::now().naive_utc();

    match conn.execute(
        "UPDATE users SET deleted_at = ?1 WHERE id = ?2 AND organization_id = ?3",
        crate::params![now, user_id, org_id],
    ) {
        Ok(rows) if rows > 0 => {
            crate::chat_department_channels::sync_user_department_channel(&conn, org_id, user_id);
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
                "message": "User deleted successfully"
            })))
        }
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("User not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed to delete user: {}", e))),
    }
}

/// GET /api/admin/users/stats
pub async fn stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let scope = actor_branch_scope(&conn, &claims);
    let mut where_sql = "WHERE u.deleted_at IS NULL AND u.organization_id = ?1".to_string();
    let mut bind: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    append_users_branch_filter(&mut where_sql, &mut bind, &scope, "u");

    let total: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM users u {where_sql}"),
            &bind,
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let active: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM users u {where_sql} AND u.status = 'active'"),
            &bind,
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let on_leave: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM users u {where_sql} AND u.status = 'on-leave'"),
            &bind,
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "total": total,
        "active": active,
        "on_leave": on_leave,
        "inactive": total - active - on_leave,
    })))
}

/// GET /api/admin/users/list (simple list for dropdowns)
pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let scope = actor_branch_scope(&conn, &claims);
    let mut sql =
        "SELECT u.id, u.name, u.email, u.employee_id FROM users u WHERE u.deleted_at IS NULL AND u.organization_id = ?1".to_string();
    let mut bind: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    append_users_branch_filter(&mut sql, &mut bind, &scope, "u");
    // Avoid COALESCE(created_at, '') — Postgres TIMESTAMP cannot coalesce with ''.
    sql.push_str(" ORDER BY u.created_at DESC, u.id DESC");

    let users: Vec<serde_json::Value> = conn
        .prepare(&sql)
        .map(|stmt| {
            stmt.query_map(&bind, |row| {
                Ok(serde_json::json!({
                    "id": row.get_idx::<i64>(0)?,
                    "name": row.get_idx::<String>(1)?,
                    "email": row.get_idx::<String>(2)?,
                    "employee_id": row.get_idx::<Option<String>>(3)?,
                }))
            })
        })
        .unwrap_or_default();

    HttpResponse::Ok().json(ApiResponse::success(users))
}
