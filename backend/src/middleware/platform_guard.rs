//! Require a valid platform JWT for `/api/platform/*` routes (except public auth).

use actix_web::body::{BoxBody, EitherBody, MessageBody};
use actix_web::dev::{ServiceRequest, ServiceResponse};
use actix_web::{middleware::Next, Error, HttpResponse};

use crate::middleware::platform_auth::get_platform_claims_from_request;
use crate::models::ApiError;

fn is_public_platform_path(path: &str) -> bool {
    path == "/api/platform/health"
        || path.starts_with("/api/platform/auth/login")
        || path.starts_with("/api/platform/auth/2fa/verify")
        || path.starts_with("/api/platform/auth/refresh")
}

pub async fn platform_guard_middleware<B>(
    req: ServiceRequest,
    next: Next<B>,
) -> Result<ServiceResponse<EitherBody<BoxBody, B>>, Error>
where
    B: MessageBody + 'static,
{
    let path = req.path().to_string();
    if !path.starts_with("/api/platform") || is_public_platform_path(&path) {
        let res = next.call(req).await?;
        return Ok(res.map_into_right_body());
    }

    let http_req = req.request();
    match get_platform_claims_from_request(http_req) {
        Ok(_claims) => {
            let res = next.call(req).await?;
            Ok(res.map_into_right_body())
        }
        Err(e) => {
            let body = HttpResponse::Unauthorized().json(ApiError::new(&e.to_string()));
            Ok(req.into_response(body.map_into_boxed_body()).map_into_left_body())
        }
    }
}
