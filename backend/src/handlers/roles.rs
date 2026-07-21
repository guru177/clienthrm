use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;
use crate::models::role::Role;
use crate::plan_limits::{load_org_plan, permissions_from_modules, validate_permission_ids_for_org};

fn role_list_json(
    conn: &crate::db::Connection,
    org_id: i64,
) -> crate::db::Result<Vec<serde_json::Value>> {
    // Aggregate counts once — correlated subqueries over permission_role were
    // sequential-scanning a bloated table for every role (~seconds).
    let stmt = conn.prepare(
        "SELECT r.id, r.name, r.slug, r.description, r.created_at,
                COALESCE(uc.users_count, 0) AS users_count,
                COALESCE(pc.permissions_count, 0) AS permissions_count
         FROM roles r
         LEFT JOIN (
             SELECT ru.role_id, COUNT(*) AS users_count
             FROM role_user ru
             INNER JOIN users u ON u.id = ru.user_id AND u.deleted_at IS NULL
             INNER JOIN roles rr ON rr.id = ru.role_id AND u.organization_id = rr.organization_id
             GROUP BY ru.role_id
         ) uc ON uc.role_id = r.id
         LEFT JOIN (
             SELECT pr.role_id, COUNT(DISTINCT p.slug) AS permissions_count
             FROM permission_role pr
             INNER JOIN permissions p ON p.id = pr.permission_id
             GROUP BY pr.role_id
         ) pc ON pc.role_id = r.id
         WHERE r.organization_id = ?1
         ORDER BY r.created_at DESC NULLS LAST, r.id DESC",
    )?;
    let rows = stmt
        .query_map([org_id], |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
                "slug": row.get_idx::<String>(2)?,
                "description": row.get_idx::<Option<String>>(3)?,
                "created_at": row.get_idx::<Option<String>>(4)?,
                "users_count": row.get_idx::<i64>(5)?,
                "permissions_count": row.get_idx::<i64>(6)?,
            }))
        });
    Ok(rows)
}

/// Lightweight role picker for forms (edit user, etc.) — no count subqueries.
fn role_options_json(
    conn: &crate::db::Connection,
    org_id: i64,
) -> crate::db::Result<Vec<serde_json::Value>> {
    let stmt = conn.prepare(
        "SELECT r.id, r.name, r.slug, r.description
         FROM roles r
         WHERE r.organization_id = ?1
         ORDER BY r.id DESC",
    )?;
    Ok(stmt.query_map([org_id], |row| {
        Ok(serde_json::json!({
            "id": row.get_idx::<i64>(0)?,
            "name": row.get_idx::<String>(1)?,
            "slug": row.get_idx::<String>(2)?,
            "description": row.get_idx::<Option<String>>(3)?,
        }))
    }))
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
    match role_list_json(&conn, org_id) {
        Ok(items) => HttpResponse::Ok().json(ApiResponse::success(items)),
        Err(e) => HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    }
}

pub async fn show(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let role_id = path.into_inner();
    let role = match conn.query_row(
        "SELECT * FROM roles WHERE id=?1 AND organization_id=?2",
        crate::params![role_id, org_id],
        Role::from_row,
    ) {
        Ok(r) => r,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Not found")),
    };
    let stmt = conn
        .prepare(
            "SELECT p.id, p.name, p.slug, p.\"group\" FROM permissions p
             JOIN permission_role pr ON p.id = pr.permission_id
             WHERE pr.role_id = ?1 ORDER BY p.\"group\", p.name",
        )
        .unwrap();
    let permissions: Vec<serde_json::Value> = stmt
        .query_map([role_id], |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
                "slug": row.get_idx::<String>(2)?,
                "group": row.get_idx::<Option<String>>(3)?,
            }))
        });
    let users_count: i64 = conn
        .query_row(
            "SELECT COUNT(*)
             FROM role_user ru
             INNER JOIN users u ON u.id = ru.user_id
             INNER JOIN roles r ON r.id = ru.role_id
             WHERE ru.role_id = ?1
               AND u.deleted_at IS NULL
               AND u.organization_id = r.organization_id",
            [role_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let permissions_count: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT p.slug)
             FROM permission_role pr
             INNER JOIN permissions p ON p.id = pr.permission_id
             WHERE pr.role_id = ?1",
            [role_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "id": role.id,
        "name": role.name,
        "slug": role.slug,
        "description": role.description,
        "users_count": users_count,
        "permissions_count": permissions_count,
        "permissions": permissions,
        "created_at": role.created_at,
    })))
}

pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<crate::models::role::CreateRoleRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let description = crate::validation::normalize_optional(body.description.clone());
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let slug = body
        .slug
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| name.to_lowercase().replace(' ', "-"));
    match conn.execute(
        "INSERT INTO roles (name,slug,description,organization_id,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6)",
        crate::params![name, slug, description, org_id, &now, &now],
    ) {
        Ok(_) => {
            let role_id = conn.last_insert_rowid();
            if let Some(ref pids) = body.permission_ids {
                if let Err(msg) = validate_permission_ids_for_org(&conn, org_id, pids) {
                    let _ = conn.execute(
                        "DELETE FROM roles WHERE id = ?1 AND organization_id = ?2",
                        crate::params![role_id, org_id],
                    );
                    return HttpResponse::BadRequest().json(ApiError::new(&msg));
                }
                for pid in pids {
                    let _ = conn.execute("INSERT OR IGNORE INTO permission_role (permission_id,role_id,created_at,updated_at) VALUES (?1,?2,?3,?4)",
                        crate::params![pid, role_id, &now, &now]);
                }
            }
            HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"id": role_id})))
        }
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct UpdateRoleBody {
    name: String,
    slug: Option<String>,
    description: Option<String>,
    permission_ids: Option<Vec<i64>>,
    permissions: Option<Vec<i64>>,
}

pub async fn update(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<UpdateRoleBody>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let description = crate::validation::normalize_optional(body.description.clone());
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let id = path.into_inner();
    let slug = body
        .slug
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| name.to_lowercase().replace(' ', "_"));
    match conn.execute(
        "UPDATE roles SET name=?1,slug=?2,description=?3,updated_at=?4 WHERE id=?5 AND organization_id=?6",
        crate::params![name, slug, description, &now, id, org_id],
    ) {
        Ok(0) => return HttpResponse::NotFound().json(ApiError::new("Not found")),
        Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
        _ => {}
    }
    let pids = body.permission_ids.as_ref().or(body.permissions.as_ref());
    if let Some(pids) = pids {
        if let Err(msg) = validate_permission_ids_for_org(&conn, org_id, pids) {
            return HttpResponse::BadRequest().json(ApiError::new(&msg));
        }
        let _ = conn.execute("DELETE FROM permission_role WHERE role_id=?1", [id]);
        for pid in pids {
            let _ = conn.execute("INSERT INTO permission_role (permission_id,role_id,created_at,updated_at) VALUES (?1,?2,?3,?4)",
                crate::params![pid, id, &now, &now]);
        }
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"})))
}

pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let role_id = path.into_inner();
    let slug: String = conn
        .query_row(
            "SELECT COALESCE(slug, '') FROM roles WHERE id=?1 AND organization_id=?2",
            crate::params![role_id, org_id],
            |r| r.get_idx::<String>(0),
        )
        .unwrap_or_default();
    if slug.is_empty() {
        return HttpResponse::NotFound().json(ApiError::new("Not found"));
    }
    if crate::role_defaults::is_system_role_slug(&slug) {
        return HttpResponse::BadRequest().json(ApiError::new(
            "System roles (Admin, Manager, Branch Admin, HR, Doctor, Employee) cannot be deleted",
        ));
    }
    match conn.execute(
        "DELETE FROM roles WHERE id=?1 AND organization_id=?2",
        crate::params![role_id, org_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Not found")),
        Ok(_) => {
            let _ = conn.execute("DELETE FROM permission_role WHERE role_id=?1", [role_id]);
            let _ = conn.execute("DELETE FROM role_user WHERE role_id=?1", [role_id]);
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"})))
        }
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c) => c, Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c) => c, Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let t: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM roles WHERE organization_id=?1",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let permissions_total = match load_org_plan(&conn, org_id) {
        Some(plan) => permissions_from_modules(&plan.modules).len() as i64,
        None => conn
            .query_row("SELECT COUNT(*) FROM permissions", [], |r| r.get_idx::<i64>(0))
            .unwrap_or(0),
    };
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "total": t,
        "permissions_total": permissions_total,
    })))
}

pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    match role_options_json(&conn, org_id) {
        Ok(items) => HttpResponse::Ok().json(ApiResponse::success(items)),
        Err(e) => HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    }
}
