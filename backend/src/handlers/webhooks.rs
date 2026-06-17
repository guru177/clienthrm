use actix_web::{web, HttpRequest, HttpResponse};
use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::db::DbPool;
use crate::handlers::platform_billing::mark_invoice_paid_by_id;
use crate::models::{ApiError, ApiResponse};

type HmacSha256 = Hmac<Sha256>;

/// POST /api/webhooks/razorpay
/// Expects Razorpay webhook JSON. Marks invoice paid when payment.captured and
/// `payload.payment.entity.notes.invoice_id` is set.
pub async fn razorpay_webhook(pool: web::Data<DbPool>, req: HttpRequest, body: web::Bytes) -> HttpResponse {
    let secret = std::env::var("RAZORPAY_WEBHOOK_SECRET").unwrap_or_default();
    if !secret.is_empty() {
        let signature = req
            .headers()
            .get("X-Razorpay-Signature")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !verify_razorpay_signature(body.as_ref(), signature, &secret) {
            return HttpResponse::Unauthorized().json(ApiError::new("Invalid webhook signature"));
        }
    }

    let json: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => return HttpResponse::BadRequest().json(ApiError::new("Invalid JSON")),
    };

    let event = json.get("event").and_then(|v| v.as_str()).unwrap_or("");
    if event != "payment.captured" {
        return HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "ignored": true,
            "event": event,
        })));
    }

    let invoice_id = json
        .pointer("/payload/payment/entity/notes/invoice_id")
        .or_else(|| json.pointer("/payload/payment/entity/notes/invoiceId"))
        .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())));

    let Some(invoice_id) = invoice_id else {
        return HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "ignored": true,
            "reason": "no invoice_id in payment notes",
        })));
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    match mark_invoice_paid_by_id(&conn, invoice_id, Some("Paid via Razorpay webhook")) {
        Ok(()) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "invoice_id": invoice_id,
            "status": "paid",
        }))),
        Err(msg) => HttpResponse::BadRequest().json(ApiError::new(&msg)),
    }
}

fn verify_razorpay_signature(body: &[u8], signature: &str, secret: &str) -> bool {
    let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(body);
    let expected = hex::encode(mac.finalize().into_bytes());
    expected == signature
}
