use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::holiday::Holiday;
use crate::tenant::org_id_from_claims;

fn parse_year(req: &HttpRequest) -> Option<i32> {
    let params: Vec<(String, String)> =
        serde_urlencoded::from_str(req.query_string()).unwrap_or_default();
    params
        .iter()
        .find(|(k, _)| k == "year")
        .and_then(|(_, v)| v.parse().ok())
        .filter(|&y| (1970..=2100).contains(&y))
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

    let year = parse_year(&req);
    let mut sql = "SELECT * FROM holidays WHERE organization_id = ?1".to_string();
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    if let Some(y) = year {
        // Inclusive year window — works for DATE and text timestamps.
        let start = format!("{y:04}-01-01");
        let end = format!("{:04}-01-01", y + 1);
        sql.push_str(" AND date >= ?2 AND date < ?3");
        params.push(crate::db::into_param_value(start));
        params.push(crate::db::into_param_value(end));
    }
    sql.push_str(" ORDER BY date");

    let items: Vec<Holiday> = conn.query_map(&sql, &params, Holiday::from_row);
    HttpResponse::Ok().json(ApiResponse::success(items))
}

pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    index(pool, req).await
}

pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<crate::models::holiday::CreateHolidayRequest>,
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
    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let date = match crate::validation::validate_date_yyyy_mm_dd(&body.date, "Date") {
        Ok(d) => d,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let holiday_date = match chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return HttpResponse::BadRequest().json(ApiError::new("Invalid date")),
    };
    let description = crate::validation::normalize_optional(body.description.clone());
    let now = chrono::Utc::now().naive_utc();
    // Company holidays are always paid.
    match conn.execute(
        "INSERT INTO holidays (name,date,description,is_paid,organization_id,created_at,updated_at)
         VALUES (?1,?2,?3,1,?4,?5,?6)",
        crate::params![name, holiday_date, description, org_id, now, now],
    ) {
        Ok(_) => HttpResponse::Created()
            .json(ApiResponse::success(serde_json::json!({"id": conn.last_insert_rowid()}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<crate::models::holiday::CreateHolidayRequest>,
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
    let name = match crate::validation::require_non_empty(&body.name, "Name") {
        Ok(n) => n,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let date = match crate::validation::validate_date_yyyy_mm_dd(&body.date, "Date") {
        Ok(d) => d,
        Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
    };
    let holiday_date = match chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return HttpResponse::BadRequest().json(ApiError::new("Invalid date")),
    };
    let description = crate::validation::normalize_optional(body.description.clone());
    let now = chrono::Utc::now().naive_utc();
    match conn.execute(
        "UPDATE holidays
         SET name=?1, date=?2, description=?3, is_paid=1, updated_at=?4
         WHERE id=?5 AND organization_id=?6",
        crate::params![name, holiday_date, description, now, path.into_inner(), org_id],
    ) {
        Ok(n) if n > 0 => {
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"})))
        }
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Holiday not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn destroy(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
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
    match conn.execute(
        "DELETE FROM holidays WHERE id=?1 AND organization_id=?2",
        crate::params![path.into_inner(), org_id],
    ) {
        Ok(n) if n > 0 => {
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"})))
        }
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Holiday not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}
