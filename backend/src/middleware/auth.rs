use actix_web::error::ErrorUnauthorized;
use actix_web::{dev::ServiceRequest, Error, HttpRequest};
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use std::sync::Arc;

use crate::middleware::platform_auth::PLATFORM_AUD;
use crate::models::user::JwtClaims;

pub const TENANT_AUD: &str = "tenant";

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

/// Bearer header first, then `?token=` query param (for img/download URLs).
pub fn get_claims_from_request_or_query(req: &HttpRequest) -> Result<JwtClaims, Error> {
    if let Ok(token) = bearer_from_headers(req.headers()) {
        let jwt_secret = req
            .app_data::<actix_web::web::Data<Arc<String>>>()
            .ok_or_else(|| ErrorUnauthorized("Server configuration error"))?;
        return decode_tenant_token(&token, jwt_secret.as_str());
    }

    let jwt_secret = req
        .app_data::<actix_web::web::Data<Arc<String>>>()
        .ok_or_else(|| ErrorUnauthorized("Server configuration error"))?;
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
        aud: TENANT_AUD.to_string(),
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
    fn tenant_token_roundtrip_with_audience() {
        let secret = "test-secret-at-least-thirty-two-chars!!";
        let token = generate_token(1, "u@test.com", 1, "acme", false, secret, 24).unwrap();
        let claims = decode_tenant_token(&token, secret).expect("decode should succeed");
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
