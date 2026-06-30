use actix_web::{web, HttpRequest, HttpResponse};

use crate::db::{Connection, DbPool};
use crate::middleware::platform_auth::{extract_request_meta, get_platform_claims_from_request};
use crate::models::{ApiError, ApiResponse};

/// Records a platform admin write action.
///
/// `meta` should be a small JSON value (or `serde_json::Value::Null`).
pub fn record_audit(
    conn: &Connection,
    actor_admin_id: i64,
    actor_email: &str,
    action: &str,
    target_type: Option<&str>,
    target_id: Option<i64>,
    target_label: Option<&str>,
    organization_id: Option<i64>,
    meta: serde_json::Value,
    ip: Option<&str>,
    user_agent: Option<&str>,
) {
    let meta_json = if meta.is_null() {
        None
    } else {
        Some(meta.to_string())
    };
    let _ = conn.execute(
        "INSERT INTO platform_audit_log
         (actor_admin_id, actor_email, action, target_type, target_id, target_label,
          organization_id, meta_json, ip_address, user_agent, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))",
        crate::params![
            actor_admin_id,
            actor_email,
            action,
            target_type,
            target_id,
            target_label,
            organization_id,
            meta_json,
            ip,
            user_agent
        ],
    );
}

/// Same as `record_audit`, but pulls request meta + claims from the HTTP request.
pub fn audit_from_request(
    conn: &Connection,
    req: &HttpRequest,
    claims_sub: i64,
    claims_email: &str,
    action: &str,
    target_type: Option<&str>,
    target_id: Option<i64>,
    target_label: Option<&str>,
    organization_id: Option<i64>,
    meta: serde_json::Value,
) {
    let (ip, ua) = extract_request_meta(req);
    record_audit(
        conn,
        claims_sub,
        claims_email,
        action,
        target_type,
        target_id,
        target_label,
        organization_id,
        meta,
        ip.as_deref(),
        ua.as_deref(),
    );
}

/// GET /api/platform/audit-log?limit=&offset=&action=&target_type=&organization_id=&q=
pub async fn audit_log_index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let qs = req.query_string();
    let parsed: Vec<(String, String)> =
        serde_urlencoded::from_str(qs).unwrap_or_default();
    let mut limit: i64 = 100;
    let mut offset: i64 = 0;
    let mut action_filter: Option<String> = None;
    let mut target_type_filter: Option<String> = None;
    let mut org_filter: Option<i64> = None;
    let mut search: Option<String> = None;
    for (k, v) in parsed {
        match k.as_str() {
            "limit" => limit = v.parse().unwrap_or(100).clamp(1, 500),
            "offset" => offset = v.parse().unwrap_or(0).max(0),
            "action" if !v.is_empty() => action_filter = Some(v),
            "target_type" if !v.is_empty() => target_type_filter = Some(v),
            "organization_id" if !v.is_empty() => org_filter = v.parse().ok(),
            "q" if !v.is_empty() => search = Some(v),
            _ => {}
        }
    }

    let mut sql = String::from(
        "SELECT al.id, al.actor_admin_id, al.actor_email, al.action, al.target_type,
                al.target_id, al.target_label, al.organization_id, o.name AS organization_name,
                al.meta_json, al.ip_address, al.user_agent, al.created_at
         FROM platform_audit_log al
         LEFT JOIN organizations o ON o.id = al.organization_id
         WHERE 1 = 1",
    );
    let mut params: Vec<crate::db::ParamValue> = Vec::new();
    if let Some(action) = action_filter.as_ref() {
        sql.push_str(" AND al.action = ?");
        params.push(crate::db::into_param_value(action.clone()));
    }
    if let Some(tt) = target_type_filter.as_ref() {
        sql.push_str(" AND al.target_type = ?");
        params.push(crate::db::into_param_value(tt.clone()));
    }
    if let Some(org_id) = org_filter {
        sql.push_str(" AND al.organization_id = ?");
        params.push(crate::db::into_param_value(org_id));
    }
    if let Some(q) = search.as_ref() {
        sql.push_str(" AND (al.actor_email LIKE ? OR al.target_label LIKE ? OR al.action LIKE ?)");
        let pattern = format!("%{q}%");
        params.push(crate::db::into_param_value(pattern.clone()));
        params.push(crate::db::into_param_value(pattern.clone()));
        params.push(crate::db::into_param_value(pattern));
    }
    sql.push_str(" ORDER BY al.id DESC LIMIT ? OFFSET ?");
    params.push(crate::db::into_param_value(limit));
    params.push(crate::db::into_param_value(offset));

    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    let items: Vec<serde_json::Value> = stmt.query_map(params.as_slice(), |row| {
        Ok(serde_json::json!({
            "id": row.get_idx::<i64>(0)?,
            "actor_admin_id": row.get_idx::<Option<i64>>(1)?,
            "actor_email": row.get_idx::<Option<String>>(2)?,
            "action": row.get_idx::<String>(3)?,
            "target_type": row.get_idx::<Option<String>>(4)?,
            "target_id": row.get_idx::<Option<i64>>(5)?,
            "target_label": row.get_idx::<Option<String>>(6)?,
            "organization_id": row.get_idx::<Option<i64>>(7)?,
            "organization_name": row.get_idx::<Option<String>>(8)?,
            "meta_json": row.get_idx::<Option<String>>(9)?,
            "ip_address": row.get_idx::<Option<String>>(10)?,
            "user_agent": row.get_idx::<Option<String>>(11)?,
            "created_at": row.get_idx::<Option<String>>(12)?,
        }))
    });

    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM platform_audit_log", [], |r| {
            r.get_idx::<i64>(0)
        })
        .unwrap_or(0);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    })))
}
