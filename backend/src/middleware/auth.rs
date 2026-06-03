use actix_web::{dev::ServiceRequest, Error, HttpMessage};
use actix_web::error::ErrorUnauthorized;
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use std::sync::Arc;

use crate::models::user::JwtClaims;

/// Extracts and validates JWT token from Authorization header.
/// Returns the decoded claims on success.
pub fn extract_claims(req: &ServiceRequest) -> Result<JwtClaims, Error> {
    let jwt_secret = req
        .app_data::<actix_web::web::Data<Arc<String>>>()
        .ok_or_else(|| ErrorUnauthorized("Server configuration error"))?;

    let auth_header = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| ErrorUnauthorized("Missing Authorization header"))?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or_else(|| ErrorUnauthorized("Invalid Authorization header format"))?;

    let validation = Validation::new(Algorithm::HS256);
    let token_data = decode::<JwtClaims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &validation,
    )
    .map_err(|e| {
        log::warn!("JWT validation failed: {}", e);
        ErrorUnauthorized("Invalid or expired token")
    })?;

    Ok(token_data.claims)
}

/// Helper to extract claims from HttpRequest (for use inside handlers).
pub fn get_claims_from_request(req: &actix_web::HttpRequest) -> Result<JwtClaims, Error> {
    let jwt_secret = req
        .app_data::<actix_web::web::Data<Arc<String>>>()
        .ok_or_else(|| ErrorUnauthorized("Server configuration error"))?;

    let auth_header = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| ErrorUnauthorized("Missing Authorization header"))?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or_else(|| ErrorUnauthorized("Invalid Authorization header format"))?;

    let validation = Validation::new(Algorithm::HS256);
    let token_data = decode::<JwtClaims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &validation,
    )
    .map_err(|e| {
        log::warn!("JWT validation failed: {}", e);
        ErrorUnauthorized("Invalid or expired token")
    })?;

    Ok(token_data.claims)
}

/// Generates a JWT token for a user.
pub fn generate_token(
    user_id: i64,
    email: &str,
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
        is_super_admin,
    };

    jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &claims,
        &jsonwebtoken::EncodingKey::from_secret(secret.as_bytes()),
    )
}
