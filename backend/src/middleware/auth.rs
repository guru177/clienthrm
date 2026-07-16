use actix_web::error::ErrorUnauthorized;
use actix_web::{dev::ServiceRequest, Error, HttpRequest};
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use std::sync::Arc;

use crate::middleware::platform_auth::PLATFORM_AUD;
use crate::models::user::JwtClaims;

pub const TENANT_AUD: &str = "tenant";
pub const TENANT_PRE_AUTH_AUD: &str = "tenant_pre_auth";

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct TenantPreAuthClaims {
    pub sub: i64,
    pub email: String,
    pub aud: String,
    pub exp: usize,
    pub iat: usize,
}

pub fn generate_tenant_pre_auth_token(
    user_id: i64,
    email: &str,
    secret: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = chrono::Utc::now();
    let exp = now + chrono::Duration::minutes(5);
    let claims = TenantPreAuthClaims {
        sub: user_id,
        email: email.to_string(),
        aud: TENANT_PRE_AUTH_AUD.to_string(),
        exp: exp.timestamp() as usize,
        iat: now.timestamp() as usize,
    };
    jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &claims,
        &jsonwebtoken::EncodingKey::from_secret(secret.as_bytes()),
    )
}

pub fn decode_tenant_pre_auth(token: &str, secret: &str) -> Result<TenantPreAuthClaims, String> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&[TENANT_PRE_AUTH_AUD]);
    let data = decode::<TenantPreAuthClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|_| "Invalid or expired pre-auth token".to_string())?;
    if data.claims.aud != TENANT_PRE_AUTH_AUD {
        return Err("Invalid pre-auth token audience".into());
    }
    Ok(data.claims)
}

/// Decode and validate a tenant JWT string.
pub fn decode_tenant_token(token: &str, secret: &str) -> Result<JwtClaims, Error> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&[TENANT_AUD]);
    let token_data = decode::<JwtClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|e| {
        log::warn!("JWT validation failed: {}", e);
        ErrorUnauthorized("Invalid or expired token")
    })?;

    if token_data.claims.aud == PLATFORM_AUD {
        return Err(ErrorUnauthorized("Invalid token type"));
    }
    if token_data.claims.aud != TENANT_AUD {
        return Err(ErrorUnauthorized("Invalid token audience"));
    }

    Ok(token_data.claims)
}

fn bearer_from_headers(
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
    req.uri().query().and_then(|q| {
        q.split('&').find_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            if parts.next()? == "token" {
                parts.next().map(|s| s.to_string())
            } else {
                None
            }
        })
    })
}

fn token_from_cookie(req: &HttpRequest) -> Option<String> {
    req.cookie("hrm_session").map(|c| c.value().to_string())
}

/// Build Set-Cookie header for HttpOnly session (same-origin file/img requests).
pub fn session_cookie_header(token: &str, max_age_secs: i64) -> String {
    let secure = if cfg!(debug_assertions) { "" } else { "; Secure" };
    format!(
        "hrm_session={}; HttpOnly; Path=/api; SameSite=Lax; Max-Age={}{secure}",
        token, max_age_secs
    )
}

/// Clear session cookie on logout.
pub fn clear_session_cookie_header() -> String {
    let secure = if cfg!(debug_assertions) { "" } else { "; Secure" };
    format!("hrm_session=; HttpOnly; Path=/api; SameSite=Lax; Max-Age=0{secure}")
}

/// Extracts and validates JWT token from Authorization header.
pub fn extract_claims(req: &ServiceRequest) -> Result<JwtClaims, Error> {
    let jwt_secret = req
        .app_data::<actix_web::web::Data<Arc<String>>>()
        .ok_or_else(|| ErrorUnauthorized("Server configuration error"))?;

    let token = bearer_from_headers(req.headers())?;
    decode_tenant_token(&token, jwt_secret.as_str())
}

/// Helper to extract claims from HttpRequest (for use inside handlers).
pub fn get_claims_from_request(req: &HttpRequest) -> Result<JwtClaims, Error> {
    let jwt_secret = req
        .app_data::<actix_web::web::Data<Arc<String>>>()
        .ok_or_else(|| ErrorUnauthorized("Server configuration error"))?;

    let token = bearer_from_headers(req.headers())?;
    decode_tenant_token(&token, jwt_secret.as_str())
}

/// Bearer header, HttpOnly cookie, then legacy `?token=` query param.
pub fn get_claims_from_request_or_query(req: &HttpRequest) -> Result<JwtClaims, Error> {
    let jwt_secret = req
        .app_data::<actix_web::web::Data<Arc<String>>>()
        .ok_or_else(|| ErrorUnauthorized("Server configuration error"))?;

    if let Ok(token) = bearer_from_headers(req.headers()) {
        return decode_tenant_token(&token, jwt_secret.as_str());
    }
    if let Some(token) = token_from_cookie(req) {
        return decode_tenant_token(&token, jwt_secret.as_str());
    }
    let token = token_from_query(req).ok_or_else(|| ErrorUnauthorized("Missing token"))?;
    decode_tenant_token(&token, jwt_secret.as_str())
}

/// Generates a JWT token for a tenant user.
pub fn generate_token(
    user_id: i64,
    email: &str,
    organization_id: i64,
    org_slug: &str,
    is_super_admin: bool,
    is_external: bool,
    secret: &str,
    expiration_hours: u64,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = chrono::Utc::now();
    let exp = now + chrono::Duration::hours(expiration_hours as i64);

    let claims = JwtClaims {
        sub: user_id,
        email: email.to_string(),
        exp: exp.timestamp() as usize,
        iat: now.timestamp() as usize,
        organization_id,
        org_slug: Some(org_slug.to_string()),
        is_super_admin,
        is_external,
        aud: TENANT_AUD.to_string(),
        impersonated_by: None,
        impersonation: false,
    };

    jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &claims,
        &jsonwebtoken::EncodingKey::from_secret(secret.as_bytes()),
    )
}

/// Tenant JWT issued during platform impersonation (auditable via `impersonated_by`).
pub fn generate_impersonation_token(
    user_id: i64,
    email: &str,
    organization_id: i64,
    org_slug: &str,
    is_super_admin: bool,
    platform_admin_id: i64,
    is_external: bool,
    secret: &str,
    expiration_hours: u64,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = chrono::Utc::now();
    let exp = now + chrono::Duration::hours(expiration_hours as i64);

    let claims = JwtClaims {
        sub: user_id,
        email: email.to_string(),
        exp: exp.timestamp() as usize,
        iat: now.timestamp() as usize,
        organization_id,
        org_slug: Some(org_slug.to_string()),
        is_super_admin,
        is_external,
        aud: TENANT_AUD.to_string(),
        impersonated_by: Some(platform_admin_id),
        impersonation: true,
    };

    jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &claims,
        &jsonwebtoken::EncodingKey::from_secret(secret.as_bytes()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_tenant_token() {
        let secret = "supersecret";
        let token = generate_token(1, "u@test.com", 1, "acme", false, false, secret, 24).unwrap();
        let claims = decode_tenant_token(&token, secret).unwrap();
        assert_eq!(claims.aud, TENANT_AUD);
        assert_eq!(claims.sub, 1);
        assert_eq!(claims.org_slug.as_deref(), Some("acme"));
    }

    #[test]
    fn tenant_token_rejects_platform_audience() {
        use jsonwebtoken::{encode, EncodingKey, Header};
        let secret = "test-secret-at-least-thirty-two-chars!!";
        let now = chrono::Utc::now();
        let claims = JwtClaims {
            sub: 1,
            email: "u@test.com".to_string(),
            exp: (now + chrono::Duration::hours(1)).timestamp() as usize,
            iat: now.timestamp() as usize,
            organization_id: 1,
            org_slug: Some("acme".to_string()),
            is_super_admin: false,
            aud: PLATFORM_AUD.to_string(),
            impersonated_by: None,
            impersonation: false,
        };
        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap();
        assert!(decode_tenant_token(&token, secret).is_err());
    }
}
