use actix_web::HttpResponse;

/// GET /api/openapi.json — lightweight API catalog for integrators.
pub async fn openapi_json() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "openapi": "3.0.3",
        "info": {
            "title": "Raintech HRM API",
            "version": env!("CARGO_PKG_VERSION"),
            "description": "Subset catalog. Full route list is defined in backend/src/routes.rs."
        },
        "servers": [{ "url": "/api" }],
        "paths": {
            "/health": { "get": { "summary": "Health check" } },
            "/auth/login": { "post": { "summary": "Tenant login" } },
            "/auth/2fa/verify": { "post": { "summary": "Complete login with TOTP" } },
            "/auth/refresh": { "post": { "summary": "Refresh JWT" } },
            "/auth/me": { "get": { "summary": "Current user", "security": [{ "bearerAuth": [] }] } },
            "/admin/payroll/stats": { "get": { "summary": "Payroll month stats", "security": [{ "bearerAuth": [] }] } },
            "/admin/payroll/generate": { "post": { "summary": "Generate payslips", "security": [{ "bearerAuth": [] }] } },
            "/admin/payslips/{id}/pdf": { "get": { "summary": "Download payslip PDF", "security": [{ "bearerAuth": [] }] } },
            "/two-factor/qr-code": { "get": { "summary": "2FA setup QR", "security": [{ "bearerAuth": [] }] } },
            "/public/careers": { "get": { "summary": "Public job listings" } }
        },
        "components": {
            "securitySchemes": {
                "bearerAuth": { "type": "http", "scheme": "bearer", "bearerFormat": "JWT" }
            }
        }
    }))
}
