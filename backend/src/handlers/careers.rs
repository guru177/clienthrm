use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;
use crate::career_logic::{self, json_list_to_db, unique_career_slug, CAREER_COLUMNS};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::career::UpsertCareerRequest;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::{org_id_from_claims, resolve_organization_id};

#[derive(Debug, Deserialize)]
pub struct PublicCareersQuery {
    pub org_slug: Option<String>,
}

fn list_careers(conn: &crate::db::Connection, org_id: i64) -> Vec<serde_json::Value> {
    let sql = format!(
        "SELECT {CAREER_COLUMNS} FROM careers WHERE organization_id = ?1 ORDER BY created_at DESC"
    );
    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map([org_id], career_logic::career_from_row)
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
    HttpResponse::Ok().json(ApiResponse::success(list_careers(&conn, org_id)))
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
    let sql = format!(
        "SELECT {CAREER_COLUMNS} FROM careers WHERE id=?1 AND organization_id = ?2"
    );
    match conn.query_row(&sql, crate::params![path.into_inner(), org_id], career_logic::career_from_row) {
        Ok(c) => HttpResponse::Ok().json(ApiResponse::success(c)),
        Err(_) => HttpResponse::NotFound().json(ApiError::new("Not found")),
    }
}

pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<UpsertCareerRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let title = match crate::validation::require_non_empty(&body.title, "Title") {
        Ok(t) => t,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let slug = body
        .slug
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| unique_career_slug(&conn, &title, org_id, None));
    let job_type = body.resolved_job_type();
    let is_active = if body.is_active.unwrap_or(true) { 1 } else { 0 };
    let location = crate::validation::normalize_optional(body.location.clone()).unwrap_or_default();
    let description = crate::validation::normalize_optional(body.description.clone()).unwrap_or_default();
    let requirements = json_list_to_db(&body.requirements);
    let responsibilities = json_list_to_db(&body.responsibilities);

    match conn.execute(
        "INSERT INTO careers (title, slug, location, job_type, experience_required, description, requirements, responsibilities, salary_range, is_active, organization_id, posted_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12, ?12)",
        crate::params![
            title,
            slug,
            location,
            job_type,
            body.experience_required,
            description,
            requirements,
            responsibilities,
            body.salary_range,
            is_active,
            org_id,
            &now,
        ],
    ) {
        Ok(_) => HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
            "id": conn.last_insert_rowid()
        }))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}

pub async fn update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<UpsertCareerRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let career_id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let existing_slug: Option<String> = conn
        .query_row(
            "SELECT slug FROM careers WHERE id=?1 AND organization_id=?2",
            crate::params![career_id, org_id],
            |r| r.get_idx::<String>(0),
        )
        .ok();
    let Some(existing_slug) = existing_slug else {
        return HttpResponse::NotFound().json(ApiError::new("Career not found"));
    };

    let title = match crate::validation::require_non_empty(&body.title, "Title") {
        Ok(t) => t,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let slug = body
        .slug
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| unique_career_slug(&conn, &title, org_id, Some(career_id)));
    let slug = if slug == existing_slug {
        existing_slug
    } else {
        slug
    };
    let job_type = body.resolved_job_type();
    let is_active = if body.is_active.unwrap_or(true) { 1 } else { 0 };
    let location = crate::validation::normalize_optional(body.location.clone()).unwrap_or_default();
    let description = crate::validation::normalize_optional(body.description.clone()).unwrap_or_default();
    let requirements = json_list_to_db(&body.requirements);
    let responsibilities = json_list_to_db(&body.responsibilities);

    let updated = conn.execute(
        "UPDATE careers SET title=?1, slug=?2, location=?3, job_type=?4, experience_required=?5,
         description=?6, requirements=?7, responsibilities=?8, salary_range=?9, is_active=?10, updated_at=?11
         WHERE id=?12 AND organization_id = ?13",
        crate::params![
            title,
            slug,
            location,
            job_type,
            body.experience_required,
            description,
            requirements,
            responsibilities,
            body.salary_range,
            is_active,
            &now,
            career_id,
            org_id,
        ],
    );
    if updated.unwrap_or(0) == 0 {
        return HttpResponse::NotFound().json(ApiError::new("Career not found"));
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"})))
}

pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let id = path.into_inner();
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM careers WHERE id=?1 AND organization_id = ?2",
            crate::params![id, org_id],
            |_| Ok(()),
        )
        .is_ok();
    if !exists {
        return HttpResponse::NotFound().json(ApiError::new("Career not found"));
    }
    let app_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM job_applications WHERE career_id=?1 AND organization_id = ?2",
            crate::params![id, org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if app_count > 0 {
        let _ = conn.execute(
            "UPDATE careers SET is_active=0, updated_at=?1 WHERE id=?2 AND organization_id = ?3",
            crate::params![&now, id, org_id],
        );
        return HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "message": "Career deactivated (applications preserved)"
        })));
    }
    let _ = conn.execute(
        "DELETE FROM careers WHERE id=?1 AND organization_id = ?2",
        crate::params![id, org_id],
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"})))
}

pub async fn stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let (total, active): (i64, i64) = conn
        .query_row(
            "SELECT COUNT(*),
                    COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0)
             FROM careers WHERE organization_id = ?1",
            [org_id],
            |r| Ok((r.get_idx::<i64>(0)?, r.get_idx::<i64>(1)?)),
        )
        .unwrap_or((0, 0));
    let total_applications: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM job_applications WHERE organization_id = ?1",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "total": total,
        "active": active,
        "inactive": total - active,
        "total_applications": total_applications,
    })))
}

pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    index(pool, req).await
}

/// GET /api/public/careers — active job postings for a tenant (no auth).
pub async fn public_list(
    pool: web::Data<DbPool>,
    query: web::Query<PublicCareersQuery>,
) -> HttpResponse {
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let org_id = match resolve_organization_id(&conn, query.org_slug.as_deref()) {
        Ok(id) => id,
        Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&e)),
    };
    let sql = format!(
        "SELECT {CAREER_COLUMNS} FROM careers
         WHERE organization_id = ?1 AND is_active = 1
         ORDER BY COALESCE(posted_at, created_at) DESC, id DESC"
    );
    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let careers: Vec<serde_json::Value> = stmt
        .query_map([org_id], career_logic::career_from_row);
    HttpResponse::Ok().json(ApiResponse::success(careers))
}
