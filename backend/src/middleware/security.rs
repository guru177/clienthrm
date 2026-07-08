use actix_web::body::{BoxBody, EitherBody, MessageBody};
use actix_web::dev::{ServiceRequest, ServiceResponse};
use actix_web::middleware::Next;
use actix_web::{Error, HttpResponse};

use crate::models::ApiError;

fn skip_global_rate_limit(path: &str) -> bool {
    path == "/api/health"
        || path.starts_with("/iclock/")
        || path.starts_with("/pub/")
}

fn api_rate_max() -> u32 {
    std::env::var("HRM_API_RATE_MAX")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(if cfg!(debug_assertions) { 2000 } else { 300 })
}

/// Sliding-window rate limit for authenticated and public API traffic.
pub async fn global_rate_limit_middleware<B>(
    req: ServiceRequest,
    next: Next<B>,
) -> Result<ServiceResponse<EitherBody<BoxBody, B>>, Error>
where
    B: MessageBody + 'static,
{
    let path = req.path().to_string();
    if path.starts_with("/api/") && !skip_global_rate_limit(&path) {
        let ip = crate::rate_limit::client_ip(req.request());
        let key = format!("api:{ip}");
        if let Err(msg) = crate::rate_limit::check_rate_limit(&key, api_rate_max(), 60) {
            let body = HttpResponse::TooManyRequests().json(ApiError::new(&msg));
            return Ok(req.into_response(body.map_into_boxed_body()).map_into_left_body());
        }
    }
    let res = next.call(req).await?;
    Ok(res.map_into_right_body())
}

/// Standard security response headers for browser clients.
pub async fn security_headers_middleware<B>(
    req: ServiceRequest,
    next: Next<B>,
) -> Result<ServiceResponse<EitherBody<BoxBody, B>>, Error>
where
    B: MessageBody + 'static,
{
    let mut res = next.call(req).await?;
    let headers = res.headers_mut();
    headers.insert(
        actix_web::http::header::HeaderName::from_static("x-content-type-options"),
        actix_web::http::header::HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        actix_web::http::header::HeaderName::from_static("x-frame-options"),
        actix_web::http::header::HeaderValue::from_static("DENY"),
    );
    headers.insert(
        actix_web::http::header::HeaderName::from_static("referrer-policy"),
        actix_web::http::header::HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    headers.insert(
        actix_web::http::header::HeaderName::from_static("permissions-policy"),
        actix_web::http::header::HeaderValue::from_static("camera=(), microphone=(), geolocation=()"),
    );
    if !cfg!(debug_assertions) {
        headers.insert(
            actix_web::http::header::HeaderName::from_static("strict-transport-security"),
            actix_web::http::header::HeaderValue::from_static("max-age=31536000; includeSubDomains"),
        );
        headers.insert(
            actix_web::http::header::HeaderName::from_static("content-security-policy"),
            actix_web::http::header::HeaderValue::from_static(
                "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; font-src 'self' data:; frame-ancestors 'none'",
            ),
        );
    }
    Ok(res.map_into_right_body())
}
