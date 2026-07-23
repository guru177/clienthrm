use actix_web::HttpResponse;

/// GET /api/openapi.json — lightweight API catalog for integrators.
pub async fn openapi_json() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "openapi": "3.0.3",
        "info": {
            "title": "Raintech HRM API",
            "version": env!("CARGO_PKG_VERSION"),
            "description": "Tenant API catalog. Authenticate with Bearer JWT from /auth/login. Outbound webhooks send X-HRM-Signature: sha256=<hmac>."
        },
        "servers": [{ "url": "/api" }],
        "paths": {
            "/health": { "get": { "summary": "Health check" } },
            "/openapi.json": { "get": { "summary": "This OpenAPI catalog" } },
            "/auth/login": { "post": { "summary": "Tenant login" } },
            "/auth/2fa/verify": { "post": { "summary": "Complete login with TOTP" } },
            "/auth/refresh": { "post": { "summary": "Refresh JWT" } },
            "/auth/me": { "get": { "summary": "Current user", "security": [{ "bearerAuth": [] }] } },
            "/admin/attendance/clock-in": { "post": { "summary": "Clock in (may include geo)", "security": [{ "bearerAuth": [] }] } },
            "/admin/attendance/clock-out": { "post": { "summary": "Clock out", "security": [{ "bearerAuth": [] }] } },
            "/admin/leave-requests": {
                "get": { "summary": "List my leave requests", "security": [{ "bearerAuth": [] }] },
                "post": { "summary": "Submit leave request", "security": [{ "bearerAuth": [] }] }
            },
            "/admin/leave-requests/{id}/approve": { "post": { "summary": "Approve leave", "security": [{ "bearerAuth": [] }] } },
            "/admin/manager/team": { "get": { "summary": "Manager direct reports", "security": [{ "bearerAuth": [] }] } },
            "/admin/manager/attendance": { "get": { "summary": "Team attendance", "security": [{ "bearerAuth": [] }] } },
            "/admin/manager/leave-requests": { "get": { "summary": "Team leave queue", "security": [{ "bearerAuth": [] }] } },
            "/admin/workflows": {
                "get": { "summary": "List workflows", "security": [{ "bearerAuth": [] }] },
                "post": { "summary": "Create workflow", "security": [{ "bearerAuth": [] }] }
            },
            "/admin/workflows/{id}/test": { "post": { "summary": "Test workflow with sample payload", "security": [{ "bearerAuth": [] }] } },
            "/admin/workflows/{id}/executions": { "get": { "summary": "Workflow execution log", "security": [{ "bearerAuth": [] }] } },
            "/admin/integrations/webhooks": {
                "get": { "summary": "List outbound webhooks", "security": [{ "bearerAuth": [] }] },
                "post": { "summary": "Register outbound webhook", "security": [{ "bearerAuth": [] }] }
            },
            "/admin/integrations/webhooks/{id}": {
                "put": { "summary": "Update webhook", "security": [{ "bearerAuth": [] }] },
                "delete": { "summary": "Delete webhook", "security": [{ "bearerAuth": [] }] }
            },
            "/admin/integrations/webhooks/{id}/deliveries": { "get": { "summary": "Webhook delivery log", "security": [{ "bearerAuth": [] }] } },
            "/admin/reports/out-of-zone-punches": { "get": { "summary": "Out-of-zone attendance punches", "security": [{ "bearerAuth": [] }] } },
            "/admin/payroll/stats": { "get": { "summary": "Payroll month stats", "security": [{ "bearerAuth": [] }] } },
            "/admin/payroll/generate": { "post": { "summary": "Generate payslips", "security": [{ "bearerAuth": [] }] } },
            "/admin/payslips/{id}/pdf": { "get": { "summary": "Download payslip PDF", "security": [{ "bearerAuth": [] }] } },
            "/two-factor/qr-code": { "get": { "summary": "2FA setup QR", "security": [{ "bearerAuth": [] }] } }
        },
        "x-webhook-events": [
            "leave.approved",
            "attendance.clock_in",
            "payslip.generated"
        ],
        "components": {
            "securitySchemes": {
                "bearerAuth": { "type": "http", "scheme": "bearer", "bearerFormat": "JWT" }
            }
        }
    }))
}
