//! Tenant user two-factor authentication (TOTP).

use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;
use std::sync::Arc;

use crate::config::AppConfig;
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};

#[derive(Debug, Deserialize)]
pub struct TwoFactorEnableRequest {
    pub code: String,
}

#[derive(Debug, Deserialize)]
pub struct TwoFactorDisableRequest {
    pub password: String,
    pub code: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TwoFactorVerifyLoginRequest {
    pub pre_auth_token: String,
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub recovery_code: Option<String>,
}

fn verify_and_consume_recovery_code(
    conn: &crate::db::Connection,
    user_id: i64,
    input: &str,
) -> Result<(), String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Recovery code required".into());
    }
    let stored: Option<String> = conn
        .query_row(
            "SELECT totp_recovery_codes FROM users WHERE id = ?1 AND COALESCE(totp_enabled, 0) = 1",
            [user_id],
            |row| row.get_idx::<Option<String>>(0),
        )
        .map_err(|_| "User not found".to_string())?;
    let Some(json) = stored else {
        return Err("No recovery codes on file".into());
    };
    let mut codes: Vec<String> = serde_json::from_str(&json).unwrap_or_default();
    let normalized = trimmed.to_ascii_lowercase();
    let pos = codes
        .iter()
        .position(|c| c.eq_ignore_ascii_case(trimmed) || c.to_ascii_lowercase() == normalized);
    let Some(idx) = pos else {
        return Err("Invalid recovery code".into());
    };
    codes.remove(idx);
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let updated = serde_json::to_string(&codes).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "UPDATE users SET totp_recovery_codes = ?1, updated_at = ?2 WHERE id = ?3",
        crate::params![&updated, &now, user_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn load_user_totp(
    conn: &crate::db::Connection,
    user_id: i64,
) -> Option<(String, String, bool, Option<String>)> {
    conn.query_row(
        "SELECT email, COALESCE(totp_secret, ''), COALESCE(totp_enabled, 0), totp_recovery_codes
         FROM users WHERE id = ?1 AND deleted_at IS NULL",
        [user_id],
        |row| {
            Ok((
                row.get_idx::<String>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<i64>(2)? != 0,
                row.get_idx::<Option<String>>(3)?,
            ))
        },
    )
    .ok()
}

fn ensure_setup_secret(conn: &crate::db::Connection, user_id: i64, email: &str) -> Result<String, String> {
    if let Some((_, secret, enabled, _)) = load_user_totp(conn, user_id) {
        if enabled {
            return Err("Two-factor authentication is already enabled".into());
        }
        if !secret.is_empty() {
            return Ok(secret);
        }
    }
    let secret_b32 = crate::totp_logic::new_totp_secret()?;
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE users SET totp_secret = ?1, totp_enabled = 0, updated_at = ?2 WHERE id = ?3",
        crate::params![&secret_b32, &now, user_id],
    )
    .map_err(|e| e.to_string())?;
    let _ = email;
    Ok(secret_b32)
}

/// GET /api/two-factor/qr-code
pub async fn qr_code(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let Some((email, _, _, _)) = load_user_totp(&conn, claims.sub) else {
        return HttpResponse::NotFound().json(ApiError::new("User not found"));
    };
    let secret = match ensure_setup_secret(&conn, claims.sub, &email) {
        Ok(s) => s,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let url = match crate::totp_logic::otpauth_url(&secret, &email) {
        Ok(u) => u,
        Err(msg) => return HttpResponse::InternalServerError().json(ApiError::new(&msg)),
    };
    let svg = match crate::totp_logic::qr_svg_for_url(&url) {
        Ok(s) => s,
        Err(msg) => return HttpResponse::InternalServerError().json(ApiError::new(&msg)),
    };
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "svg": svg,
        "url": url,
    })))
}

/// GET /api/two-factor/secret-key
pub async fn secret_key(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let Some((email, _, _, _)) = load_user_totp(&conn, claims.sub) else {
        return HttpResponse::NotFound().json(ApiError::new("User not found"));
    };
    let secret = match ensure_setup_secret(&conn, claims.sub, &email) {
        Ok(s) => s,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "secretKey": secret,
    })))
}

/// GET /api/two-factor/recovery-codes — returns masked placeholders when enabled
pub async fn recovery_codes(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let Some((_, _, enabled, stored)) = load_user_totp(&conn, claims.sub) else {
        return HttpResponse::NotFound().json(ApiError::new("User not found"));
    };
    if !enabled {
        return HttpResponse::Ok().json(ApiResponse::success(Vec::<String>::new()));
    }
    let codes: Vec<String> = stored
        .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|_| "********".to_string())
        .collect();
    HttpResponse::Ok().json(ApiResponse::success(codes))
}

/// GET /api/two-factor/status
pub async fn status(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let enabled = load_user_totp(&conn, claims.sub)
        .map(|(_, _, e, _)| e)
        .unwrap_or(false);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "enabled": enabled })))
}

/// POST /api/two-factor/enable
pub async fn enable(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<TwoFactorEnableRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let Some((email, secret, enabled, _)) = load_user_totp(&conn, claims.sub) else {
        return HttpResponse::NotFound().json(ApiError::new("User not found"));
    };
    if enabled {
        return HttpResponse::BadRequest().json(ApiError::new("2FA is already enabled"));
    }
    if secret.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Call setup endpoints first"));
    }
    if !crate::totp_logic::verify_totp_code(&secret, body.code.trim(), crate::totp_logic::TOTP_ISSUER, &email) {
        return HttpResponse::Unauthorized().json(ApiError::new("Invalid authentication code"));
    }

    let recovery: Vec<String> = (0..8)
        .map(|_| uuid::Uuid::new_v4().to_string().replace('-', ""))
        .collect();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let recovery_json = serde_json::to_string(&recovery).unwrap_or_else(|_| "[]".to_string());
    if conn
        .execute(
            "UPDATE users SET totp_enabled = 1, totp_recovery_codes = ?1, updated_at = ?2 WHERE id = ?3",
            crate::params![&recovery_json, &now, claims.sub],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to enable 2FA"));
    }

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "enabled": true,
        "recovery_codes": recovery,
    })))
}

/// POST /api/two-factor/disable
pub async fn disable(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<TwoFactorDisableRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let user = match conn.query_row(
        "SELECT password, email, COALESCE(totp_secret, ''), COALESCE(totp_enabled, 0) FROM users WHERE id = ?1",
        [claims.sub],
        |row| {
            Ok((
                row.get_idx::<String>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<String>(2)?,
                row.get_idx::<i64>(3)? != 0,
            ))
        },
    ) {
        Ok(u) => u,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("User not found")),
    };
    let (password_hash, email, secret, enabled) = user;
    let hash = password_hash.replace("$2y$", "$2b$");
    if !bcrypt::verify(&body.password, &hash).unwrap_or(false) {
        return HttpResponse::Unauthorized().json(ApiError::new("Invalid password"));
    }
    if enabled {
        let code = body.code.clone().unwrap_or_default();
        if !crate::totp_logic::verify_totp_code(&secret, code.trim(), crate::totp_logic::TOTP_ISSUER, &email) {
            return HttpResponse::Unauthorized().json(ApiError::new("Invalid authentication code"));
        }
    }
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_recovery_codes = NULL, updated_at = ?1 WHERE id = ?2",
        crate::params![&now, claims.sub],
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "enabled": false })))
}

/// POST /api/auth/2fa/verify — complete login after password step
pub async fn verify_login(
    pool: web::Data<DbPool>,
    jwt_secret: web::Data<Arc<String>>,
    app_config: web::Data<Arc<AppConfig>>,
    req: HttpRequest,
    body: web::Json<TwoFactorVerifyLoginRequest>,
) -> HttpResponse {
    let pre = match crate::middleware::auth::decode_tenant_pre_auth(&body.pre_auth_token, jwt_secret.as_str()) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let Some((email, secret, enabled, _)) = load_user_totp(&conn, pre.sub) else {
        return HttpResponse::Unauthorized().json(ApiError::new("User not found"));
    };
    if !enabled || secret.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("2FA not enabled"));
    }

    let verified = if let Some(ref recovery) = body.recovery_code {
        if recovery.trim().is_empty() {
            false
        } else {
            verify_and_consume_recovery_code(&conn, pre.sub, recovery).is_ok()
        }
    } else if !body.code.trim().is_empty() {
        crate::totp_logic::verify_totp_code(&secret, body.code.trim(), crate::totp_logic::TOTP_ISSUER, &email)
    } else {
        false
    };

    if !verified {
        return HttpResponse::Unauthorized().json(ApiError::new("Invalid authentication code"));
    }

    let user = match conn.query_row(
        "SELECT * FROM users WHERE id = ?1 AND deleted_at IS NULL",
        [pre.sub],
        crate::models::user::User::from_row,
    ) {
        Ok(u) => u,
        Err(_) => return HttpResponse::Unauthorized().json(ApiError::new("User not found")),
    };

    let client_ip = crate::presence::client_ip(&req);
    crate::handlers::auth::complete_login_after_auth(
        &conn,
        &user,
        &jwt_secret,
        &app_config,
        &client_ip,
    )
    .into_response()
}
