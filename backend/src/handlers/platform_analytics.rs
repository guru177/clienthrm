use actix_web::{web, HttpRequest, HttpResponse};

use crate::db::DbPool;
use crate::middleware::platform_auth::get_platform_claims_from_request;
use crate::models::{ApiError, ApiResponse};

fn parse_query_param<T: std::str::FromStr>(req: &HttpRequest, key: &str) -> Option<T> {
    let qs = req.query_string();
    serde_urlencoded::from_str::<Vec<(String, String)>>(qs)
        .ok()?
        .into_iter()
        .find(|(k, _)| k == key)
        .and_then(|(_, v)| v.parse().ok())
}

/// GET /api/platform/analytics/overview — rich top-line metrics
pub async fn overview(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let total_orgs: i64 = conn
        .query_row("SELECT COUNT(*) FROM organizations", [], |r| r.get_idx::<i64>(0))
        .unwrap_or(0);
    let active_orgs: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM organizations WHERE status = 'active'",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let suspended_orgs: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM organizations WHERE status = 'suspended'",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let deleted_orgs: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM organizations WHERE status = 'deleted'",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let total_users: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE deleted_at IS NULL",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let active_users_24h: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM user_presence WHERE last_active_at >= datetime('now', '-1 day')",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    let signups_30d: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM organizations WHERE created_at >= datetime('now', '-30 days')",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let signups_7d: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM organizations WHERE created_at >= datetime('now', '-7 days')",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let signups_today: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM organizations WHERE date(created_at) = date('now')",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    let expiring_7d: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM organizations
             WHERE status != 'deleted'
               AND plan_expires_at IS NOT NULL
               AND plan_expires_at <= datetime('now', '+7 days')
               AND plan_expires_at >= datetime('now', '-1 day')",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let expired_now: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM organizations
             WHERE status != 'deleted'
               AND plan_expires_at IS NOT NULL
               AND plan_expires_at < datetime('now')",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    // MRR proxy: parse digits out of price_label per plan.
    let plans: Vec<(String, String)> = conn
        .query_map(
            "SELECT slug, price_label FROM subscription_plans WHERE is_active = 1",
            [],
            |row| Ok((row.get_idx::<String>(0)?, row.get_idx::<String>(1)?)),
        );
    let mut mrr: f64 = 0.0;
    let mut paid_orgs: i64 = 0;
    for (slug, price_label) in plans {
        let price: f64 = price_label
            .chars()
            .filter(|c| c.is_ascii_digit() || *c == '.')
            .collect::<String>()
            .parse()
            .unwrap_or(0.0);
        if price <= 0.0 {
            continue;
        }
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM organizations
                 WHERE lower(plan) = lower(?1) AND status = 'active'",
                crate::params![&slug],
                |r| r.get_idx::<i64>(0),
            )
            .unwrap_or(0);
        mrr += (count as f64) * price;
        paid_orgs += count;
    }

    let total_devices: i64 = conn
        .query_row("SELECT COUNT(*) FROM biometric_devices", [], |r| r.get_idx::<i64>(0))
        .unwrap_or(0);
    let active_devices_24h: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT device_serial) FROM biometric_punches
             WHERE punch_time >= datetime('now', '-1 day')",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    let punches_24h: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM biometric_punches
             WHERE punch_time >= datetime('now', '-1 day')",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "organizations": {
            "total": total_orgs,
            "active": active_orgs,
            "suspended": suspended_orgs,
            "deleted": deleted_orgs,
        },
        "users": {
            "total": total_users,
            "active_24h": active_users_24h,
        },
        "signups": {
            "today": signups_today,
            "last_7d": signups_7d,
            "last_30d": signups_30d,
        },
        "subscriptions": {
            "expiring_7d": expiring_7d,
            "expired": expired_now,
            "paid_orgs": paid_orgs,
            "mrr_estimate": mrr,
        },
        "devices": {
            "total": total_devices,
            "active_24h": active_devices_24h,
            "punches_24h": punches_24h,
        },
    })))
}

/// GET /api/platform/analytics/signups?days=30 — daily timeseries of org signups
pub async fn signups_timeseries(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let days: i64 = parse_query_param(&req, "days").unwrap_or(30).clamp(1, 180);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let from_clause = format!("datetime('now', '-{days} days')");
    let sql = format!(
        "SELECT date(created_at) AS d, COUNT(*) AS c
         FROM organizations
         WHERE created_at >= {from_clause}
         GROUP BY date(created_at)
         ORDER BY d ASC"
    );
    let rows: Vec<(String, i64)> = conn.query_map(&sql, [], |row| {
        Ok((
            row.get_idx::<String>(0)?,
            row.get_idx::<i64>(1)?,
        ))
    });

    let map: std::collections::HashMap<String, i64> = rows.into_iter().collect();
    let mut series: Vec<serde_json::Value> = Vec::with_capacity(days as usize);
    let today = chrono::Utc::now().date_naive();
    for offset in (0..days).rev() {
        let d = today - chrono::Duration::days(offset);
        let key = d.format("%Y-%m-%d").to_string();
        let count = *map.get(&key).unwrap_or(&0);
        series.push(serde_json::json!({"date": key, "count": count}));
    }

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "series": series,
        "days": days,
    })))
}

/// GET /api/platform/analytics/plan-distribution — orgs per plan + revenue
pub async fn plan_distribution(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let plans: Vec<(String, String, String, i64)> = conn.query_map(
        "SELECT slug, name, price_label, max_users FROM subscription_plans WHERE is_active = 1 ORDER BY sort_order ASC",
        [],
        |row| Ok((
            row.get_idx::<String>(0)?,
            row.get_idx::<String>(1)?,
            row.get_idx::<String>(2)?,
            row.get_idx::<i64>(3)?,
        )),
    );

    let mut items: Vec<serde_json::Value> = Vec::new();
    for (slug, name, price_label, max_users) in plans {
        let active: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM organizations
                 WHERE lower(plan) = lower(?1) AND status = 'active'",
                crate::params![&slug],
                |r| r.get_idx::<i64>(0),
            )
            .unwrap_or(0);
        let total: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM organizations
                 WHERE lower(plan) = lower(?1) AND status != 'deleted'",
                crate::params![&slug],
                |r| r.get_idx::<i64>(0),
            )
            .unwrap_or(0);
        let price: f64 = price_label
            .chars()
            .filter(|c| c.is_ascii_digit() || *c == '.')
            .collect::<String>()
            .parse()
            .unwrap_or(0.0);
        items.push(serde_json::json!({
            "slug": slug,
            "name": name,
            "price_label": price_label,
            "price_value": price,
            "max_users": max_users,
            "active_orgs": active,
            "total_orgs": total,
            "mrr": (active as f64) * price,
        }));
    }

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// GET /api/platform/analytics/expiring?days=14 — orgs with subscriptions ending soon
pub async fn expiring(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let days: i64 = parse_query_param(&req, "days").unwrap_or(14).clamp(0, 365);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let sql = format!(
        "SELECT id, name, slug, plan, plan_expires_at, status,
                (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id AND u.deleted_at IS NULL) AS user_count
         FROM organizations o
         WHERE status != 'deleted'
           AND plan_expires_at IS NOT NULL
           AND plan_expires_at <= datetime('now', '+{days} days')
         ORDER BY plan_expires_at ASC
         LIMIT 100"
    );
    let items: Vec<serde_json::Value> = conn.query_map(&sql, [], |row| {
        Ok(serde_json::json!({
            "id": row.get_idx::<i64>(0)?,
            "name": row.get_idx::<String>(1)?,
            "slug": row.get_idx::<String>(2)?,
            "plan": row.get_idx::<String>(3)?,
            "plan_expires_at": row.get_idx::<Option<String>>(4)?,
            "status": row.get_idx::<String>(5)?,
            "user_count": row.get_idx::<i64>(6)?,
        }))
    });
    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// GET /api/platform/analytics/geography — country breakdown of recent admin sessions
pub async fn geography(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let items: Vec<serde_json::Value> = conn.query_map(
        "SELECT COALESCE(country, 'Unknown') AS country, COUNT(DISTINCT user_id) AS users, MAX(last_active_at) AS last_seen
         FROM user_presence
         WHERE last_active_at >= datetime('now', '-30 days')
         GROUP BY COALESCE(country, 'Unknown')
         ORDER BY users DESC LIMIT 50",
        [],
        |row| {
            Ok(serde_json::json!({
                "country": row.get_idx::<String>(0)?,
                "users": row.get_idx::<i64>(1)?,
                "last_seen": row.get_idx::<Option<String>>(2)?,
            }))
        },
    );
    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// GET /api/platform/analytics/devices — biometric fleet status
pub async fn devices_fleet(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let by_org: Vec<serde_json::Value> = conn.query_map(
        "SELECT o.id, o.name, COUNT(d.id) AS total,
                COALESCE(SUM(CASE WHEN p.last_seen >= datetime('now', '-1 day') THEN 1 ELSE 0 END), 0) AS active_24h
         FROM organizations o
         LEFT JOIN biometric_devices d ON d.organization_id = o.id
         LEFT JOIN (
             SELECT device_serial, MAX(punch_time) AS last_seen
             FROM biometric_punches
             GROUP BY device_serial
         ) p ON p.device_serial = d.serial_number
         WHERE o.status != 'deleted'
         GROUP BY o.id, o.name
         HAVING total > 0
         ORDER BY total DESC LIMIT 50",
        [],
        |row| {
            Ok(serde_json::json!({
                "organization_id": row.get_idx::<i64>(0)?,
                "organization_name": row.get_idx::<String>(1)?,
                "total_devices": row.get_idx::<i64>(2)?,
                "active_24h": row.get_idx::<i64>(3)?,
            }))
        },
    );

    HttpResponse::Ok().json(ApiResponse::success(by_org))
}

/// GET /api/platform/search?q=foo — global search across organizations, users, plans, admins
pub async fn global_search(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let q: String = parse_query_param::<String>(&req, "q")
        .unwrap_or_default()
        .trim()
        .to_string();
    if q.len() < 2 {
        return HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "organizations": [],
            "users": [],
            "plans": [],
            "platform_admins": [],
        })));
    }

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let pat = format!("%{q}%");

    let orgs: Vec<serde_json::Value> = conn.query_map(
        "SELECT id, name, slug, status, plan FROM organizations
         WHERE (name LIKE ?1 OR slug LIKE ?1) AND status != 'deleted'
         LIMIT 10",
        crate::params![&pat],
        |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
                "slug": row.get_idx::<String>(2)?,
                "status": row.get_idx::<String>(3)?,
                "plan": row.get_idx::<String>(4)?,
            }))
        },
    );

    let users: Vec<serde_json::Value> = conn.query_map(
        "SELECT u.id, u.name, u.email, u.organization_id, o.name AS org_name, o.slug AS org_slug
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
         WHERE u.deleted_at IS NULL
           AND (u.name LIKE ?1 OR u.email LIKE ?1)
         LIMIT 10",
        crate::params![&pat],
        |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
                "email": row.get_idx::<String>(2)?,
                "organization_id": row.get_idx::<i64>(3)?,
                "organization_name": row.get_idx::<Option<String>>(4)?,
                "organization_slug": row.get_idx::<Option<String>>(5)?,
            }))
        },
    );

    let plans: Vec<serde_json::Value> = conn.query_map(
        "SELECT id, name, slug FROM subscription_plans
         WHERE name LIKE ?1 OR slug LIKE ?1
         LIMIT 10",
        crate::params![&pat],
        |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
                "slug": row.get_idx::<String>(2)?,
            }))
        },
    );

    let admins: Vec<serde_json::Value> = conn.query_map(
        "SELECT id, name, email, role FROM platform_admins
         WHERE name LIKE ?1 OR email LIKE ?1
         LIMIT 10",
        crate::params![&pat],
        |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
                "email": row.get_idx::<String>(2)?,
                "role": row.get_idx::<Option<String>>(3)?.unwrap_or_else(|| "admin".to_string()),
            }))
        },
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "organizations": orgs,
        "users": users,
        "plans": plans,
        "platform_admins": admins,
    })))
}

/// GET /api/platform/system/health — high-level system health snapshot
pub async fn system_health(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    cfg: web::Data<std::sync::Arc<crate::config::AppConfig>>,
) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let backend = "postgres";
    let db_path = cfg.database_url.clone();
    let mut db_size_bytes: Option<u64> = None;
    if let Ok(row) = conn.query_row(
        "SELECT pg_database_size(current_database())",
        crate::db::Params::empty(),
        |r| r.get_idx::<i64>(0),
    ) {
        db_size_bytes = Some(row.max(0) as u64);
    }

    let counts = [
        "organizations",
        "users",
        "platform_admins",
        "subscription_plans",
        "biometric_devices",
        "biometric_punches",
        "platform_audit_log",
        "platform_sessions",
        "platform_announcements",
        "platform_releases",
        "tenant_feature_overrides",
        "jwt_refresh_tokens",
    ]
    .iter()
    .map(|table| {
        let n: i64 = conn
            .query_row(&format!("SELECT COUNT(*) FROM {}", table), [], |r| {
                r.get_idx::<i64>(0)
            })
            .unwrap_or(0);
        serde_json::json!({"table": table, "rows": n})
    })
    .collect::<Vec<_>>();

    let active_sessions: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM platform_sessions WHERE revoked = 0",
            [],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    let recent_errors: Vec<serde_json::Value> = conn.query_map(
        "SELECT id, action, target_label, created_at, ip_address
         FROM platform_audit_log
         WHERE action LIKE '%error%' OR action LIKE '%failed%'
         ORDER BY id DESC LIMIT 20",
        [],
        |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "action": row.get_idx::<String>(1)?,
                "target_label": row.get_idx::<Option<String>>(2)?,
                "created_at": row.get_idx::<Option<String>>(3)?,
                "ip_address": row.get_idx::<Option<String>>(4)?,
            }))
        },
    );

    let last_punch: Option<String> = conn
        .query_row(
            "SELECT MAX(punch_time) FROM biometric_punches",
            [],
            |r| r.get_idx::<Option<String>>(0),
        )
        .ok()
        .flatten();
    let last_login: Option<String> = conn
        .query_row(
            "SELECT MAX(last_login_at) FROM platform_admins",
            [],
            |r| r.get_idx::<Option<String>>(0),
        )
        .ok()
        .flatten();
    let last_signup: Option<String> = conn
        .query_row(
            "SELECT MAX(created_at) FROM organizations",
            [],
            |r| r.get_idx::<Option<String>>(0),
        )
        .ok()
        .flatten();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "database": {
            "backend": backend,
            "path": db_path,
            "size_bytes": db_size_bytes,
        },
        "tables": counts,
        "active_platform_sessions": active_sessions,
        "recent_errors": recent_errors,
        "last_biometric_punch": last_punch,
        "last_admin_login": last_login,
        "last_org_signup": last_signup,
        "build": {
            "name": env!("CARGO_PKG_NAME"),
            "version": env!("CARGO_PKG_VERSION"),
        }
    })))
}
