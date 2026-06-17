use actix_web::{web, HttpRequest, HttpResponse};
use std::sync::Arc;
use totp_rs::{Algorithm, Secret, TOTP};

use crate::config::AppConfig;
use crate::db::{DbPool, OptionalExt};
use crate::handlers::platform_audit::audit_from_request;
use crate::middleware::platform_auth::{
    decode_platform_pre_auth, extract_request_meta, generate_platform_token_with_session,
    get_platform_claims_from_request, require_role,
};
use crate::models::platform::{
    is_role_at_least, CreatePlatformAdminRequest, PlatformAdmin, PlatformTwoFactorDisableRequest,
    PlatformTwoFactorEnableRequest, ResetPlatformAdminPasswordRequest,
    UpdatePlatformAdminRequest,
};
use crate::models::{ApiError, ApiResponse};

const VALID_ROLES: [&str; 4] = ["owner", "admin", "support", "read_only"];

fn admin_to_value(admin: &PlatformAdmin) -> serde_json::Value {
    serde_json::json!({
        "id": admin.id,
        "name": admin.name,
        "email": admin.email,
        "role": admin.role,
        "is_active": admin.is_active,
        "totp_enabled": admin.totp_enabled,
        "last_login_at": admin.last_login_at,
    })
}

fn fetch_admin(conn: &crate::db::Connection, id: i64) -> Option<PlatformAdmin> {
    conn.query_row(
        "SELECT * FROM platform_admins WHERE id = ?1",
        crate::params![id],
        PlatformAdmin::from_row,
    )
    .ok()
}

/// GET /api/platform/team — list admins (admin+)
pub async fn team_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, name, email, password, role, is_active, totp_enabled, totp_secret, last_login_at
         FROM platform_admins ORDER BY id ASC",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let items: Vec<serde_json::Value> = stmt
        .query_map([], PlatformAdmin::from_row)
        .iter()
        .map(admin_to_value)
        .collect();
    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/platform/team — create admin (owner only)
pub async fn team_store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<CreatePlatformAdminRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "owner") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let name = body.name.trim().to_string();
    let email = body.email.trim().to_lowercase();
    if name.is_empty() || email.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Name and email required"));
    }
    if body.password.len() < 12 {
        return HttpResponse::BadRequest()
            .json(ApiError::new("Password must be at least 12 characters"));
    }
    let role = body
        .role
        .clone()
        .unwrap_or_else(|| "admin".to_string());
    if !VALID_ROLES.contains(&role.as_str()) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid role"));
    }

    if conn
        .query_row(
            "SELECT 1 FROM platform_admins WHERE email = ?1",
            crate::params![&email],
            |_| Ok(()),
        )
        .optional()
        .ok()
        .flatten()
        .is_some()
    {
        return HttpResponse::Conflict().json(ApiError::new("Email already in use"));
    }

    let hashed = match bcrypt::hash(&body.password, 12) {
        Ok(h) => h,
        Err(_) => {
            return HttpResponse::InternalServerError()
                .json(ApiError::new("Failed to hash password"))
        }
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if conn
        .execute(
            "INSERT INTO platform_admins (name, email, password, role, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
            crate::params![&name, &email, &hashed, &role, &now],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to create admin"));
    }
    let new_id = conn.last_insert_rowid();

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_admin.create",
        Some("platform_admin"),
        Some(new_id),
        Some(&email),
        None,
        serde_json::json!({"role": role}),
    );

    let item = fetch_admin(&conn, new_id);
    match item {
        Some(a) => HttpResponse::Created().json(ApiResponse::success(admin_to_value(&a))),
        None => HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"id": new_id}))),
    }
}

/// PATCH /api/platform/team/{id} — update name/role/is_active (owner only)
pub async fn team_update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<UpdatePlatformAdminRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "owner") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let id = path.into_inner();

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let Some(current) = fetch_admin(&conn, id) else {
        return HttpResponse::NotFound().json(ApiError::new("Platform admin not found"));
    };

    if current.role == "owner" && claims.sub != id {
        if let Some(false) = body.is_active {
            return HttpResponse::Forbidden().json(ApiError::new("Cannot disable an owner account"));
        }
    }
    if claims.sub == id {
        if let Some(false) = body.is_active {
            return HttpResponse::Forbidden()
                .json(ApiError::new("Cannot disable your own account"));
        }
        if let Some(role) = body.role.as_ref() {
            if role != &current.role {
                return HttpResponse::Forbidden()
                    .json(ApiError::new("Cannot change your own role"));
            }
        }
    }

    let new_name = body.name.clone().unwrap_or_else(|| current.name.clone());
    let new_role = body.role.clone().unwrap_or_else(|| current.role.clone());
    if !VALID_ROLES.contains(&new_role.as_str()) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid role"));
    }
    let new_active = body.is_active.unwrap_or(current.is_active);

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if conn
        .execute(
            "UPDATE platform_admins SET name = ?1, role = ?2, is_active = ?3, updated_at = ?4 WHERE id = ?5",
            crate::params![&new_name, &new_role, if new_active { 1i64 } else { 0i64 }, &now, id],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to update admin"));
    }

    if !new_active {
        let _ = conn.execute(
            "UPDATE platform_sessions SET revoked = 1 WHERE admin_id = ?1",
            crate::params![id],
        );
    }

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_admin.update",
        Some("platform_admin"),
        Some(id),
        Some(&current.email),
        None,
        serde_json::json!({
            "role_before": current.role,
            "role_after": new_role,
            "is_active_after": new_active,
        }),
    );

    let item = fetch_admin(&conn, id);
    match item {
        Some(a) => HttpResponse::Ok().json(ApiResponse::success(admin_to_value(&a))),
        None => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"updated": true}))),
    }
}

/// DELETE /api/platform/team/{id} — owner only, can't self-delete or delete last owner
pub async fn team_destroy(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match require_role(&req, "owner") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let id = path.into_inner();
    if claims.sub == id {
        return HttpResponse::Forbidden().json(ApiError::new("Cannot delete your own account"));
    }

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let Some(target) = fetch_admin(&conn, id) else {
        return HttpResponse::NotFound().json(ApiError::new("Platform admin not found"));
    };
    if target.role == "owner" {
        let owner_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM platform_admins WHERE role = 'owner' AND is_active = 1",
                [],
                |r| r.get_idx::<i64>(0),
            )
            .unwrap_or(0);
        if owner_count <= 1 {
            return HttpResponse::Forbidden()
                .json(ApiError::new("Cannot delete the last active owner"));
        }
    }

    if conn
        .execute("DELETE FROM platform_admins WHERE id = ?1", crate::params![id])
        .is_err()
    {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to delete admin"));
    }

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_admin.delete",
        Some("platform_admin"),
        Some(id),
        Some(&target.email),
        None,
        serde_json::json!({"role": target.role}),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"deleted": true})))
}

/// POST /api/platform/team/{id}/reset-password — owner only
pub async fn team_reset_password(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<ResetPlatformAdminPasswordRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "owner") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let id = path.into_inner();
    if body.new_password.len() < 12 {
        return HttpResponse::BadRequest()
            .json(ApiError::new("Password must be at least 12 characters"));
    }

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let Some(target) = fetch_admin(&conn, id) else {
        return HttpResponse::NotFound().json(ApiError::new("Platform admin not found"));
    };

    let hashed = match bcrypt::hash(&body.new_password, 12) {
        Ok(h) => h,
        Err(_) => {
            return HttpResponse::InternalServerError()
                .json(ApiError::new("Failed to hash password"))
        }
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "UPDATE platform_admins SET password = ?1, updated_at = ?2 WHERE id = ?3",
        crate::params![&hashed, &now, id],
    );
    let _ = conn.execute(
        "UPDATE platform_sessions SET revoked = 1 WHERE admin_id = ?1",
        crate::params![id],
    );

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_admin.password_reset",
        Some("platform_admin"),
        Some(id),
        Some(&target.email),
        None,
        serde_json::json!({}),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"reset": true})))
}

// ─────────── Sessions ───────────

/// GET /api/platform/sessions — list current admin's sessions
pub async fn sessions_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, jti, ip_address, user_agent, created_at, last_used_at, expires_at, revoked
         FROM platform_sessions WHERE admin_id = ?1 ORDER BY id DESC LIMIT 100",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    let current_jti = claims.jti.clone();
    let items: Vec<serde_json::Value> = stmt.query_map(crate::params![claims.sub], |row| {
        let jti: String = row.get_idx::<String>(1)?;
        Ok(serde_json::json!({
            "id": row.get_idx::<i64>(0)?,
            "ip_address": row.get_idx::<Option<String>>(2)?,
            "user_agent": row.get_idx::<Option<String>>(3)?,
            "created_at": row.get_idx::<Option<String>>(4)?,
            "last_used_at": row.get_idx::<Option<String>>(5)?,
            "expires_at": row.get_idx::<Option<String>>(6)?,
            "revoked": row.get_idx::<i64>(7)? != 0,
            "is_current": current_jti.as_ref().map(|c| c == &jti).unwrap_or(false),
        }))
    });

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// DELETE /api/platform/sessions/{id} — revoke own or any (owner)
pub async fn sessions_revoke(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let session_id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let row = conn
        .query_row(
            "SELECT admin_id, jti FROM platform_sessions WHERE id = ?1",
            crate::params![session_id],
            |r| Ok((r.get_idx::<i64>(0)?, r.get_idx::<String>(1)?)),
        )
        .ok();
    let Some((admin_id, jti)) = row else {
        return HttpResponse::NotFound().json(ApiError::new("Session not found"));
    };

    let role = claims.role.clone().unwrap_or_else(|| "admin".to_string());
    if admin_id != claims.sub && !is_role_at_least(&role, "owner") {
        return HttpResponse::Forbidden().json(ApiError::new("Cannot revoke another admin's session"));
    }

    let _ = conn.execute(
        "UPDATE platform_sessions SET revoked = 1 WHERE id = ?1",
        crate::params![session_id],
    );

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_admin.session_revoke",
        Some("platform_session"),
        Some(session_id),
        Some(&jti[..jti.len().min(12)]),
        None,
        serde_json::json!({"admin_id": admin_id}),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"revoked": true})))
}

// ─────────── 2FA ───────────

fn build_totp(secret_bytes: Vec<u8>, issuer: &str, account: &str) -> Result<TOTP, String> {
    TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        secret_bytes,
        Some(issuer.to_string()),
        account.to_string(),
    )
    .map_err(|e| format!("totp init failed: {e}"))
}

fn verify_totp_code(secret_b32: &str, code: &str, issuer: &str, account: &str) -> bool {
    let Ok(secret) = Secret::Encoded(secret_b32.to_string()).to_bytes() else {
        return false;
    };
    let totp = match build_totp(secret, issuer, account) {
        Ok(t) => t,
        Err(_) => return false,
    };
    totp.check_current(code).unwrap_or(false)
}

/// POST /api/platform/auth/2fa/setup — generate a fresh secret (not yet enabled)
pub async fn two_factor_setup(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let Some(admin) = fetch_admin(&conn, claims.sub) else {
        return HttpResponse::NotFound().json(ApiError::new("Admin not found"));
    };

    let secret = Secret::default();
    let secret_b32 = match secret.to_encoded() {
        Secret::Encoded(s) => s,
        _ => return HttpResponse::InternalServerError().json(ApiError::new("Failed to encode secret")),
    };
    let bytes = match Secret::Encoded(secret_b32.clone()).to_bytes() {
        Ok(b) => b,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Failed to decode secret")),
    };
    let issuer = "Raintech HRM";
    let totp = match build_totp(bytes, issuer, &admin.email) {
        Ok(t) => t,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&e)),
    };
    let otpauth_url = totp.get_url();

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "UPDATE platform_admins SET totp_secret = ?1, totp_enabled = 0, updated_at = ?2 WHERE id = ?3",
        crate::params![&secret_b32, &now, claims.sub],
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "secret": secret_b32,
        "otpauth_url": otpauth_url,
        "issuer": issuer,
        "account": admin.email,
    })))
}

/// POST /api/platform/auth/2fa/enable — verify code and enable
pub async fn two_factor_enable(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<PlatformTwoFactorEnableRequest>,
) -> HttpResponse {
    let claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let Some(admin) = fetch_admin(&conn, claims.sub) else {
        return HttpResponse::NotFound().json(ApiError::new("Admin not found"));
    };
    let Some(secret) = admin.totp_secret.as_deref() else {
        return HttpResponse::BadRequest()
            .json(ApiError::new("No secret set; call /2fa/setup first"));
    };
    if !verify_totp_code(secret, body.code.trim(), "Raintech HRM", &admin.email) {
        return HttpResponse::Unauthorized().json(ApiError::new("Invalid 2FA code"));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "UPDATE platform_admins SET totp_enabled = 1, updated_at = ?1 WHERE id = ?2",
        crate::params![&now, claims.sub],
    );

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_admin.2fa_enable",
        Some("platform_admin"),
        Some(claims.sub),
        Some(&admin.email),
        None,
        serde_json::json!({}),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"enabled": true})))
}

/// POST /api/platform/auth/2fa/disable — password (and optional code) required
pub async fn two_factor_disable(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<PlatformTwoFactorDisableRequest>,
) -> HttpResponse {
    let claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let Some(admin) = fetch_admin(&conn, claims.sub) else {
        return HttpResponse::NotFound().json(ApiError::new("Admin not found"));
    };
    let stored_hash = admin.password.replace("$2y$", "$2b$");
    if !bcrypt::verify(&body.password, &stored_hash).unwrap_or(false) {
        return HttpResponse::Unauthorized().json(ApiError::new("Invalid password"));
    }
    if admin.totp_enabled {
        let secret = admin.totp_secret.as_deref().unwrap_or("");
        let code = body.code.clone().unwrap_or_default();
        if !verify_totp_code(secret, code.trim(), "Raintech HRM", &admin.email) {
            return HttpResponse::Unauthorized().json(ApiError::new("Invalid 2FA code"));
        }
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "UPDATE platform_admins SET totp_secret = NULL, totp_enabled = 0, updated_at = ?1 WHERE id = ?2",
        crate::params![&now, claims.sub],
    );

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "platform_admin.2fa_disable",
        Some("platform_admin"),
        Some(claims.sub),
        Some(&admin.email),
        None,
        serde_json::json!({}),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"enabled": false})))
}

/// POST /api/platform/auth/2fa/verify — login step 2
pub async fn two_factor_verify(
    pool: web::Data<DbPool>,
    jwt_secret: web::Data<Arc<String>>,
    app_config: web::Data<Arc<AppConfig>>,
    req: HttpRequest,
    body: web::Json<crate::models::platform::PlatformTwoFactorVerifyRequest>,
) -> HttpResponse {
    let pre = match decode_platform_pre_auth(&body.pre_auth_token, &jwt_secret) {
        Ok(p) => p,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let Some(admin) = fetch_admin(&conn, pre.sub) else {
        return HttpResponse::Unauthorized().json(ApiError::new("Admin not found"));
    };
    if !admin.is_active {
        return HttpResponse::Forbidden().json(ApiError::new("Admin disabled"));
    }
    if !admin.totp_enabled {
        return HttpResponse::BadRequest().json(ApiError::new("2FA not enabled"));
    }
    let secret = admin.totp_secret.as_deref().unwrap_or("");
    if !verify_totp_code(secret, body.code.trim(), "Raintech HRM", &admin.email) {
        return HttpResponse::Unauthorized().json(ApiError::new("Invalid 2FA code"));
    }

    issue_login_session(
        &conn,
        &admin,
        &jwt_secret,
        app_config.jwt_expiration_hours,
        &req,
    )
}

pub fn issue_login_session(
    conn: &crate::db::Connection,
    admin: &PlatformAdmin,
    jwt_secret: &str,
    expiration_hours: u64,
    req: &HttpRequest,
) -> HttpResponse {
    let jti = uuid::Uuid::new_v4().to_string();
    let token = match generate_platform_token_with_session(
        admin.id,
        &admin.email,
        Some(&admin.role),
        Some(&jti),
        jwt_secret,
        expiration_hours,
    ) {
        Ok(t) => t,
        Err(_) => {
            return HttpResponse::InternalServerError()
                .json(ApiError::new("Failed to generate token"))
        }
    };

    let (ip, ua) = extract_request_meta(req);
    let now = chrono::Utc::now();
    let expires = now + chrono::Duration::hours(expiration_hours as i64);
    let _ = conn.execute(
        "INSERT INTO platform_sessions (admin_id, jti, ip_address, user_agent, created_at, last_used_at, expires_at, revoked)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, 0)",
        crate::params![
            admin.id,
            &jti,
            ip,
            ua,
            now.format("%Y-%m-%d %H:%M:%S").to_string(),
            expires.format("%Y-%m-%d %H:%M:%S").to_string()
        ],
    );
    let _ = conn.execute(
        "UPDATE platform_admins SET last_login_at = ?1 WHERE id = ?2",
        crate::params![now.format("%Y-%m-%d %H:%M:%S").to_string(), admin.id],
    );

    crate::handlers::platform_audit::record_audit(
        conn,
        admin.id,
        &admin.email,
        "platform_admin.login",
        Some("platform_admin"),
        Some(admin.id),
        Some(&admin.email),
        None,
        serde_json::json!({"ip": ip, "ua": ua}),
        ip.as_deref(),
        ua.as_deref(),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "token": token,
        "admin": {
            "id": admin.id,
            "name": admin.name,
            "email": admin.email,
            "role": admin.role,
            "totp_enabled": admin.totp_enabled,
        }
    })))
}
