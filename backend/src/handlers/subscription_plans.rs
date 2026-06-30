use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::OptionalExt;

use crate::db::DbPool;
use crate::middleware::platform_auth::get_platform_claims_from_request;
use crate::models::subscription_plan::{SubscriptionPlan, UpsertSubscriptionPlanRequest};
use crate::models::{ApiError, ApiResponse};
use crate::plan_limits::{permissions_for_module, MODULE_CATALOG};
use crate::tenant::normalize_org_slug;

fn parse_json_string_list(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw).unwrap_or_default()
}

fn plan_org_count(conn: &crate::db::Connection, slug: &str) -> i64 {
    conn.query_row(
        "SELECT COUNT(*) FROM organizations WHERE lower(plan) = lower(?1) AND status != 'deleted'",
        [slug],
        |r| r.get_idx::<i64>(0),
    )
    .unwrap_or(0)
}

fn plan_from_row(conn: &crate::db::Connection, row: &crate::db::Row) -> crate::db::Result<SubscriptionPlan> {
    let slug: String = row.get("slug")?;
    let modules_raw: String = row.get::<Option<String>>("modules")?.unwrap_or_else(|| "[]".to_string());
    let features_raw: String = row.get::<Option<String>>("features")?.unwrap_or_else(|| "[]".to_string());
    Ok(SubscriptionPlan {
        id: row.get("id")?,
        name: row.get("name")?,
        slug,
        price_label: row.get("price_label")?,
        billing_period: row.get("billing_period")?,
        max_users: row.get("max_users")?,
        modules: parse_json_string_list(&modules_raw),
        features: parse_json_string_list(&features_raw),
        is_active: row.get::<i64>("is_active")? != 0,
        sort_order: row.get("sort_order")?,
        org_count: plan_org_count(conn, &row.get::<String>("slug")?),
        created_at: row.get("created_at").ok(),
        updated_at: row.get("updated_at").ok(),
    })
}

fn validate_modules(modules: &[String]) -> Result<(), String> {
    if modules.is_empty() {
        return Err("Select at least one module for the plan".to_string());
    }
    Ok(())
}

fn normalize_plan_payload(body: &UpsertSubscriptionPlanRequest) -> Result<(String, String, String, String, i64, Vec<String>, Vec<String>, bool, i64), String> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err("Plan name is required".to_string());
    }

    let slug = body
        .slug
        .as_deref()
        .map(normalize_org_slug)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| normalize_org_slug(&name));
    if slug.len() < 2 {
        return Err("Plan slug must be at least 2 characters".to_string());
    }

    let price_label = body
        .price_label
        .as_deref()
        .unwrap_or("Free")
        .trim()
        .to_string();
    let billing_period = body
        .billing_period
        .as_deref()
        .unwrap_or("month")
        .trim()
        .to_string();
    let max_users = body.max_users.unwrap_or(10).max(0);
    let modules = body.modules.clone().unwrap_or_default();
    validate_modules(&modules)?;
    let features = body
        .features
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|f| f.trim().to_string())
        .filter(|f| !f.is_empty())
        .collect::<Vec<_>>();
    let is_active = body.is_active.unwrap_or(true);
    let sort_order = body.sort_order.unwrap_or(0);

    Ok((
        name,
        slug,
        price_label,
        billing_period,
        max_users,
        modules,
        features,
        is_active,
        sort_order,
    ))
}

/// GET /api/platform/plans
pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let stmt = match conn.prepare(
        "SELECT id, name, slug, price_label, billing_period, max_users, modules, features,
                is_active, sort_order, created_at, updated_at
         FROM subscription_plans
         ORDER BY sort_order ASC, id ASC",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    let items: Vec<SubscriptionPlan> = stmt
        .query_map([], |row| plan_from_row(&conn, row));

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// GET /api/platform/plans/modules — available tenant modules
pub async fn modules_catalog(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_platform_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let _ = pool;
    let items: Vec<serde_json::Value> = MODULE_CATALOG
        .iter()
        .map(|(key, label)| {
            let permission = permissions_for_module(key)
                .first()
                .copied()
                .unwrap_or("");
            serde_json::json!({
                "key": key,
                "label": label,
                "permission": permission,
            })
        })
        .collect();
    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/platform/plans
pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<UpsertSubscriptionPlanRequest>,
) -> HttpResponse {
    let claims = match crate::middleware::platform_auth::require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };

    let payload = match normalize_plan_payload(&body) {
        Ok(v) => v,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let (name, slug, price_label, billing_period, max_users, modules, features, is_active, sort_order) = payload;

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    if conn
        .query_row(
            "SELECT 1 FROM subscription_plans WHERE slug = ?1",
            [&slug],
            |_| Ok(()),
        )
        .optional().is_ok()
    {
        return HttpResponse::Conflict().json(ApiError::new("Plan slug already exists"));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let modules_json = serde_json::to_string(&modules).unwrap_or_else(|_| "[]".to_string());
    let features_json = serde_json::to_string(&features).unwrap_or_else(|_| "[]".to_string());

    if conn
        .execute(
            "INSERT INTO subscription_plans
             (name, slug, price_label, billing_period, max_users, modules, features, is_active, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
            crate::params![
                name,
                slug,
                price_label,
                billing_period,
                max_users,
                modules_json,
                features_json,
                if is_active { 1 } else { 0 },
                sort_order,
                now
            ],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to create plan"));
    }

    let id = conn.last_insert_rowid();
    crate::handlers::platform_audit::audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "subscription_plan.create",
        Some("subscription_plan"),
        Some(id),
        Some(&name),
        None,
        serde_json::json!({"slug": slug, "is_active": is_active}),
    );
    match conn.query_row(
        "SELECT id, name, slug, price_label, billing_period, max_users, modules, features,
                is_active, sort_order, created_at, updated_at
         FROM subscription_plans WHERE id = ?1",
        [id],
        |row| plan_from_row(&conn, row),
    ) {
        Ok(plan) => HttpResponse::Created().json(ApiResponse::success(plan)),
        Err(_) => HttpResponse::Created().json(ApiResponse::success(serde_json::json!({ "id": id }))),
    }
}

/// PATCH /api/platform/plans/{id}
pub async fn update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<UpsertSubscriptionPlanRequest>,
) -> HttpResponse {
    let claims = match crate::middleware::platform_auth::require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let plan_id = path.into_inner();
    let current = conn.query_row(
        "SELECT name, slug, price_label, billing_period, max_users, modules, features, is_active, sort_order
         FROM subscription_plans WHERE id = ?1",
        [plan_id],
        |row| {
            Ok((
                row.get_idx::<String>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<String>(2)?,
                row.get_idx::<String>(3)?,
                row.get_idx::<i64>(4)?,
                row.get_idx::<String>(5)?,
                row.get_idx::<String>(6)?,
                row.get_idx::<i64>(7)? != 0,
                row.get_idx::<i64>(8)?,
            ))
        },
    );

    let Ok((cur_name, cur_slug, cur_price, cur_period, cur_max_users, cur_modules, cur_features, cur_active, cur_sort)) =
        current
    else {
        return HttpResponse::NotFound().json(ApiError::new("Plan not found"));
    };

    let mut merged = UpsertSubscriptionPlanRequest {
        name: body.name.clone(),
        slug: body.slug.clone().or(Some(cur_slug.clone())),
        price_label: body.price_label.clone().or(Some(cur_price)),
        billing_period: body.billing_period.clone().or(Some(cur_period)),
        max_users: body.max_users.or(Some(cur_max_users)),
        modules: body
            .modules
            .clone()
            .or(Some(parse_json_string_list(&cur_modules))),
        features: body
            .features
            .clone()
            .or(Some(parse_json_string_list(&cur_features))),
        is_active: body.is_active.or(Some(cur_active)),
        sort_order: body.sort_order.or(Some(cur_sort)),
    };
    if merged.name.trim().is_empty() {
        merged.name = cur_name;
    }

    let payload = match normalize_plan_payload(&merged) {
        Ok(v) => v,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let (name, slug, price_label, billing_period, max_users, modules, features, is_active, sort_order) = payload;

    if slug != cur_slug {
        if conn
            .query_row(
                "SELECT 1 FROM subscription_plans WHERE slug = ?1 AND id != ?2",
                crate::params![&slug, plan_id],
                |_| Ok(()),
            )
            .optional().is_ok()
        {
            return HttpResponse::Conflict().json(ApiError::new("Plan slug already exists"));
        }
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let modules_json = serde_json::to_string(&modules).unwrap_or_else(|_| "[]".to_string());
    let features_json = serde_json::to_string(&features).unwrap_or_else(|_| "[]".to_string());

    if conn
        .execute(
            "UPDATE subscription_plans
             SET name = ?1, slug = ?2, price_label = ?3, billing_period = ?4, max_users = ?5,
                 modules = ?6, features = ?7, is_active = ?8, sort_order = ?9, updated_at = ?10
             WHERE id = ?11",
            crate::params![
                name,
                slug,
                price_label,
                billing_period,
                max_users,
                modules_json,
                features_json,
                if is_active { 1 } else { 0 },
                sort_order,
                now,
                plan_id
            ],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to update plan"));
    }

    if slug != cur_slug {
        let _ = conn.execute(
            "UPDATE organizations SET plan = ?1, updated_at = ?2 WHERE lower(plan) = lower(?3)",
            crate::params![&slug, &now, &cur_slug],
        );
    }

    crate::handlers::platform_audit::audit_from_request(
        &conn,
        &req,
        claims.sub,
        &claims.email,
        "subscription_plan.update",
        Some("subscription_plan"),
        Some(plan_id),
        Some(&name),
        None,
        serde_json::json!({
            "slug_before": cur_slug,
            "slug_after": slug,
            "is_active": is_active,
        }),
    );

    match conn.query_row(
        "SELECT id, name, slug, price_label, billing_period, max_users, modules, features,
                is_active, sort_order, created_at, updated_at
         FROM subscription_plans WHERE id = ?1",
        [plan_id],
        |row| plan_from_row(&conn, row),
    ) {
        Ok(plan) => HttpResponse::Ok().json(ApiResponse::success(plan)),
        Err(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "updated": true }))),
    }
}

/// DELETE /api/platform/plans/{id}
pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match crate::middleware::platform_auth::require_role(&req, "admin") {
        Ok(c) => c,
        Err(e) => return HttpResponse::Forbidden().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let plan_id = path.into_inner();
    let slug: String = match conn.query_row(
        "SELECT slug FROM subscription_plans WHERE id = ?1",
        [plan_id],
        |r| r.get_idx::<String>(0),
    ) {
        Ok(s) => s,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Plan not found")),
    };

    let org_count = plan_org_count(&conn, &slug);
    if org_count > 0 {
        return HttpResponse::Conflict().json(ApiError::new(
            "Cannot delete a plan assigned to organizations. Reassign them first.",
        ));
    }

    match conn.execute("DELETE FROM subscription_plans WHERE id = ?1", [plan_id]) {
        Ok(n) if n > 0 => {
            crate::handlers::platform_audit::audit_from_request(
                &conn,
                &req,
                claims.sub,
                &claims.email,
                "subscription_plan.delete",
                Some("subscription_plan"),
                Some(plan_id),
                Some(&slug),
                None,
                serde_json::json!({}),
            );
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({ "deleted": true })))
        }
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Plan not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}
