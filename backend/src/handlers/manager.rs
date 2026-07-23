//! Manager self-service: team attendance and leave scoped by reporting_manager_id / manager_id.

use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;

fn is_direct_report(conn: &crate::db::Connection, manager_id: i64, user_id: i64, org_id: i64) -> bool {
    conn.query_row(
        "SELECT 1 FROM users
         WHERE id = ?1 AND organization_id = ?2 AND deleted_at IS NULL
           AND (reporting_manager_id = ?3 OR manager_id = ?3)",
        crate::params![user_id, org_id, manager_id],
        |_| Ok(()),
    )
    .is_ok()
}

/// GET /api/admin/manager/team
pub async fn team(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let stmt = match conn.prepare(
        "SELECT id, name, email, employee_id, department_id, status
         FROM users
         WHERE organization_id = ?1 AND deleted_at IS NULL
           AND (reporting_manager_id = ?2 OR manager_id = ?2)
         ORDER BY name",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    let rows: Vec<serde_json::Value> = stmt.query_map(crate::params![org_id, claims.sub], |row| {
        Ok(serde_json::json!({
            "id": row.get_idx::<i64>(0)?,
            "name": row.get_idx::<String>(1)?,
            "email": row.get_idx::<Option<String>>(2)?,
            "employee_id": row.get_idx::<Option<String>>(3)?,
            "department_id": row.get_idx::<Option<i64>>(4)?,
            "status": row.get_idx::<Option<String>>(5)?,
        }))
    });

    HttpResponse::Ok().json(ApiResponse::success(rows))
}

#[derive(Debug, Deserialize)]
pub struct TeamAttendanceQuery {
    pub date: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
}

/// GET /api/admin/manager/attendance
pub async fn team_attendance(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<TeamAttendanceQuery>,
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

    let date = query
        .date
        .clone()
        .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
    let from = query.from.clone().unwrap_or_else(|| date.clone());
    let to = query.to.clone().unwrap_or_else(|| date.clone());

    let stmt = match conn.prepare(
        "SELECT u.id, u.name, u.employee_id, a.id, a.date, a.clock_in, a.clock_out,
                a.status, a.is_late, a.source
         FROM users u
         LEFT JOIN attendance a ON a.user_id = u.id AND a.date >= ?3 AND a.date <= ?4
         WHERE u.organization_id = ?1 AND u.deleted_at IS NULL
           AND (u.reporting_manager_id = ?2 OR u.manager_id = ?2)
         ORDER BY u.name, a.date DESC",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    let rows: Vec<serde_json::Value> =
        stmt.query_map(crate::params![org_id, claims.sub, &from, &to], |row| {
            Ok(serde_json::json!({
                "user_id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
                "employee_id": row.get_idx::<Option<String>>(2)?,
                "attendance_id": row.get_idx::<Option<i64>>(3)?,
                "date": row.get_idx::<Option<String>>(4)?,
                "clock_in": row.get_idx::<Option<String>>(5)?,
                "clock_out": row.get_idx::<Option<String>>(6)?,
                "status": row.get_idx::<Option<String>>(7)?,
                "is_late": row.get_idx::<Option<i64>>(8)?.unwrap_or(0) == 1,
                "source": row.get_idx::<Option<String>>(9)?,
            }))
        });

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "from": from,
        "to": to,
        "records": rows,
    })))
}

#[derive(Debug, Deserialize)]
pub struct TeamLeaveQuery {
    pub status: Option<String>,
}

/// GET /api/admin/manager/leave-requests
pub async fn team_leave(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<TeamLeaveQuery>,
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

    let status = query
        .status
        .clone()
        .filter(|s| !s.is_empty() && s != "all")
        .unwrap_or_else(|| "pending".to_string());

    let stmt = match conn.prepare(
        "SELECT lr.id, lr.user_id, u.name, lr.leave_type, lr.start_date, lr.end_date,
                lr.days_count, lr.status, lr.reason, lr.created_at
         FROM leave_requests lr
         INNER JOIN users u ON u.id = lr.user_id AND u.organization_id = ?1
         WHERE lr.deleted_at IS NULL
           AND (u.reporting_manager_id = ?2 OR u.manager_id = ?2)
           AND lr.status = ?3
         ORDER BY lr.created_at DESC
         LIMIT 200",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    let rows: Vec<serde_json::Value> =
        stmt.query_map(crate::params![org_id, claims.sub, &status], |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "user_id": row.get_idx::<i64>(1)?,
                "employee_name": row.get_idx::<String>(2)?,
                "leave_type": row.get_idx::<String>(3)?,
                "start_date": row.get_idx::<String>(4)?,
                "end_date": row.get_idx::<String>(5)?,
                "days_count": row.get_idx::<i64>(6)?,
                "status": row.get_idx::<String>(7)?,
                "reason": row.get_idx::<Option<String>>(8)?,
                "created_at": row.get_idx::<Option<String>>(9)?,
            }))
        });

    HttpResponse::Ok().json(ApiResponse::success(rows))
}

#[derive(Debug, Deserialize, Default)]
pub struct ManagerLeaveDecision {
    pub remarks: Option<String>,
    pub rejection_reason: Option<String>,
}

/// POST /api/admin/manager/leave-requests/{id}/approve
pub async fn approve_leave(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: Option<web::Json<ManagerLeaveDecision>>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let leave_id = path.into_inner();
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let info: Option<(i64, String, String, String, i64, Option<String>)> = conn
        .query_row(
            "SELECT lr.user_id, lr.leave_type, lr.start_date, lr.end_date, lr.days_count, lr.reason
             FROM leave_requests lr
             INNER JOIN users u ON u.id = lr.user_id AND u.organization_id = ?2
             WHERE lr.id = ?1 AND lr.deleted_at IS NULL AND lr.status = 'pending'",
            crate::params![leave_id, org_id],
            |r| {
                Ok((
                    r.get_idx::<i64>(0)?,
                    r.get_idx::<String>(1)?,
                    r.get_idx::<String>(2)?,
                    r.get_idx::<String>(3)?,
                    r.get_idx::<i64>(4)?,
                    r.get_idx::<Option<String>>(5)?,
                ))
            },
        )
        .ok();
    let Some((user_id, leave_type, start_date, end_date, days_count, reason)) = info else {
        return HttpResponse::NotFound().json(ApiError::new("Leave request not found"));
    };
    if !is_direct_report(&conn, claims.sub, user_id, org_id) {
        return HttpResponse::Forbidden().json(ApiError::new(
            "You can only approve leave for your direct reports",
        ));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let remarks = body.and_then(|b| b.remarks.clone());
    let updated = conn.execute(
        "UPDATE leave_requests SET status='approved', approved_by=?1, approved_at=?2,
         remarks=COALESCE(?3, remarks), updated_at=?2
         WHERE id=?4 AND status='pending' AND deleted_at IS NULL",
        crate::params![claims.sub, &now, remarks, leave_id],
    );
    if updated.unwrap_or(0) == 0 {
        return HttpResponse::Conflict().json(ApiError::new("Already processed"));
    }

    crate::attendance_logic::sync_attendance_after_leave_approved(
        &conn,
        user_id,
        &start_date,
        &end_date,
    );

    let ctx = serde_json::json!({
        "leave_id": leave_id,
        "user_id": user_id,
        "leave_type": leave_type,
        "start_date": start_date,
        "end_date": end_date,
        "days_count": days_count,
        "reason": reason,
        "approved_by": claims.sub,
        "organization_id": org_id,
    });
    crate::workflow_logic::trigger(&conn, org_id, "leave_request_approved", &ctx);
    crate::tenant_webhooks::dispatch(&conn, org_id, "leave.approved", &ctx);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Approved"})))
}

/// POST /api/admin/manager/leave-requests/{id}/reject
pub async fn reject_leave(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: Option<web::Json<ManagerLeaveDecision>>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let leave_id = path.into_inner();
    let conn = match pool.get_for_tenant(org_id) {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let info: Option<(i64, String, String, String, i64, Option<String>)> = conn
        .query_row(
            "SELECT lr.user_id, lr.leave_type, lr.start_date, lr.end_date, lr.days_count, lr.reason
             FROM leave_requests lr
             INNER JOIN users u ON u.id = lr.user_id AND u.organization_id = ?2
             WHERE lr.id = ?1 AND lr.deleted_at IS NULL AND lr.status = 'pending'",
            crate::params![leave_id, org_id],
            |r| {
                Ok((
                    r.get_idx::<i64>(0)?,
                    r.get_idx::<String>(1)?,
                    r.get_idx::<String>(2)?,
                    r.get_idx::<String>(3)?,
                    r.get_idx::<i64>(4)?,
                    r.get_idx::<Option<String>>(5)?,
                ))
            },
        )
        .ok();
    let Some((user_id, leave_type, start_date, end_date, days_count, request_reason)) = info else {
        return HttpResponse::NotFound().json(ApiError::new("Leave request not found"));
    };
    if !is_direct_report(&conn, claims.sub, user_id, org_id) {
        return HttpResponse::Forbidden().json(ApiError::new(
            "You can only reject leave for your direct reports",
        ));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let decision = body.map(|b| b.into_inner()).unwrap_or_default();
    let reason = decision
        .rejection_reason
        .or(decision.remarks)
        .unwrap_or_else(|| "Rejected by manager".to_string());

    let updated = conn.execute(
        "UPDATE leave_requests SET status='rejected', approved_by=?1, rejection_reason=?2, updated_at=?3
         WHERE id=?4 AND status='pending' AND deleted_at IS NULL",
        crate::params![claims.sub, &reason, &now, leave_id],
    );
    if updated.unwrap_or(0) == 0 {
        return HttpResponse::Conflict().json(ApiError::new("Already processed"));
    }

    crate::workflow_logic::trigger(
        &conn,
        org_id,
        "leave_request_rejected",
        &serde_json::json!({
            "leave_id": leave_id,
            "user_id": user_id,
            "leave_type": leave_type,
            "start_date": start_date,
            "end_date": end_date,
            "days_count": days_count,
            "reason": request_reason,
            "rejected_by": claims.sub,
            "rejection_reason": reason,
            "organization_id": org_id,
        }),
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Rejected"})))
}
