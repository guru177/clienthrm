use actix_web::{HttpRequest, Error};
use actix_web::error::ErrorUnauthorized;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation, Algorithm};
use std::sync::Arc;

use crate::db::DbPool;
use crate::models::platform::PlatformJwtClaims;

pub const PLATFORM_AUD: &str = "platform";
pub const PLATFORM_PRE_AUTH_AUD: &str = "platform_pre_auth";

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct PlatformPreAuthClaims {
    pub sub: i64,
    pub email: String,
    pub aud: String,
    pub exp: usize,
    pub iat: usize,
}

pub fn generate_platform_token(
    admin_id: i64,
    email: &str,
    secret: &str,
    expiration_hours: u64,
) -> Result<String, jsonwebtoken::errors::Error> {
    generate_platform_token_with_session(admin_id, email, None, None, secret, expiration_hours)
}

pub fn generate_platform_token_with_session(
    admin_id: i64,
    email: &str,
    role: Option<&str>,
    jti: Option<&str>,
    secret: &str,
    expiration_hours: u64,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = chrono::Utc::now();
    let exp = now + chrono::Duration::hours(expiration_hours as i64);
    let claims = PlatformJwtClaims {
        sub: admin_id,
        email: email.to_string(),
        aud: PLATFORM_AUD.to_string(),
        exp: exp.timestamp() as usize,
        iat: now.timestamp() as usize,
        jti: jti.map(|s| s.to_string()),
        role: role.map(|s| s.to_string()),
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

pub fn generate_platform_pre_auth_token(
    admin_id: i64,
    email: &str,
    secret: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = chrono::Utc::now();
    let exp = now + chrono::Duration::minutes(5);
    let claims = PlatformPreAuthClaims {
        sub: admin_id,
        email: email.to_string(),
        aud: PLATFORM_PRE_AUTH_AUD.to_string(),
        exp: exp.timestamp() as usize,
        iat: now.timestamp() as usize,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

pub fn decode_platform_pre_auth(token: &str, secret: &str) -> Result<PlatformPreAuthClaims, Error> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&[PLATFORM_PRE_AUTH_AUD]);
    let data = decode::<PlatformPreAuthClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|_| ErrorUnauthorized("Invalid or expired pre-auth token"))?;
    if data.claims.aud != PLATFORM_PRE_AUTH_AUD {
        return Err(ErrorUnauthorized("Invalid pre-auth token audience"));
    }
    Ok(data.claims)
}

fn decode_platform_claims(token: &str, secret: &str) -> Result<PlatformJwtClaims, Error> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&[PLATFORM_AUD]);
    let data = decode::<PlatformJwtClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|e| {
        log::warn!("Platform JWT validation failed: {}", e);
        ErrorUnauthorized("Invalid or expired platform token")
    })?;
    if data.claims.aud != PLATFORM_AUD {
        return Err(ErrorUnauthorized("Invalid platform token audience"));
    }
    Ok(data.claims)
}

/// Verify session row by jti (if present in claims) — supports force-logout from session list.
fn enforce_session_active(req: &HttpRequest, claims: &PlatformJwtClaims) -> Result<(), Error> {
    let Some(jti) = claims.jti.as_deref() else {
        return Ok(());
    };
    let pool = req
        .app_data::<actix_web::web::Data<DbPool>>()
        .ok_or_else(|| ErrorUnauthorized("Server configuration error"))?;
    let conn = pool
        .get()
        .map_err(|_| ErrorUnauthorized("Database error"))?;
    let active = conn
        .query_row(
            "SELECT 1 FROM platform_sessions WHERE jti = ?1 AND admin_id = ?2 AND revoked = 0",
            crate::params![jti, claims.sub],
            |_| Ok(()),
        )
        .is_ok();
    if !active {
        return Err(ErrorUnauthorized("Session has been revoked"));
    }
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "UPDATE platform_sessions SET last_used_at = ?1 WHERE jti = ?2",
        crate::params![&now, jti],
    );
    Ok(())
}

/// Optionally check that the admin is still active and has at least the required role.
fn enforce_admin_state(req: &HttpRequest, claims: &PlatformJwtClaims) -> Result<(), Error> {
    let pool = req
        .app_data::<actix_web::web::Data<DbPool>>()
        .ok_or_else(|| ErrorUnauthorized("Server configuration error"))?;
    let conn = pool
        .get()
        .map_err(|_| ErrorUnauthorized("Database error"))?;
    let row: Option<(i64, String)> = conn
        .query_row(
            "SELECT is_active, role FROM platform_admins WHERE id = ?1",
            crate::params![claims.sub],
            |r| Ok((r.get_idx::<i64>(0)?, r.get_idx::<String>(1)?)),
        )
        .ok();
    match row {
        Some((1, _)) => Ok(()),
        Some(_) => Err(ErrorUnauthorized("Platform admin is disabled")),
        None => Err(ErrorUnauthorized("Platform admin not found")),
    }
}

pub fn get_platform_claims_from_request(req: &HttpRequest) -> Result<PlatformJwtClaims, Error> {
    let jwt_secret = req
        .app_data::<actix_web::web::Data<Arc<String>>>()
        .ok_or_else(|| ErrorUnauthorized("Server configuration error"))?;
    let token = bearer_token(req.headers())?;
    let claims = decode_platform_claims(&token, jwt_secret)?;
    enforce_session_active(req, &claims)?;
    enforce_admin_state(req, &claims)?;
    Ok(claims)
}

/// Returns Ok if the caller's effective role is >= required role.
pub fn require_role(req: &HttpRequest, min_role: &str) -> Result<crate::models::platform::PlatformJwtClaims, Error> {
    let claims = get_platform_claims_from_request(req)?;
    let role = claims.role.clone().unwrap_or_else(|| "admin".to_string());
    if !crate::models::platform::is_role_at_least(&role, min_role) {
        return Err(ErrorUnauthorized(format!(
            "Requires '{min_role}' role or higher"
        )));
    }
    Ok(claims)
}

fn bearer_token(
    headers: &actix_web::http::header::HeaderMap,
) -> Result<String, Error> {
    let auth_header = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| ErrorUnauthorized("Missing Authorization header"))?;
    auth_header
        .strip_prefix("Bearer ")
        .map(|s| s.to_string())
        .ok_or_else(|| ErrorUnauthorized("Invalid Authorization header format"))
}

fn token_from_query(req: &HttpRequest) -> Option<String> {
    req.query_string().split('&').find_map(|pair| {
        let mut parts = pair.splitn(2, '=');
        if parts.next()? == "token" {
            parts.next().map(|t| t.to_string())
        } else {
            None
        }
    })
}

/// Bearer header first, then `?token=` query param (for img/download URLs).
pub fn get_platform_claims_from_request_or_query(req: &HttpRequest) -> Result<PlatformJwtClaims, Error> {
    let jwt_secret = req
        .app_data::<actix_web::web::Data<Arc<String>>>()
        .ok_or_else(|| ErrorUnauthorized("Server configuration error"))?;

    if let Ok(token) = bearer_token(req.headers()) {
        let claims = decode_platform_claims(&token, jwt_secret)?;
        enforce_session_active(req, &claims)?;
        enforce_admin_state(req, &claims)?;
        return Ok(claims);
    }

    let token = token_from_query(req).ok_or_else(|| ErrorUnauthorized("Missing token"))?;
    let claims = decode_platform_claims(&token, jwt_secret)?;
    enforce_session_active(req, &claims)?;
    enforce_admin_state(req, &claims)?;
    Ok(claims)
}

pub fn extract_request_meta(req: &HttpRequest) -> (Option<String>, Option<String>) {
    let ip = req
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| req.peer_addr().map(|a| a.ip().to_string()));
    let ua = req
        .headers()
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    (ip, ua)
}
