use actix_web::{web, HttpRequest, HttpResponse};

use crate::db::DbPool;
use crate::handlers::platform_audit::audit_from_request;
use crate::middleware::platform_auth::{get_platform_claims_from_request, require_role};
use crate::models::{ApiError, ApiResponse};

fn get_org_or_404(
    conn: &crate::db::Connection,
    org_id: i64,
) -> Result<(String, String), HttpResponse> {
    conn.query_row(
        "SELECT name, slug FROM organizations WHERE id = ?1",
        [org_id],
        |row| Ok((row.get_idx::<String>(0)?, row.get_idx::<String>(1)?)),
    )
    .map_err(|_| HttpResponse::NotFound().json(ApiError::new("Organization not found")))
}

/// GET /api/platform/organizations/{id}/overview
pub async fn tenant_overview(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    if let Err(e) = get_platform_claims_from_request(&req) {
        return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string()));
    }
    let conn = match pool.get_platform_read() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let org_id = path.into_inner();
    let (name, slug) = match get_org_or_404(&conn, org_id) {
        Ok(v) => v,
        Err(r) => return r,
    };

    let q = |sql: &str| -> i64 {
        conn.query_row(sql, [org_id], |r| r.get_idx::<i64>(0)).unwrap_or(0)
    };
    let total_users = q("SELECT COUNT(*) FROM users WHERE organization_id = ?1 AND deleted_at IS NULL");
    let active_users = q("SELECT COUNT(*) FROM users WHERE organization_id = ?1 AND deleted_at IS NULL AND status = 'active'");
    let on_leave = q("SELECT COUNT(*) FROM users WHERE organization_id = ?1 AND deleted_at IS NULL AND status = 'on-leave'");
    let suspended = q("SELECT COUNT(*) FROM users WHERE organization_id = ?1 AND deleted_at IS NULL AND status = 'suspended'");
    let devices = q("SELECT COUNT(*) FROM biometric_devices WHERE organization_id = ?1");
    let active_devices = q("SELECT COUNT(*) FROM biometric_devices WHERE organization_id = ?1 AND is_active = 1");
    let punches_30d = conn
        .query_row(
            "SELECT COUNT(*) FROM biometric_punches p
             JOIN biometric_devices d ON d.serial_number = p.device_serial
             WHERE d.organization_id = ?1 AND p.punch_time >= datetime('now', '-30 day')",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let payslips_30d = conn
        .query_row(
            "SELECT COUNT(*) FROM payslips WHERE organization_id = ?1 AND created_at >= datetime('now', '-30 day')",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "id": org_id,
        "name": name,
        "slug": slug,
        "users": {
            "total": total_users,
            "active": active_users,
            "on_leave": on_leave,
            "suspended": suspended,
        },
        "devices": {
            "total": devices,
            "active": active_devices,
            "punches_30d": punches_30d,
        },
        "payroll": {
            "payslips_30d": payslips_30d,
        }
    })))
}

/// GET /api/platform/organizations/{id}/users?limit=&offset=&q=
pub async fn tenant_users(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    if let Err(e) = get_platform_claims_from_request(&req) {
        return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string()));
    }
    let conn = match pool.get_platform_read() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let org_id = path.into_inner();

    let parsed: Vec<(String, String)> =
        serde_urlencoded::from_str(req.query_string()).unwrap_or_default();
    let mut limit: i64 = 50;
    let mut offset: i64 = 0;
    let mut search: Option<String> = None;
    for (k, v) in parsed {
        match k.as_str() {
            "limit" => limit = v.parse().unwrap_or(50).clamp(1, 200),
            "offset" => offset = v.parse().unwrap_or(0).max(0),
            "q" if !v.is_empty() => search = Some(v),
            _ => {}
        }
    }

    let mut sql = String::from(
        "SELECT u.id, u.name, u.email, u.employee_id, u.status, u.is_super_admin,
                u.last_login_at, u.created_at, u.deleted_at
         FROM users u
         WHERE u.organization_id = ? AND u.deleted_at IS NULL",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    if let Some(q) = search.as_ref() {
        sql.push_str(" AND (u.name LIKE ? OR u.email LIKE ? OR u.employee_id LIKE ?)");
        let pat = format!("%{q}%");
        params.push(crate::db::into_param_value(pat.clone()));
        params.push(crate::db::into_param_value(pat.clone()));
        params.push(crate::db::into_param_value(pat));
    }
    sql.push_str(" ORDER BY u.name ASC LIMIT ? OFFSET ?");
    params.push(crate::db::into_param_value(limit));
    params.push(crate::db::into_param_value(offset));

    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let items: Vec<serde_json::Value> = stmt.query_map(params.as_slice(), |row| {
        Ok(serde_json::json!({
            "id": row.get_idx::<i64>(0)?,
            "name": row.get_idx::<String>(1)?,
            "email": row.get_idx::<String>(2)?,
            "employee_id": row.get_idx::<Option<String>>(3)?,
            "status": row.get_idx::<Option<String>>(4)?,
            "is_super_admin": row.get_idx::<Option<bool>>(5)?.unwrap_or(false),
            "last_login_at": row.get_idx::<Option<String>>(6)?,
            "created_at": row.get_idx::<Option<String>>(7)?,
            "deleted_at": row.get_idx::<Option<String>>(8)?,
        }))
    });

    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE organization_id = ?1 AND deleted_at IS NULL",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    })))
}

/// GET /api/platform/organizations/{id}/devices
pub async fn tenant_devices(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    if let Err(e) = get_platform_claims_from_request(&req) {
        return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string()));
    }
    let conn = match pool.get_platform_read() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let org_id = path.into_inner();

    let stmt = match conn.prepare(
        "SELECT d.id, d.serial_number, d.name, d.model, d.ip_address, d.location,
                d.is_active, d.last_heartbeat, d.firmware_version, d.created_at,
                (SELECT MAX(p.punch_time) FROM biometric_punches p WHERE p.device_serial = d.serial_number) AS last_punch,
                (SELECT COUNT(*) FROM biometric_punches p WHERE p.device_serial = d.serial_number AND p.punch_time >= datetime('now','-1 day')) AS punches_24h
         FROM biometric_devices d
         WHERE d.organization_id = ?1
         ORDER BY d.id DESC",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let items: Vec<serde_json::Value> = stmt.query_map([org_id], |row| {
        Ok(serde_json::json!({
            "id": row.get_idx::<i64>(0)?,
            "serial_number": row.get_idx::<String>(1)?,
            "name": row.get_idx::<Option<String>>(2)?,
            "model": row.get_idx::<Option<String>>(3)?,
            "ip_address": row.get_idx::<Option<String>>(4)?,
            "location": row.get_idx::<Option<String>>(5)?,
            "is_active": row.get_idx::<Option<bool>>(6)?.unwrap_or(false),
            "last_heartbeat": row.get_idx::<Option<String>>(7)?,
            "firmware_version": row.get_idx::<Option<String>>(8)?,
            "created_at": row.get_idx::<Option<String>>(9)?,
            "last_punch": row.get_idx::<Option<String>>(10)?,
            "punches_24h": row.get_idx::<Option<i64>>(11)?.unwrap_or(0),
        }))
    });

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// GET /api/platform/organizations/{id}/payroll?limit=12
pub async fn tenant_payroll(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    if let Err(e) = get_platform_claims_from_request(&req) {
        return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string()));
    }
    let conn = match pool.get_platform_read() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let org_id = path.into_inner();

    let stmt = match conn.prepare(
        "SELECT year, month,
                COUNT(*) AS total_payslips,
                COALESCE(SUM(gross_salary), 0) AS gross,
                COALESCE(SUM(net_salary), 0) AS net,
                SUM(CASE WHEN status = 'finalized' THEN 1 ELSE 0 END) AS finalized,
                SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
                MAX(generated_at) AS generated_at
         FROM payslips
         WHERE organization_id = ?1
         GROUP BY year, month
         ORDER BY year DESC, month DESC
         LIMIT 12",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let items: Vec<serde_json::Value> = stmt.query_map([org_id], |row| {
        Ok(serde_json::json!({
            "year": row.get_idx::<i64>(0)?,
            "month": row.get_idx::<i64>(1)?,
            "total_payslips": row.get_idx::<i64>(2)?,
            "gross": row.get_idx::<f64>(3)?,
            "net": row.get_idx::<f64>(4)?,
            "finalized": row.get_idx::<i64>(5)?,
            "draft": row.get_idx::<i64>(6)?,
            "generated_at": row.get_idx::<Option<String>>(7)?,
        }))
    });

    let avg_ctc: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG(annual_ctc), 0) FROM employee_salary_profiles esp
             JOIN users u ON u.id = esp.user_id WHERE u.organization_id = ?1",
            [org_id],
            |r| r.get_idx::<f64>(0),
        )
        .unwrap_or(0.0);
    let compliance_pct: f64 = conn
        .query_row(
            "SELECT CASE WHEN COUNT(*) = 0 THEN 100.0
                    ELSE 100.0 * SUM(CASE WHEN p.status = 'generated' THEN 1 ELSE 0 END) / COUNT(*)
             END FROM payslips p WHERE p.organization_id = ?1",
            [org_id],
            |r| r.get_idx::<f64>(0),
        )
        .unwrap_or(0.0);
    let total_employer_cost: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(p.gross_salary + p.pf_deduction + p.esi_deduction), 0)
             FROM payslips p WHERE p.organization_id = ?1 AND p.status = 'generated'",
            [org_id],
            |r| r.get_idx::<f64>(0),
        )
        .unwrap_or(0.0);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "periods": items,
        "analytics": {
            "avg_annual_ctc": avg_ctc,
            "compliance_completion_pct": compliance_pct,
            "total_employer_cost_generated": total_employer_cost,
        },
    })))
}

/// GET /api/platform/organizations/{id}/attendance?days=30
pub async fn tenant_attendance(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    if let Err(e) = get_platform_claims_from_request(&req) {
        return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string()));
    }
    let conn = match pool.get_platform_read() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let org_id = path.into_inner();

    let parsed: Vec<(String, String)> =
        serde_urlencoded::from_str(req.query_string()).unwrap_or_default();
    let mut days: i64 = 30;
    for (k, v) in parsed {
        if k == "days" {
            days = v.parse().unwrap_or(30).clamp(1, 365);
        }
    }
    let cutoff = format!("-{} day", days);

    let stmt = match conn.prepare(
        "SELECT a.date,
                COUNT(*) AS records,
                SUM(CASE WHEN a.is_late = 1 THEN 1 ELSE 0 END) AS late,
                SUM(CASE WHEN a.is_early_exit = 1 THEN 1 ELSE 0 END) AS early_exit,
                COALESCE(SUM(a.duration_minutes), 0) AS total_minutes
         FROM attendance a
         JOIN users u ON u.id = a.user_id
         WHERE u.organization_id = ?1 AND a.deleted_at IS NULL
           AND a.date >= date('now', ?2)
         GROUP BY a.date
         ORDER BY a.date DESC",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let series: Vec<serde_json::Value> = stmt.query_map(
        crate::params![org_id, cutoff.as_str()],
        |row| {
            Ok(serde_json::json!({
                "date": row.get_idx::<String>(0)?,
                "records": row.get_idx::<i64>(1)?,
                "late": row.get_idx::<Option<i64>>(2)?.unwrap_or(0),
                "early_exit": row.get_idx::<Option<i64>>(3)?.unwrap_or(0),
                "total_minutes": row.get_idx::<f64>(4)?,
            }))
        },
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "days": days,
        "series": series,
    })))
}

/// GET /api/platform/organizations/{id}/settings
pub async fn tenant_settings(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    if let Err(e) = get_platform_claims_from_request(&req) {
        return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string()));
    }
    let conn = match pool.get_platform_read() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let org_id = path.into_inner();

    let stmt = match conn.prepare(
        "SELECT key, value, type, description, updated_at
         FROM app_settings
         WHERE organization_id = ?1
         ORDER BY key ASC",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let items: Vec<serde_json::Value> = stmt.query_map([org_id], |row| {
        Ok(serde_json::json!({
            "key": row.get_idx::<String>(0)?,
            "value": row.get_idx::<Option<String>>(1)?,
            "type": row.get_idx::<Option<String>>(2)?,
            "description": row.get_idx::<Option<String>>(3)?,
            "updated_at": row.get_idx::<Option<String>>(4)?,
        }))
    });
    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// GET /api/platform/organizations/{id}/audit?limit=&offset=
pub async fn tenant_audit(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    if let Err(e) = get_platform_claims_from_request(&req) {
        return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string()));
    }
    let conn = match pool.get_platform_read() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let org_id = path.into_inner();

    let parsed: Vec<(String, String)> =
        serde_urlencoded::from_str(req.query_string()).unwrap_or_default();
    let mut limit: i64 = 50;
    let mut offset: i64 = 0;
    for (k, v) in parsed {
        match k.as_str() {
            "limit" => limit = v.parse().unwrap_or(50).clamp(1, 500),
            "offset" => offset = v.parse().unwrap_or(0).max(0),
            _ => {}
        }
    }

    let stmt = match conn.prepare(
        "SELECT id, actor_admin_id, actor_email, action, target_type, target_id,
                target_label, meta_json, ip_address, created_at
         FROM platform_audit_log
         WHERE organization_id = ?1
         ORDER BY id DESC LIMIT ?2 OFFSET ?3",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let items: Vec<serde_json::Value> = stmt.query_map(crate::params![org_id, limit, offset], |row| {
        Ok(serde_json::json!({
            "id": row.get_idx::<i64>(0)?,
            "actor_admin_id": row.get_idx::<Option<i64>>(1)?,
            "actor_email": row.get_idx::<Option<String>>(2)?,
            "action": row.get_idx::<String>(3)?,
            "target_type": row.get_idx::<Option<String>>(4)?,
            "target_id": row.get_idx::<Option<i64>>(5)?,
            "target_label": row.get_idx::<Option<String>>(6)?,
            "meta_json": row.get_idx::<Option<String>>(7)?,
            "ip_address": row.get_idx::<Option<String>>(8)?,
            "created_at": row.get_idx::<Option<String>>(9)?,
        }))
    });
    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM platform_audit_log WHERE organization_id = ?1",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    })))
}

// ============================================================================
// User actions: force logout, reset password, suspend/unsuspend
// ============================================================================

fn lookup_user(
    conn: &crate::db::Connection,
    user_id: i64,
) -> Result<(i64, String, String, Option<String>), HttpResponse> {
    conn.query_row(
        "SELECT u.organization_id, u.name, u.email, u.status
         FROM users u WHERE u.id = ?1 AND u.deleted_at IS NULL",
        [user_id],
        |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<String>(2)?,
                row.get_idx::<Option<String>>(3)?,
            ))
        },
    )
    .map_err(|_| HttpResponse::NotFound().json(ApiError::new("User not found")))
}

/// POST /api/platform/users/{id}/force-logout
pub async fn force_logout_user(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match require_role(&req, "support") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get_platform() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let user_id = path.into_inner();
    let (org_id, name, email, _status) = match lookup_user(&conn, user_id) {
        Ok(v) => v,
        Err(r) => return r,
    };

    let revoked = conn
        .execute(
            "UPDATE jwt_refresh_tokens SET revoked = 1 WHERE user_id = ?1 AND revoked = 0",
            [user_id],
        )
        .unwrap_or(0);

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "user.force_logout",
        Some("user"),
        Some(user_id),
        Some(&format!("{name} <{email}>")),
        Some(org_id),
        serde_json::json!({"revoked_tokens": revoked}),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "user_id": user_id,
        "revoked_tokens": revoked,
    })))
}

#[derive(serde::Deserialize)]
pub struct ResetPasswordRequest {
    pub new_password: String,
}

/// POST /api/platform/users/{id}/reset-password
pub async fn reset_user_password(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<ResetPasswordRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "support") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    if body.new_password.len() < 8 {
        return HttpResponse::BadRequest()
            .json(ApiError::new("Password must be at least 8 characters"));
    }
    let conn = match pool.get_platform() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let user_id = path.into_inner();
    let (org_id, name, email, _status) = match lookup_user(&conn, user_id) {
        Ok(v) => v,
        Err(r) => return r,
    };

    let hash = match bcrypt::hash(&body.new_password, bcrypt::DEFAULT_COST) {
        Ok(h) => h,
        Err(_) => {
            return HttpResponse::InternalServerError()
                .json(ApiError::new("Failed to hash password"))
        }
    };
    if conn
        .execute(
            "UPDATE users SET password = ?1, updated_at = datetime('now') WHERE id = ?2",
            crate::params![&hash, user_id],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError()
            .json(ApiError::new("Failed to update password"));
    }
    let _ = conn.execute(
        "UPDATE jwt_refresh_tokens SET revoked = 1 WHERE user_id = ?1 AND revoked = 0",
        [user_id],
    );

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "user.reset_password",
        Some("user"),
        Some(user_id),
        Some(&format!("{name} <{email}>")),
        Some(org_id),
        serde_json::Value::Null,
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "user_id": user_id,
        "ok": true,
    })))
}

#[derive(serde::Deserialize)]
pub struct SuspendRequest {
    #[serde(default)]
    pub reason: Option<String>,
}

/// POST /api/platform/users/{id}/suspend
pub async fn suspend_user(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<SuspendRequest>,
) -> HttpResponse {
    let claims = match require_role(&req, "support") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get_platform() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let user_id = path.into_inner();
    let (org_id, name, email, _status) = match lookup_user(&conn, user_id) {
        Ok(v) => v,
        Err(r) => return r,
    };
    if conn
        .execute(
            "UPDATE users SET status = 'suspended', updated_at = datetime('now') WHERE id = ?1",
            [user_id],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError()
            .json(ApiError::new("Failed to suspend user"));
    }
    let _ = conn.execute(
        "UPDATE jwt_refresh_tokens SET revoked = 1 WHERE user_id = ?1 AND revoked = 0",
        [user_id],
    );

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "user.suspend",
        Some("user"),
        Some(user_id),
        Some(&format!("{name} <{email}>")),
        Some(org_id),
        serde_json::json!({"reason": body.reason.clone()}),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "user_id": user_id,
        "status": "suspended",
    })))
}

/// POST /api/platform/users/{id}/unsuspend
pub async fn unsuspend_user(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match require_role(&req, "support") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get_platform() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let user_id = path.into_inner();
    let (org_id, name, email, _status) = match lookup_user(&conn, user_id) {
        Ok(v) => v,
        Err(r) => return r,
    };
    if conn
        .execute(
            "UPDATE users SET status = 'active', updated_at = datetime('now') WHERE id = ?1",
            [user_id],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError()
            .json(ApiError::new("Failed to unsuspend user"));
    }

    audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "user.unsuspend",
        Some("user"),
        Some(user_id),
        Some(&format!("{name} <{email}>")),
        Some(org_id),
        serde_json::Value::Null,
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "user_id": user_id,
        "status": "active",
    })))
}
