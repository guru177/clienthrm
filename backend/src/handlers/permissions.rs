use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::permission::Permission;
use crate::plan_limits::{
    load_org_plan, module_key_for_permission_slug, module_label_for_key, module_sort_index,
    permissions_for_module, permissions_from_modules, MODULE_CATALOG,
};
use crate::tenant::org_id_from_claims;
use std::collections::{HashMap, HashSet};

fn plan_filtered_permissions(conn: &crate::db::Connection, org_id: i64) -> Vec<Permission> {
    let stmt = match conn.prepare("SELECT * FROM permissions ORDER BY \"group\", name") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let mut items: Vec<Permission> = stmt
        .query_map([], Permission::from_row);

    if let Some(plan) = load_org_plan(conn, org_id) {
        let allowed: HashSet<String> = permissions_from_modules(&plan.modules).into_iter().collect();
        if !allowed.is_empty() {
            items.retain(|p| allowed.contains(&p.slug));
        }
    }

    for perm in &mut items {
        if let Some(module_key) = module_key_for_permission_slug(&perm.slug) {
            perm.group = Some(module_label_for_key(module_key).to_string());
        } else if perm.group.is_none() {
            perm.group = Some("Other".to_string());
        }
    }

    items.sort_by(|a, b| {
        let a_key = module_key_for_permission_slug(&a.slug).unwrap_or("zzz");
        let b_key = module_key_for_permission_slug(&b.slug).unwrap_or("zzz");
        module_sort_index(a_key)
            .cmp(&module_sort_index(b_key))
            .then_with(|| a.name.cmp(&b.name))
    });

    items
}

fn plan_permissions_payload(conn: &crate::db::Connection, org_id: i64) -> serde_json::Value {
    let permissions = plan_filtered_permissions(conn, org_id);
    let by_slug: HashMap<String, Permission> = permissions
        .iter()
        .cloned()
        .map(|p| (p.slug.clone(), p))
        .collect();

    let plan_modules = load_org_plan(conn, org_id)
        .map(|p| p.modules)
        .unwrap_or_default();
    let plan_set: HashSet<String> = plan_modules.iter().cloned().collect();

    let modules: Vec<serde_json::Value> = MODULE_CATALOG
        .iter()
        .filter(|(key, _)| plan_set.is_empty() || plan_set.contains(*key))
        .map(|(module_key, _)| {
            let module_permissions: Vec<Permission> = permissions_for_module(module_key)
                .iter()
                .filter_map(|slug| by_slug.get(*slug).cloned())
                .collect();
            serde_json::json!({
                "key": module_key,
                "label": module_label_for_key(module_key),
                "permissions": module_permissions,
            })
        })
        .collect();

    serde_json::json!({
        "permissions": permissions,
        "modules": modules,
    })
}

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let payload = plan_permissions_payload(&conn, org_id);
    HttpResponse::Ok().json(ApiResponse::success(payload))
}

pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    index(pool, req).await
}

pub async fn show(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let perm = match conn.query_row(
        "SELECT * FROM permissions WHERE id=?1",
        [path.into_inner()],
        Permission::from_row,
    ) {
        Ok(p) => p,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Not found")),
    };
    if let Some(plan) = load_org_plan(&conn, org_id) {
        let allowed: HashSet<String> = permissions_from_modules(&plan.modules).into_iter().collect();
        if !allowed.is_empty() && !allowed.contains(&perm.slug) {
            return HttpResponse::NotFound().json(ApiError::new("Not found"));
        }
    }
    HttpResponse::Ok().json(ApiResponse::success(perm))
}

pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    _body: web::Json<crate::models::permission::CreatePermissionRequest>,
) -> HttpResponse {
    let _c = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let _ = pool.get();
    HttpResponse::Forbidden().json(ApiError::new(
        "Permission catalog is platform-managed and cannot be modified by tenant admins",
    ))
}

pub async fn update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    _path: web::Path<i64>,
    _body: web::Json<crate::models::permission::CreatePermissionRequest>,
) -> HttpResponse {
    let _c = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let _ = pool.get();
    HttpResponse::Forbidden().json(ApiError::new(
        "Permission catalog is platform-managed and cannot be modified by tenant admins",
    ))
}

pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, _path: web::Path<i64>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let _ = pool.get();
    HttpResponse::Forbidden().json(ApiError::new(
        "Permission catalog is platform-managed and cannot be modified by tenant admins",
    ))
}
