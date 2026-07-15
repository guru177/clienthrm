use actix_web::{web, HttpRequest, HttpResponse};
use std::sync::Arc;

use crate::config::AppConfig;
use crate::db::DbPool;
use crate::handlers::platform_audit::audit_from_request;
use crate::handlers::platform_team::issue_login_session;
use crate::middleware::platform_auth::{
    generate_platform_pre_auth_token, get_platform_claims_from_request,
};
use crate::models::organization::DEFAULT_ORG_ID;
use crate::models::platform::{
    CreateOrganizationRequest, PlatformAdmin, PlatformLoginRequest, UpdateOrganizationRequest,
};
use crate::models::user::User;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::{
    load_org_slug, load_organization, normalize_org_slug, seed_new_organization_defaults,
    slug_available,
};

fn org_admin_contact(
    conn: &crate::db::Connection,
    org_id: i64,
) -> (Option<String>, Option<String>, Option<String>) {
    conn.query_row(
        "SELECT name, email, phone FROM users
         WHERE organization_id = ?1 AND is_super_admin = 1 AND deleted_at IS NULL
         ORDER BY id ASC LIMIT 1",
        [org_id],
        |row| {
            Ok((
                row.get_idx::<Option<String>>(0).ok().flatten(),
                row.get_idx::<Option<String>>(1).ok().flatten(),
                row.get_idx::<Option<String>>(2).ok().flatten(),
            ))
        },
    )
    .unwrap_or((None, None, None))
}

fn org_profile_fields(
    conn: &crate::db::Connection,
    org_id: i64,
) -> (Option<String>, Option<String>, Option<String>, Option<String>) {
    conn.query_row(
        "SELECT company_email, company_phone, country, timezone FROM organizations WHERE id = ?1",
        [org_id],
        |row| {
            Ok((
                row.get_idx::<Option<String>>(0).ok().flatten(),
                row.get_idx::<Option<String>>(1).ok().flatten(),
                row.get_idx::<Option<String>>(2).ok().flatten(),
                row.get_idx::<Option<String>>(3).ok().flatten(),
            ))
        },
    )
    .unwrap_or((None, None, None, None))
}

fn org_list_item(
    conn: &crate::db::Connection,
    row: &crate::db::Row,
    include_detail: bool,
) -> crate::db::Result<serde_json::Value> {
    let org_id: i64 = row.get("id")?;
    let name: String = row.get("name")?;
    let slug: String = row.get("slug")?;
    let status: String = row
        .get::<Option<String>>("status")?
        .unwrap_or_else(|| "active".to_string());
    let plan: String = row
        .get::<Option<String>>("plan")?
        .unwrap_or_else(|| "trial".to_string());
    let user_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE organization_id = ?1 AND deleted_at IS NULL",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let created_at: Option<String> = row.get("created_at").ok();
    let updated_at: Option<String> = row.get("updated_at").ok();
    let (company_email, company_phone, country, timezone) = org_profile_fields(conn, org_id);
    let (admin_name, admin_email, admin_phone) = org_admin_contact(conn, org_id);

    let email = company_email
        .clone()
        .filter(|v| !v.trim().is_empty())
        .or(admin_email.clone())
        .unwrap_or_default();
    let phone = company_phone
        .clone()
        .filter(|v| !v.trim().is_empty())
        .or(admin_phone.clone())
        .unwrap_or_default();

    let sub = crate::subscription_period::load_subscription_status(conn, org_id, &plan);

    let mut value = serde_json::json!({
        "id": org_id,
        "name": name,
        "slug": slug,
        "status": status,
        "plan": plan,
        "email": email,
        "phone": phone,
        "user_count": user_count,
        "created_at": created_at,
        "plan_started_at": sub.plan_started_at,
        "plan_expires_at": sub.plan_expires_at,
        "billing_period": sub.billing_period,
        "days_remaining": sub.days_remaining,
        "subscription_expired": sub.subscription_expired,
    });

    if include_detail {
        value["country"] = serde_json::json!(country);
        value["timezone"] = serde_json::json!(timezone);
        value["updated_at"] = serde_json::json!(updated_at);
        value["admin_name"] = serde_json::json!(admin_name);
        value["admin_email"] = serde_json::json!(admin_email);
        value["admin_phone"] = serde_json::json!(admin_phone);
        value["company_email"] = serde_json::json!(company_email);
        value["company_phone"] = serde_json::json!(company_phone);
    }

    Ok(value)
}

/// POST /api/platform/auth/login
pub async fn login(
    pool: web::Data<DbPool>,
    jwt_secret: web::Data<Arc<String>>,
    app_config: web::Data<Arc<AppConfig>>,
    req: HttpRequest,
    body: web::Json<PlatformLoginRequest>,
) -> HttpResponse {
    if let Err(msg) = crate::rate_limit::limit_platform_login(&req, &body.email) {
        return HttpResponse::TooManyRequests().json(ApiError::new(&msg));
    }

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let admin = match conn.query_row(
        "SELECT * FROM platform_admins WHERE email = ?1",
        [body.email.trim()],
        PlatformAdmin::from_row,
    ) {
        Ok(a) => a,
        Err(_) => return HttpResponse::Unauthorized().json(ApiError::new("Invalid credentials")),
    };

    let stored_hash = admin.password.replace("$2y$", "$2b$");
    if !bcrypt::verify(&body.password, &stored_hash).unwrap_or(false) {
        return HttpResponse::Unauthorized().json(ApiError::new("Invalid credentials"));
    }

    if !admin.is_active {
        return HttpResponse::Forbidden()
            .json(ApiError::new("Account is disabled. Contact a platform owner."));
    }

    if admin.totp_enabled {
        let pre_token = match generate_platform_pre_auth_token(admin.id, &admin.email, &jwt_secret) {
            Ok(t) => t,
            Err(_) => {
                return HttpResponse::InternalServerError()
                    .json(ApiError::new("Failed to issue 2FA challenge"))
            }
        };
        return HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "requires_2fa": true,
            "pre_auth_token": pre_token,
            "admin": {
                "id": admin.id,
                "name": admin.name,
                "email": admin.email,
            }
        })));
    }

    issue_login_session(
        &conn,
        &admin,
        &jwt_secret,
        app_config.jwt_expiration_hours,
        &req,
    )
}

/// GET /api/platform/auth/me
pub async fn me(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let admin = match conn.query_row(
        "SELECT id, name, email, role, is_active, totp_enabled, last_login_at
         FROM platform_admins WHERE id = ?1",
        [claims.sub],
        |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
                "email": row.get_idx::<String>(2)?,
                "role": row.get_idx::<Option<String>>(3)?.unwrap_or_else(|| "admin".to_string()),
                "is_active": row.get_idx::<Option<i64>>(4)?.unwrap_or(1) != 0,
                "totp_enabled": row.get_idx::<Option<i64>>(5)?.unwrap_or(0) != 0,
                "last_login_at": row.get_idx::<Option<String>>(6)?,
            }))
        },
    ) {
        Ok(a) => a,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Platform admin not found")),
    };

    HttpResponse::Ok().json(ApiResponse::success(admin))
}

/// POST /api/platform/auth/logout — revoke current session
pub async fn logout(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    if let Some(jti) = claims.jti.as_deref() {
        let _ = conn.execute(
            "UPDATE platform_sessions SET revoked = 1 WHERE jti = ?1 AND admin_id = ?2",
            crate::params![jti, claims.sub],
        );
    }
    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_admin.logout",
        Some("platform_admin"),
        Some(claims.sub),
        Some(&claims.email),
        None,
        serde_json::json!({}),
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"ok": true})))
}

/// GET /api/platform/dashboard/stats
pub async fn dashboard_stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let total_orgs: i64 = conn
        .query_row("SELECT COUNT(*) FROM organizations", [], |r| r.get_idx::<i64>(0))
        .unwrap_or(0);
    let active_orgs: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM organizations WHERE status = 'active'",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let total_users: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE deleted_at IS NULL",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "total_organizations": total_orgs,
        "active_organizations": active_orgs,
        "total_users": total_users,
    })))
}

/// GET /api/platform/users
pub async fn users_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let stmt = match conn.prepare(
        "SELECT u.id, u.name, u.email, u.status, u.is_super_admin, u.organization_id,
                o.name AS organization_name, o.slug AS organization_slug, u.created_at
         FROM users u
         INNER JOIN organizations o ON o.id = u.organization_id
         WHERE u.deleted_at IS NULL
         ORDER BY u.id DESC",
    ) {
        Ok(s) => s,
        Err(e) => {
            return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}")))
        }
    };

    let items: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
                "email": row.get_idx::<String>(2)?,
                "status": row.get_idx::<String>(3)?,
                "is_super_admin": row.get_idx::<i64>(4)? != 0,
                "organization_id": row.get_idx::<i64>(5)?,
                "organization_name": row.get_idx::<String>(6)?,
                "organization_slug": row.get_idx::<String>(7)?,
                "created_at": row.get_idx::<Option<String>>(8)?,
            }))
        });

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// GET /api/platform/ip-tracking — live company admins with app open (last 15 min)
pub async fn ip_tracking_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let stmt = match conn.prepare(
        "SELECT u.id, u.name, u.email, o.name AS organization_name, o.slug AS organization_slug,
                p.ip_address, p.latitude, p.longitude, p.city, p.region, p.country,
                p.accuracy_meters, p.last_active_at
         FROM user_presence p
         JOIN users u ON u.id = p.user_id
         JOIN organizations o ON o.id = p.organization_id
         WHERE u.is_super_admin = 1
           AND u.deleted_at IS NULL
           AND o.status != 'deleted'
           AND p.last_active_at >= datetime('now', '-15 minutes')
         ORDER BY p.last_active_at DESC",
    ) {
        Ok(s) => s,
        Err(e) => {
            return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}")))
        }
    };

    let users: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            let latitude: Option<f64> = row.get_idx::<Option<f64>>(6)?;
            let longitude: Option<f64> = row.get_idx::<Option<f64>>(7)?;
            let has_location = latitude.is_some() && longitude.is_some();
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
                "email": row.get_idx::<String>(2)?,
                "organization_name": row.get_idx::<String>(3)?,
                "organization_slug": row.get_idx::<String>(4)?,
                "ip_address": row.get_idx::<Option<String>>(5)?,
                "latitude": latitude,
                "longitude": longitude,
                "city": row.get_idx::<Option<String>>(8)?,
                "region": row.get_idx::<Option<String>>(9)?,
                "country": row.get_idx::<Option<String>>(10)?,
                "accuracy_meters": row.get_idx::<Option<f64>>(11)?,
                "last_active_at": row.get_idx::<String>(12)?,
                "has_location": has_location,
            }))
        });

    let active_count = users.len() as i64;
    let without_location = users
        .iter()
        .filter(|u| u.get("has_location").and_then(|v| v.as_bool()) == Some(false))
        .count() as i64;
    let updated_at = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "users": users,
        "active_count": active_count,
        "without_location_count": without_location,
        "updated_at": updated_at,
    })))
}

/// GET /api/platform/organizations
pub async fn organizations_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let stmt = match conn.prepare(
        "SELECT id, name, slug, status, plan, created_at, updated_at
         FROM organizations WHERE status != 'deleted' ORDER BY id DESC",
    ) {
        Ok(s) => s,
        Err(e) => {
            return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}")))
        }
    };

    let items: Vec<serde_json::Value> = stmt
        .query_map([], |row| org_list_item(&conn, row, false));

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// GET /api/platform/organizations/{id}
pub async fn organizations_show(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let org_id = path.into_inner();
    match conn.query_row(
        "SELECT id, name, slug, status, plan, created_at, updated_at
         FROM organizations WHERE id = ?1 AND status != 'deleted'",
        [org_id],
        |row| org_list_item(&conn, row, true),
    ) {
        Ok(item) => HttpResponse::Ok().json(ApiResponse::success(item)),
        Err(_) => HttpResponse::NotFound().json(ApiError::new("Organization not found")),
    }
}

/// DELETE /api/platform/organizations/{id}
pub async fn organizations_destroy(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match crate::middleware::platform_auth::require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let org_id = path.into_inner();
    if org_id == DEFAULT_ORG_ID {
        return HttpResponse::Forbidden().json(ApiError::new("Default organization cannot be deleted"));
    }

    let exists = conn
        .query_row(
            "SELECT 1 FROM organizations WHERE id = ?1 AND status != 'deleted'",
            [org_id],
            |_| Ok(()),
        )
        .is_ok();
    if !exists {
        return HttpResponse::NotFound().json(ApiError::new("Organization not found"));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if conn
        .execute(
            "UPDATE users SET deleted_at = ?1, updated_at = ?1 WHERE organization_id = ?2 AND deleted_at IS NULL",
            crate::params![&now, org_id],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to delete organization users"));
    }

    let org_label: Option<String> = conn
        .query_row(
            "SELECT name FROM organizations WHERE id = ?1",
            [org_id],
            |r| r.get_idx::<String>(0),
        )
        .ok();
    match conn.execute(
        "UPDATE organizations
         SET status = 'deleted',
             slug = slug || '-deleted-' || id,
             updated_at = ?1
         WHERE id = ?2",
        crate::params![&now, org_id],
    ) {
        Ok(n) if n > 0 => {
            audit_from_request(
                &conn,
                &req,
                claims.sub,
                &claims.email,
                "organization.delete",
                Some("organization"),
                Some(org_id),
                org_label.as_deref(),
                Some(org_id),
                serde_json::json!({}),
            );
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "deleted": true })))
        }
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Organization not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}

/// POST /api/platform/organizations
pub async fn organizations_store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<CreateOrganizationRequest>,
) -> HttpResponse {
    let claims = match crate::middleware::platform_auth::require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let name = body.name.trim();
    if name.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Organization name is required"));
    }

    let slug = normalize_org_slug(&body.slug);
    if slug.len() < 2 {
        return HttpResponse::BadRequest().json(ApiError::new("Slug must be at least 2 characters"));
    }
    if !slug_available(&conn, &slug) {
        return HttpResponse::Conflict().json(ApiError::new("Slug already taken"));
    }

    let admin_email = body.admin_email.trim();
    if admin_email.is_empty() || body.admin_password.len() < 8 {
        return HttpResponse::BadRequest()
            .json(ApiError::new("Valid admin email and password (min 8 chars) required"));
    }

    let plan = body
        .plan
        .as_deref()
        .filter(|p| !p.is_empty())
        .unwrap_or("trial");
    if !crate::plan_limits::plan_slug_exists(&conn, plan) {
        return HttpResponse::BadRequest().json(ApiError::new(&format!(
            "Unknown subscription plan '{}'. Choose an active plan from the catalog.",
            plan
        )));
    }
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let hashed = match bcrypt::hash(&body.admin_password, 12) {
        Ok(h) => h,
        Err(_) => {
            return HttpResponse::InternalServerError().json(ApiError::new("Failed to hash password"))
        }
    };

    let admin_name = body.admin_name.trim().to_string();
    let billing_period = crate::subscription_period::billing_period_for_plan(&conn, plan);
    let started = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let expires = crate::subscription_period::compute_expires_at(&billing_period, chrono::Utc::now())
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());

    let tx = match conn.unchecked_transaction() {
        Ok(t) => t,
        Err(_) => {
            return HttpResponse::InternalServerError()
                .json(ApiError::new("Failed to start transaction"));
        }
    };

    let tx_body = (|| -> crate::db::Result<(i64, i64)> {
        tx.execute(
            "INSERT INTO organizations (name, slug, status, plan, created_at, updated_at)
             VALUES (?1, ?2, 'active', ?3, ?4, ?4)",
            crate::params![name, &slug, plan, &now],
        )?;
        let org_id = tx.last_insert_rowid();
        tx.execute(
            "UPDATE organizations SET plan_started_at = ?1, plan_expires_at = ?2, updated_at = ?1 WHERE id = ?3",
            crate::params![&started, expires, org_id],
        )?;
        tx.execute(
            "INSERT INTO users (name, email, password, organization_id, is_super_admin, email_verified_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            crate::params![admin_name, admin_email, hashed, org_id],
        )?;
        let user_id = tx.last_insert_rowid();
        Ok((org_id, user_id))
    })();

    let (org_id, admin_user_id) = match tx_body {
        Ok(ids) => {
            if let Err(_) = tx.commit() {
                return HttpResponse::InternalServerError()
                    .json(ApiError::new("Failed to commit organization"));
            }
            ids
        }
        Err(crate::db::DbError::Query(msg))
            if msg.contains("UNIQUE") || msg.contains("unique") =>
        {
            let _ = tx.rollback();
            return HttpResponse::Conflict().json(ApiError::new("Admin email could not be registered"));
        }
        Err(_) => {
            let _ = tx.rollback();
            return HttpResponse::InternalServerError()
                .json(ApiError::new("Failed to create organization"));
        }
    };

    seed_new_organization_defaults(&conn, org_id);
    crate::role_defaults::sync_role_defaults(&conn);
    let shift_from = now.get(0..10).unwrap_or(&now).to_string();
    let _ = crate::shift_logic::assign_general_shift_to_user(&conn, admin_user_id, &shift_from);

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "organization.create",
        Some("organization"),
        Some(org_id),
        Some(name),
        Some(org_id),
        serde_json::json!({"plan": plan, "slug": slug}),
    );

    match conn.query_row(
        "SELECT id, name, slug, status, plan, created_at, updated_at
         FROM organizations WHERE id = ?1",
        [org_id],
        |row| org_list_item(&conn, row, false),
    ) {
        Ok(item) => HttpResponse::Created().json(ApiResponse::success(item)),
        Err(_) => HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
            "id": org_id,
            "slug": slug,
        }))),
    }
}

/// PATCH /api/platform/organizations/{id}
pub async fn organizations_update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<UpdateOrganizationRequest>,
) -> HttpResponse {
    let claims = match crate::middleware::platform_auth::require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let org_id = path.into_inner();
    let current = conn.query_row(
        "SELECT name, status, plan FROM organizations WHERE id = ?1",
        [org_id],
        |row| Ok((row.get_idx::<String>(0)?, row.get_idx::<String>(1)?, row.get_idx::<String>(2)?)),
    );
    let Ok((cur_name, cur_status, cur_plan)) = current else {
        return HttpResponse::NotFound().json(ApiError::new("Organization not found"));
    };

    let name = body.name.as_deref().unwrap_or(&cur_name).trim().to_string();
    let status = body.status.as_deref().unwrap_or(&cur_status).trim().to_string();
    let plan = body.plan.as_deref().unwrap_or(&cur_plan).trim().to_string();

    if !matches!(status.as_str(), "active" | "suspended" | "trial") {
        return HttpResponse::BadRequest()
            .json(ApiError::new("Status must be active, suspended, or trial"));
    }
    if name.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Organization name is required"));
    }
    if !crate::plan_limits::plan_slug_exists(&conn, &plan) {
        return HttpResponse::BadRequest().json(ApiError::new(&format!(
            "Unknown subscription plan '{}'. Choose an active plan from the catalog.",
            plan
        )));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "UPDATE organizations SET name = ?1, status = ?2, plan = ?3, updated_at = ?4 WHERE id = ?5",
        crate::params![name, status, &plan, &now, org_id],
    ) {
        Ok(n) if n > 0 => {}
        Ok(_) => return HttpResponse::NotFound().json(ApiError::new("Organization not found")),
        Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }

    if body.renew_subscription == Some(true) {
        if let Err(e) = crate::subscription_period::renew_org_subscription(&conn, org_id, &plan) {
            return HttpResponse::BadRequest().json(ApiError::new(&format!("{e}")));
        }
        let amount = crate::handlers::platform_billing::invoice_amount_for_plan(&conn, &plan);
        let (started, expires): (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT plan_started_at, plan_expires_at FROM organizations WHERE id = ?1",
                [org_id],
                |row| Ok((row.get_idx::<Option<String>>(0)?, row.get_idx::<Option<String>>(1)?)),
            )
            .unwrap_or((None, None));
        crate::handlers::platform_billing::record_invoice(
            &conn,
            org_id,
            &plan,
            amount,
            "pending",
            started.as_deref(),
            expires.as_deref(),
            Some("Auto-created on subscription renew"),
            Some(claims.sub),
        );
    } else if body.plan.is_some() && plan.to_lowercase() != cur_plan.to_lowercase() {
        if let Err(e) = crate::subscription_period::assign_org_subscription(&conn, org_id, &plan) {
            return HttpResponse::BadRequest().json(ApiError::new(&format!("{e}")));
        }
        crate::role_defaults::sync_role_defaults(&conn);
    }

    if let Some(days) = body.extend_days {
        if !(1..=365).contains(&days) {
            return HttpResponse::BadRequest()
                .json(ApiError::new("extend_days must be between 1 and 365"));
        }
        if let Err(e) = crate::subscription_period::extend_org_subscription_days(&conn, org_id, days)
        {
            return HttpResponse::BadRequest().json(ApiError::new(&format!("{e}")));
        }
    }

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "organization.update",
        Some("organization"),
        Some(org_id),
        Some(&name),
        Some(org_id),
        serde_json::json!({
            "status_before": cur_status,
            "status_after": status,
            "plan_before": cur_plan,
            "plan_after": plan,
            "renew_subscription": body.renew_subscription.unwrap_or(false),
            "extend_days": body.extend_days,
        }),
    );

    match conn.query_row(
        "SELECT id, name, slug, status, plan, created_at, updated_at
         FROM organizations WHERE id = ?1",
        [org_id],
        |row| org_list_item(&conn, row, false),
    ) {
        Ok(item) => HttpResponse::Ok().json(ApiResponse::success(item)),
        Err(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"updated": true}))),
    }
}

/// POST /api/platform/organizations/{id}/impersonate — issue tenant JWT as org super admin
pub async fn organizations_impersonate(
    pool: web::Data<DbPool>,
    jwt_secret: web::Data<Arc<String>>,
    app_config: web::Data<Arc<AppConfig>>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let platform_claims = match crate::middleware::platform_auth::require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let org_id = path.into_inner();
    if load_organization(&conn, org_id).is_none() {
        return HttpResponse::NotFound().json(ApiError::new("Organization not found"));
    }

    let org_status: String = conn
        .query_row(
            "SELECT status FROM organizations WHERE id = ?1",
            [org_id],
            |r| r.get_idx::<String>(0),
        )
        .unwrap_or_else(|_| "active".to_string());
    if org_status == "suspended" {
        return HttpResponse::Forbidden().json(ApiError::new("Organization is suspended"));
    }
    if let Err(msg) = crate::subscription_period::ensure_org_subscription_enforced(&conn, org_id) {
        return HttpResponse::Forbidden().json(ApiError::new(&msg));
    }

    let user = conn
        .query_row(
            "SELECT * FROM users WHERE organization_id = ?1 AND is_super_admin = 1 AND deleted_at IS NULL
             ORDER BY id ASC LIMIT 1",
            [org_id],
            User::from_row,
        )
        .or_else(|_| {
            conn.query_row(
                "SELECT * FROM users WHERE organization_id = ?1 AND deleted_at IS NULL ORDER BY id ASC LIMIT 1",
                [org_id],
                User::from_row,
            )
        });

    let user = match user {
        Ok(u) => u,
        Err(_) => {
            return HttpResponse::NotFound()
                .json(ApiError::new("No users in this organization to impersonate"))
        }
    };

    let org_slug = load_org_slug(&conn, org_id);
    let token = match crate::middleware::auth::generate_impersonation_token(
        user.id,
        &user.email,
        org_id,
        &org_slug,
        user.is_super_admin,
        platform_claims.sub,
        false,
        &jwt_secret,
        app_config.jwt_expiration_hours,
    ) {
        Ok(t) => t,
        Err(_) => {
            return HttpResponse::InternalServerError()
                .json(ApiError::new("Failed to generate tenant token"))
        }
    };

    let refresh_token = uuid::Uuid::new_v4().to_string();
    let refresh_expires = (chrono::Utc::now() + chrono::Duration::days(7))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    let _ = conn.execute(
        "INSERT INTO jwt_refresh_tokens (user_id, token, expires_at, created_at, revoked)
         VALUES (?1, ?2, ?3, datetime('now'), 0)",
        crate::params![user.id, &refresh_token, &refresh_expires],
    );

    let (permissions, plan) = crate::plan_limits::resolve_effective_permissions(
        &conn,
        org_id,
        crate::middleware::rbac::load_user_permissions(&conn, user.id, user.is_super_admin),
    );
    let mut summary = user.to_summary();
    summary.organization = load_organization(&conn, org_id);

    let mut settings = std::collections::HashMap::new();
    if let Ok(stmt) = conn.prepare(
        "SELECT key, value FROM app_settings WHERE organization_id = ?1",
    ) {
        for (k, v) in stmt.query_map([org_id], |row| {
            Ok((
                row.get_idx::<String>(0)?,
                row.get_idx::<Option<String>>(1)?.unwrap_or_default(),
            ))
        }) {
            settings.insert(k, v);
        }
    }

    audit_from_request(
        &conn,
        &req,
        platform_claims.sub,
        &platform_claims.email,
        "organization.impersonate",
        Some("organization"),
        Some(org_id),
        Some(&user.email),
        Some(org_id),
        serde_json::json!({"as_user_id": user.id, "org_slug": org_slug}),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "token": token,
        "refresh_token": refresh_token,
        "user": summary,
        "permissions": permissions,
        "plan": plan,
        "settings": settings,
        "impersonated_by_platform_admin_id": platform_claims.sub,
        "impersonated_by_platform_admin_email": platform_claims.email,
        "organization_id": org_id,
        "org_slug": org_slug,
    })))
}
