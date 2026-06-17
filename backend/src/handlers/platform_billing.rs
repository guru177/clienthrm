use actix_web::{web, HttpRequest, HttpResponse};

use crate::db::{Connection, DbPool};
use crate::handlers::platform_audit::audit_from_request;
use crate::middleware::platform_auth::{get_platform_claims_from_request, require_role};
use crate::models::{ApiError, ApiResponse};

fn parse_price_label(label: &str) -> f64 {
    label
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.')
        .collect::<String>()
        .parse()
        .unwrap_or(0.0)
}

pub fn record_invoice(
    conn: &Connection,
    org_id: i64,
    plan_slug: &str,
    amount: f64,
    status: &str,
    period_start: Option<&str>,
    period_end: Option<&str>,
    note: Option<&str>,
    admin_id: Option<i64>,
) {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let paid_at = if status == "paid" { Some(now.as_str()) } else { None };
    let _ = conn.execute(
        "INSERT INTO platform_invoices
         (organization_id, plan_slug, amount, currency, status, period_start, period_end,
          note, created_by_admin_id, paid_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'INR', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
        crate::params![
            org_id,
            plan_slug,
            amount,
            status,
            period_start,
            period_end,
            note,
            admin_id,
            paid_at,
            &now
        ],
    );
}

pub fn invoice_amount_for_plan(conn: &Connection, plan_slug: &str) -> f64 {
    conn.query_row(
        "SELECT price_label FROM subscription_plans WHERE slug = ?1",
        [plan_slug],
        |row| row.get_idx::<String>(0),
    )
    .map(|label| parse_price_label(&label))
    .unwrap_or(0.0)
}

/// GET /api/platform/invoices?status=&organization_id=&limit=&offset=
pub async fn invoices_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let parsed: Vec<(String, String)> =
        serde_urlencoded::from_str(req.query_string()).unwrap_or_default();
    let mut limit: i64 = 50;
    let mut offset: i64 = 0;
    let mut status_filter: Option<String> = None;
    let mut org_filter: Option<i64> = None;
    for (k, v) in parsed {
        match k.as_str() {
            "limit" => limit = v.parse().unwrap_or(50).clamp(1, 200),
            "offset" => offset = v.parse().unwrap_or(0).max(0),
            "status" if !v.is_empty() => status_filter = Some(v),
            "organization_id" if !v.is_empty() => org_filter = v.parse().ok(),
            _ => {}
        }
    }

    let mut sql = String::from(
        "SELECT i.id, i.organization_id, o.name AS organization_name, i.plan_slug,
                i.amount, i.currency, i.status, i.period_start, i.period_end, i.note,
                i.paid_at, i.created_at
         FROM platform_invoices i
         JOIN organizations o ON o.id = i.organization_id
         WHERE 1 = 1",
    );
    let mut params: Vec<crate::db::ParamValue> = Vec::new();
    if let Some(st) = status_filter.as_ref() {
        sql.push_str(" AND i.status = ?");
        params.push(crate::db::into_param_value(st.clone()));
    }
    if let Some(org_id) = org_filter {
        sql.push_str(" AND i.organization_id = ?");
        params.push(crate::db::into_param_value(org_id));
    }
    sql.push_str(" ORDER BY i.id DESC LIMIT ? OFFSET ?");
    params.push(crate::db::into_param_value(limit));
    params.push(crate::db::into_param_value(offset));

    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let items: Vec<serde_json::Value> = stmt.query_map(params.as_slice(), |row| {
        Ok(serde_json::json!({
            "id": row.get_idx::<i64>(0)?,
            "organization_id": row.get_idx::<i64>(1)?,
            "organization_name": row.get_idx::<String>(2)?,
            "plan_slug": row.get_idx::<String>(3)?,
            "amount": row.get_idx::<f64>(4)?,
            "currency": row.get_idx::<String>(5)?,
            "status": row.get_idx::<String>(6)?,
            "period_start": row.get_idx::<Option<String>>(7)?,
            "period_end": row.get_idx::<Option<String>>(8)?,
            "note": row.get_idx::<Option<String>>(9)?,
            "paid_at": row.get_idx::<Option<String>>(10)?,
            "created_at": row.get_idx::<Option<String>>(11)?,
        }))
    });

    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM platform_invoices", [], |r| r.get_idx::<i64>(0))
        .unwrap_or(0);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    })))
}

/// GET /api/platform/revenue/summary
pub async fn revenue_summary(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let paid_total: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM platform_invoices WHERE status = 'paid'",
            [],
            |r| r.get_idx::<f64>(0),
        )
        .unwrap_or(0.0);
    let pending_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM platform_invoices WHERE status = 'pending'",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let pending_total: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM platform_invoices WHERE status = 'pending'",
            [],
            |r| r.get_idx::<f64>(0),
        )
        .unwrap_or(0.0);
    let invoices_30d: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM platform_invoices WHERE created_at >= datetime('now', '-30 day')",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    // MRR proxy from active orgs × plan price
    let mut mrr = 0.0f64;
    let plans: Vec<(String, String)> = conn.query_map(
        "SELECT slug, price_label FROM subscription_plans WHERE is_active = 1",
        [],
        |row| Ok((row.get_idx::<String>(0)?, row.get_idx::<String>(1)?)),
    );
    for (slug, price_label) in &plans {
        let price = parse_price_label(price_label);
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM organizations WHERE status = 'active' AND plan = ?1",
                [slug.as_str()],
                |r| r.get_idx::<i64>(0),
            )
            .unwrap_or(0);
        mrr += price * count as f64;
    }

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "mrr_estimate": mrr,
        "paid_total": paid_total,
        "pending_count": pending_count,
        "pending_total": pending_total,
        "invoices_30d": invoices_30d,
    })))
}

#[derive(serde::Deserialize)]
pub struct MarkInvoicePaidRequest {
    #[serde(default)]
    pub note: Option<String>,
}

/// POST /api/platform/invoices/{id}/mark-paid
pub async fn mark_invoice_paid(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<MarkInvoicePaidRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let invoice_id = path.into_inner();

    let (org_id, plan_slug, amount): (i64, String, f64) = match conn.query_row(
        "SELECT organization_id, plan_slug, amount FROM platform_invoices WHERE id = ?1",
        [invoice_id],
        |row| Ok((row.get_idx::<i64>(0)?, row.get_idx::<String>(1)?, row.get_idx::<f64>(2)?)),
    ) {
        Ok(v) => v,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Invoice not found")),
    };

    if let Err(msg) = mark_invoice_paid_by_id(&conn, invoice_id, body.note.as_deref()) {
        return HttpResponse::BadRequest().json(ApiError::new(&msg));
    }

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "invoice.mark_paid",
        Some("invoice"),
        Some(invoice_id),
        Some(&format!("{plan_slug} ₹{amount}")),
        Some(org_id),
        serde_json::Value::Null,
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "id": invoice_id,
        "status": "paid",
    })))
}

// ── Coupons ─────────────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
pub struct CouponRequest {
    pub code: String,
    #[serde(default)]
    pub percent_off: Option<f64>,
    #[serde(default)]
    pub amount_off: Option<f64>,
    #[serde(default)]
    pub valid_until: Option<String>,
    #[serde(default)]
    pub max_redemptions: Option<i64>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub is_active: Option<bool>,
}

/// GET /api/platform/coupons
pub async fn coupons_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let items: Vec<serde_json::Value> = conn.query_map(
        "SELECT id, code, percent_off, amount_off, valid_until, max_redemptions,
                redemption_count, is_active, note, created_at
         FROM platform_coupons ORDER BY id DESC",
        [],
        |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "code": row.get_idx::<String>(1)?,
                "percent_off": row.get_idx::<f64>(2)?,
                "amount_off": row.get_idx::<f64>(3)?,
                "valid_until": row.get_idx::<Option<String>>(4)?,
                "max_redemptions": row.get_idx::<Option<i64>>(5)?,
                "redemption_count": row.get_idx::<i64>(6)?,
                "is_active": row.get_idx::<Option<i64>>(7)?.unwrap_or(1) != 0,
                "note": row.get_idx::<Option<String>>(8)?,
                "created_at": row.get_idx::<Option<String>>(9)?,
            }))
        },
    );
    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/platform/coupons
pub async fn coupons_store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<CouponRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let code = body.code.trim().to_uppercase();
    if code.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Code is required"));
    }
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if conn
        .execute(
            "INSERT INTO platform_coupons
             (code, percent_off, amount_off, valid_until, max_redemptions, is_active, note,
              created_by_admin_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
            crate::params![
                &code,
                body.percent_off.unwrap_or(0.0),
                body.amount_off.unwrap_or(0.0),
                body.valid_until.as_deref(),
                body.max_redemptions,
                body.is_active.unwrap_or(true) as i64,
                body.note.as_deref(),
                claims.sub,
                &now
            ],
        )
        .is_err()
    {
        return HttpResponse::BadRequest().json(ApiError::new("Failed to create coupon"));
    }
    let id = conn.last_insert_rowid();
    audit_from_request(
        &conn, &req, claims.sub, &claims.email, "coupon.create",
        Some("coupon"), Some(id), Some(&code), None, serde_json::Value::Null,
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "id": id, "code": code })))
}

/// DELETE /api/platform/coupons/{id}
pub async fn coupons_destroy(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let id = path.into_inner();
    if conn.execute("DELETE FROM platform_coupons WHERE id = ?1", [id]).unwrap_or(0) == 0 {
        return HttpResponse::NotFound().json(ApiError::new("Coupon not found"));
    }
    audit_from_request(
        &conn, &req, claims.sub, &claims.email, "coupon.delete",
        Some("coupon"), Some(id), None, None, serde_json::Value::Null,
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "deleted": true })))
}

// ── Plan change requests ────────────────────────────────────────────────────

/// GET /api/platform/upgrade-requests?status=
pub async fn upgrade_requests_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let parsed: Vec<(String, String)> =
        serde_urlencoded::from_str(req.query_string()).unwrap_or_default();
    let mut status_filter = "pending".to_string();
    for (k, v) in parsed {
        if k == "status" && !v.is_empty() {
            status_filter = v;
        }
    }

    let items: Vec<serde_json::Value> = conn.query_map(
        "SELECT r.id, r.organization_id, o.name, r.requested_plan, r.current_plan, r.status,
                r.note, r.requested_by_email, r.review_note, r.created_at, r.updated_at
         FROM platform_plan_change_requests r
         JOIN organizations o ON o.id = r.organization_id
         WHERE r.status = ?1
         ORDER BY r.id DESC LIMIT 100",
        crate::params![&status_filter],
        |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "organization_id": row.get_idx::<i64>(1)?,
                "organization_name": row.get_idx::<String>(2)?,
                "requested_plan": row.get_idx::<String>(3)?,
                "current_plan": row.get_idx::<String>(4)?,
                "status": row.get_idx::<String>(5)?,
                "note": row.get_idx::<Option<String>>(6)?,
                "requested_by_email": row.get_idx::<Option<String>>(7)?,
                "review_note": row.get_idx::<Option<String>>(8)?,
                "created_at": row.get_idx::<Option<String>>(9)?,
                "updated_at": row.get_idx::<Option<String>>(10)?,
            }))
        },
    );
    HttpResponse::Ok().json(ApiResponse::success(items))
}

#[derive(serde::Deserialize)]
pub struct ReviewUpgradeRequest {
    #[serde(default)]
    pub review_note: Option<String>,
}

/// POST /api/platform/upgrade-requests/{id}/approve
pub async fn upgrade_request_approve(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<ReviewUpgradeRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let request_id = path.into_inner();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let (org_id, org_name, requested, current, status): (i64, String, String, String, String) =
        match conn.query_row(
            "SELECT r.organization_id, o.name, r.requested_plan, r.current_plan, r.status
             FROM platform_plan_change_requests r
             JOIN organizations o ON o.id = r.organization_id
             WHERE r.id = ?1",
            [request_id],
            |row| {
                Ok((
                    row.get_idx::<i64>(0)?,
                    row.get_idx::<String>(1)?,
                    row.get_idx::<String>(2)?,
                    row.get_idx::<String>(3)?,
                    row.get_idx::<String>(4)?,
                ))
            },
        ) {
            Ok(v) => v,
            Err(_) => return HttpResponse::NotFound().json(ApiError::new("Request not found")),
        };

    if status != "pending" {
        return HttpResponse::BadRequest().json(ApiError::new("Request is not pending"));
    }

    let _ = conn.execute(
        "UPDATE organizations SET plan = ?1, updated_at = ?2 WHERE id = ?3",
        crate::params![&requested, &now, org_id],
    );
    if let Err(e) = crate::subscription_period::assign_org_subscription(&conn, org_id, &requested) {
        return HttpResponse::BadRequest().json(ApiError::new(&format!("{e}")));
    }
    crate::role_defaults::sync_role_defaults(&conn);

    let amount = invoice_amount_for_plan(&conn, &requested);
    let (started, expires): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT plan_started_at, plan_expires_at FROM organizations WHERE id = ?1",
            [org_id],
            |row| Ok((row.get_idx::<Option<String>>(0)?, row.get_idx::<Option<String>>(1)?)),
        )
        .unwrap_or((None, None));
    record_invoice(
        &conn,
        org_id,
        &requested,
        amount,
        "pending",
        started.as_deref(),
        expires.as_deref(),
        Some("Created on approved upgrade request"),
        Some(claims.sub),
    );

    let _ = conn.execute(
        "UPDATE platform_plan_change_requests
         SET status = 'approved', reviewed_by_admin_id = ?1, review_note = ?2, updated_at = ?3
         WHERE id = ?4",
        crate::params![claims.sub, body.review_note.as_deref(), &now, request_id],
    );

    audit_from_request(
        &conn, &req, claims.sub, &claims.email, "upgrade_request.approve",
        Some("plan_change_request"), Some(request_id), Some(&org_name), Some(org_id),
        serde_json::json!({ "from": current, "to": requested }),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "id": request_id,
        "status": "approved",
        "plan": requested,
    })))
}

/// POST /api/platform/upgrade-requests/{id}/reject
pub async fn upgrade_request_reject(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<ReviewUpgradeRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let request_id = path.into_inner();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let (org_id, org_name, status): (i64, String, String) = conn
        .query_row(
            "SELECT r.organization_id, o.name, r.status
             FROM platform_plan_change_requests r
             JOIN organizations o ON o.id = r.organization_id
             WHERE r.id = ?1",
            [request_id],
            |row| Ok((row.get_idx::<i64>(0)?, row.get_idx::<String>(1)?, row.get_idx::<String>(2)?)),
        )
        .unwrap_or((0, String::new(), String::new()));

    if org_id == 0 {
        return HttpResponse::NotFound().json(ApiError::new("Request not found"));
    }
    if status != "pending" {
        return HttpResponse::BadRequest().json(ApiError::new("Request is not pending"));
    }

    let _ = conn.execute(
        "UPDATE platform_plan_change_requests
         SET status = 'rejected', reviewed_by_admin_id = ?1, review_note = ?2, updated_at = ?3
         WHERE id = ?4",
        crate::params![claims.sub, body.review_note.as_deref(), &now, request_id],
    );

    audit_from_request(
        &conn, &req, claims.sub, &claims.email, "upgrade_request.reject",
        Some("plan_change_request"), Some(request_id), Some(&org_name), Some(org_id),
        serde_json::Value::Null,
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "id": request_id,
        "status": "rejected",
    })))
}

/// Mark invoice paid by id (shared by webhook + manual).
pub fn mark_invoice_paid_by_id(
    conn: &crate::db::Connection,
    invoice_id: i64,
    note: Option<&str>,
) -> Result<(), String> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let n = conn
        .execute(
            "UPDATE platform_invoices SET status = 'paid', paid_at = ?1, updated_at = ?1,
             note = COALESCE(?2, note) WHERE id = ?3 AND status != 'paid'",
            crate::params![&now, note, invoice_id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Invoice not found or already paid".to_string());
    }
    Ok(())
}
