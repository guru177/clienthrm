use actix_web::{web, HttpRequest, HttpResponse};
use chrono::Datelike;
use serde::Deserialize;

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::{org_id_from_claims, user_in_organization};

#[derive(Debug, Deserialize)]
pub struct LeavePolicyRequest {
    pub annual_leave_quota: i64,
}

#[derive(Debug, Deserialize)]
pub struct LeaveCreditListQuery {
    pub user_id: Option<i64>,
    pub year: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct StoreLeaveCreditRequest {
    pub user_id: i64,
    pub days: i64,
    pub reason: String,
    pub source: Option<String>,
    pub work_date: Option<String>,
    pub year: Option<i32>,
    pub notes: Option<String>,
}

fn credit_to_json(row: &crate::db::Row) -> crate::db::Result<serde_json::Value> {
    Ok(serde_json::json!({
        "id": row.get_idx::<i64>(0)?,
        "user_id": row.get_idx::<i64>(1)?,
        "user_name": row.get_idx::<Option<String>>(2)?,
        "employee_id": row.get_idx::<Option<String>>(3)?,
        "days": row.get_idx::<i64>(4)?,
        "reason": row.get_idx::<String>(5)?,
        "source": row.get_idx::<String>(6)?,
        "work_date": row.get_idx::<Option<String>>(7)?,
        "year": row.get_idx::<i32>(8)?,
        "notes": row.get_idx::<Option<String>>(9)?,
        "created_by": row.get_idx::<Option<i64>>(10)?,
        "created_by_name": row.get_idx::<Option<String>>(11)?,
        "created_at": row.get_idx::<Option<String>>(12)?,
    }))
}

/// GET /api/admin/settings/leave-policy
pub async fn policy_show(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let quota = crate::payroll_logic::annual_leave_quota(&conn, org_id);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "annual_leave_quota": quota,
    })))
}

/// PUT /api/admin/settings/leave-policy
pub async fn policy_update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<LeavePolicyRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    if body.annual_leave_quota < 0 || body.annual_leave_quota > 365 {
        return HttpResponse::BadRequest().json(ApiError::new(
            "Annual leave quota must be between 0 and 365 days",
        ));
    }
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let val = body.annual_leave_quota.to_string();
    if conn
        .execute(
            "INSERT INTO app_settings (organization_id, key, value, type, description, created_at, updated_at)
             VALUES (?1, 'annual_leave_quota', ?2, 'number', 'Annual leave days per employee', ?3, ?3)
             ON CONFLICT(organization_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            crate::params![org_id, val, &now],
        )
        .is_err()
    {
        return HttpResponse::InternalServerError().json(ApiError::new("Failed to save leave policy"));
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "annual_leave_quota": body.annual_leave_quota,
        "message": "Leave policy updated",
    })))
}

/// GET /api/admin/leave-credits
pub async fn index(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<LeaveCreditListQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let year = query.year.unwrap_or_else(|| chrono::Utc::now().year());
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let mut sql = String::from(
        "SELECT lc.id, lc.user_id, u.name, u.employee_id, lc.days, lc.reason, lc.source,
                lc.work_date, lc.year, lc.notes, lc.created_by, cb.name, lc.created_at
         FROM leave_credits lc
         INNER JOIN users u ON u.id = lc.user_id AND u.organization_id = ?1
         LEFT JOIN users cb ON cb.id = lc.created_by
         WHERE lc.organization_id = ?1 AND lc.deleted_at IS NULL AND lc.year = ?2",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![
        crate::db::into_param_value(org_id),
        crate::db::into_param_value(year),
    ];
    if let Some(uid) = query.user_id {
        sql.push_str(" AND lc.user_id = ?3");
        params.push(crate::db::into_param_value(uid));
    }
    sql.push_str(" ORDER BY lc.created_at DESC, lc.id DESC");

    let stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };
    let items: Vec<serde_json::Value> = stmt
        .query_map(&params, credit_to_json);

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/admin/leave-credits
pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<StoreLeaveCreditRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    if body.days <= 0 || body.days > 30 {
        return HttpResponse::BadRequest().json(ApiError::new("Days must be between 1 and 30"));
    }
    if body.reason.trim().is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Reason is required"));
    }
    let source = body.source.as_deref().unwrap_or("manual").trim();
    if source != "manual" && source != "holiday_work" {
        return HttpResponse::BadRequest().json(ApiError::new(
            "source must be manual or holiday_work",
        ));
    }
    let year = if let Some(y) = body.year {
        y
    } else if let Some(ref wd) = body.work_date {
        chrono::NaiveDate::parse_from_str(wd, "%Y-%m-%d")
            .map(|d| d.year())
            .unwrap_or_else(|_| chrono::Utc::now().year())
    } else {
        chrono::Utc::now().year()
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    if !user_in_organization(&conn, body.user_id, org_id) {
        return HttpResponse::BadRequest().json(ApiError::new("Employee not found in your organization"));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "INSERT INTO leave_credits
         (organization_id, user_id, days, reason, source, work_date, year, created_by, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
        crate::params![
            org_id,
            body.user_id,
            body.days,
            body.reason.trim(),
            source,
            body.work_date,
            year,
            claims.sub,
            body.notes,
            &now,
        ],
    ) {
        Ok(_) => HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
            "id": conn.last_insert_rowid(),
            "message": "Bonus leave granted",
        }))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}

/// DELETE /api/admin/leave-credits/{id}
pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let credit: Option<(i64, i32, i64)> = conn
        .query_row(
            "SELECT user_id, year, days FROM leave_credits
             WHERE id = ?1 AND organization_id = ?2 AND deleted_at IS NULL",
            crate::params![id, org_id],
            |row| Ok((row.get_idx::<i64>(0)?, row.get_idx::<i32>(1)?, row.get_idx::<i64>(2)?)),
        ).ok();

    let Some((user_id, year, days)) = credit else {
        return HttpResponse::NotFound().json(ApiError::new("Leave credit not found"));
    };

    let used = crate::payroll_logic::employee_leave_used_in_year(&conn, user_id, year);
    let pending = crate::payroll_logic::employee_pending_leave_days_in_year(&conn, user_id, year);
    let effective =
        crate::payroll_logic::employee_effective_leave_quota(&conn, user_id, year, org_id);
    let new_effective = effective.saturating_sub(days);
    if used + pending > new_effective {
        return HttpResponse::BadRequest().json(ApiError::new(
            "Cannot remove this credit: the employee has already used more leave than the remaining quota would allow",
        ));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "UPDATE leave_credits SET deleted_at = ?1, updated_at = ?1
         WHERE id = ?2 AND organization_id = ?3 AND deleted_at IS NULL",
        crate::params![&now, id, org_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Leave credit not found")),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "deleted": true,
        }))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}
