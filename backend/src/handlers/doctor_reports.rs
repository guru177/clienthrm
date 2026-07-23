use actix_multipart::Multipart;
use actix_web::{web, HttpRequest, HttpResponse};
use futures_util::StreamExt;
use serde::Deserialize;

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::middleware::rbac::{has_permission, load_user_permissions};
use crate::models::doctor_report::{DoctorReport, UpsertDoctorReportRequest};
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub employee_id: Option<i64>,
    pub status: Option<String>,
}

/// GET /api/admin/doctor-reports — list doctor reports.
/// Doctor/admin: org-wide (optional employee_id filter).
/// Users with only view-my-doctor-reports: force employee_user_id = claims.sub and status = published.
pub async fn index(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<ListQuery>,
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

    let is_super = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    let perms = load_user_permissions(&conn, claims.sub, is_super);

    let has_admin_view = has_permission(&perms, "view-doctor-reports");
    let has_self_view = has_permission(&perms, "view-my-doctor-reports");

    if !has_admin_view && !has_self_view {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: view-doctor-reports"));
    }

    let mut sql = String::from(
        "SELECT dr.*, eu.name AS employee_name, du.name AS doctor_name
         FROM doctor_reports dr
         LEFT JOIN users eu ON eu.id = dr.employee_user_id
         LEFT JOIN users du ON du.id = dr.doctor_user_id
         WHERE dr.organization_id = ?1",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];

    if has_admin_view {
        // Doctor/admin can filter by employee
        if let Some(eid) = query.employee_id {
            sql.push_str(" AND dr.employee_user_id = ?");
            params.push(crate::db::into_param_value(eid));
        }
        if let Some(ref status) = query.status {
            sql.push_str(" AND dr.status = ?");
            params.push(crate::db::into_param_value(status.clone()));
        }
        let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
        let mut conditions = Vec::new();
        crate::branch_scope::push_users_branch_condition_qmark(
            &mut conditions,
            &mut params,
            &scope,
            "eu",
        );
        for c in &conditions {
            sql.push_str(" AND ");
            sql.push_str(c);
        }
    } else {
        // Employee self-service: only own published reports
        sql.push_str(" AND dr.employee_user_id = ? AND dr.status = 'published'");
        params.push(crate::db::into_param_value(claims.sub));
    }

    sql.push_str(" ORDER BY dr.consultation_date DESC, dr.id DESC");

    let items: Vec<DoctorReport> = conn
        .prepare(&sql)
        .map(|stmt| stmt.query_map(&params, DoctorReport::from_row))
        .unwrap_or_default();

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// GET /api/admin/me/doctor-reports — explicit self-service list (published only).
pub async fn my_reports(
    pool: web::Data<DbPool>,
    req: HttpRequest,
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

    let items: Vec<DoctorReport> = conn
        .prepare(
            "SELECT dr.*, eu.name AS employee_name, du.name AS doctor_name
             FROM doctor_reports dr
             LEFT JOIN users eu ON eu.id = dr.employee_user_id
             LEFT JOIN users du ON du.id = dr.doctor_user_id
             WHERE dr.organization_id = ?1 AND dr.employee_user_id = ?2 AND dr.status = 'published'
             ORDER BY dr.consultation_date DESC, dr.id DESC",
        )
        .map(|stmt| stmt.query_map(crate::params![org_id, claims.sub], DoctorReport::from_row))
        .unwrap_or_default();

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/admin/doctor-reports — create a new SOAP report.
pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<UpsertDoctorReportRequest>,
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

    if body.consultation_date.trim().is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("Consultation date is required"));
    }

    // Verify employee exists in this org
    if !crate::tenant::user_in_organization(&conn, body.employee_user_id, org_id) {
        return HttpResponse::BadRequest().json(ApiError::new("Employee not found in this organization"));
    }
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Err(resp) =
        crate::branch_scope::require_user_in_scope(&conn, body.employee_user_id, org_id, &scope)
    {
        return resp;
    }

    let status = body.status.as_deref().unwrap_or("draft");
    if status != "draft" && status != "published" {
        return HttpResponse::BadRequest().json(ApiError::new("Status must be draft or published"));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "INSERT INTO doctor_reports (organization_id, employee_user_id, doctor_user_id, consultation_date, subjective, objective, assessment, plan, prescription_notes, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        crate::params![
            org_id,
            body.employee_user_id,
            claims.sub,
            body.consultation_date.trim(),
            body.subjective.as_deref().unwrap_or(""),
            body.objective.as_deref().unwrap_or(""),
            body.assessment.as_deref().unwrap_or(""),
            body.plan.as_deref().unwrap_or(""),
            body.prescription_notes,
            status,
            &now,
            &now
        ],
    ) {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            if status == "published" {
                if let Some(email) = crate::tenant_email::user_email(&conn, body.employee_user_id) {
                    let doctor_name = crate::tenant_email::user_name(&conn, claims.sub)
                        .unwrap_or_else(|| "Doctor".to_string());
                    let (text, html) = crate::doctor_report_email::render_published_email(
                        body.consultation_date.trim(),
                        &doctor_name,
                    );
                    crate::tenant_email::send_tenant_email(
                        &conn,
                        org_id,
                        &email,
                        "Doctor Report Published",
                        text,
                        html,
                    );
                }
                crate::workflow_logic::trigger(
                    &conn,
                    org_id,
                    "doctor_report_published",
                    &serde_json::json!({
                        "report_id": id,
                        "employee_user_id": body.employee_user_id,
                        "user_id": body.employee_user_id,
                        "doctor_user_id": claims.sub,
                        "consultation_date": body.consultation_date.trim(),
                        "organization_id": org_id,
                        "created_by": claims.sub,
                    }),
                );
            }
            HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
                "id": id,
                "message": "Report created"
            })))
        }
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

/// GET /api/admin/doctor-reports/{id} — show a single report.
pub async fn show(
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

    let report_id = path.into_inner();
    let report = match conn.query_row(
        "SELECT dr.*, eu.name AS employee_name, du.name AS doctor_name
         FROM doctor_reports dr
         LEFT JOIN users eu ON eu.id = dr.employee_user_id
         LEFT JOIN users du ON du.id = dr.doctor_user_id
         WHERE dr.id = ?1 AND dr.organization_id = ?2",
        crate::params![report_id, org_id],
        DoctorReport::from_row,
    ) {
        Ok(r) => r,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Report not found")),
    };

    let is_super = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    let perms = load_user_permissions(&conn, claims.sub, is_super);
    let has_admin_view = has_permission(&perms, "view-doctor-reports");

    // ACL: admin/doctor can see all in branch; employee sees only own published
    if has_admin_view {
        let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
        if let Err(resp) = crate::branch_scope::require_user_in_scope(
            &conn,
            report.employee_user_id,
            org_id,
            &scope,
        ) {
            return resp;
        }
    } else {
        if report.employee_user_id != claims.sub {
            return HttpResponse::Forbidden().json(ApiError::new("Not allowed"));
        }
        if report.status != "published" {
            return HttpResponse::NotFound().json(ApiError::new("Report not found"));
        }
    }

    HttpResponse::Ok().json(ApiResponse::success(report))
}

/// PUT /api/admin/doctor-reports/{id} — update SOAP report.
pub async fn update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<UpsertDoctorReportRequest>,
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

    let report_id = path.into_inner();

    // Check existing report and ownership
    let (existing_doctor, previous_status, existing_employee): (i64, String, i64) = match conn
        .query_row(
            "SELECT doctor_user_id, status, employee_user_id FROM doctor_reports WHERE id = ?1 AND organization_id = ?2",
            crate::params![report_id, org_id],
            |row| {
                Ok((
                    row.get_idx::<i64>(0)?,
                    row.get_idx::<String>(1)?,
                    row.get_idx::<i64>(2)?,
                ))
            },
        ) {
        Ok(d) => d,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Report not found")),
    };

    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Err(resp) =
        crate::branch_scope::require_user_in_scope(&conn, existing_employee, org_id, &scope)
    {
        return resp;
    }
    if !crate::tenant::user_in_organization(&conn, body.employee_user_id, org_id) {
        return HttpResponse::BadRequest()
            .json(ApiError::new("Employee not found in this organization"));
    }
    if let Err(resp) =
        crate::branch_scope::require_user_in_scope(&conn, body.employee_user_id, org_id, &scope)
    {
        return resp;
    }

    let is_super = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    if existing_doctor != claims.sub && !is_super {
        // Only doctor author, super-admin, or a user with edit-doctor-reports can edit
        let perms = load_user_permissions(&conn, claims.sub, false);
        if !has_permission(&perms, "edit-doctor-reports") {
            return HttpResponse::Forbidden().json(ApiError::new(
                "Only the authoring doctor or an authorized admin can edit this report",
            ));
        }
    }

    let status = body.status.as_deref().unwrap_or("draft");
    if status != "draft" && status != "published" {
        return HttpResponse::BadRequest().json(ApiError::new("Status must be draft or published"));
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "UPDATE doctor_reports SET employee_user_id=?1, consultation_date=?2, subjective=?3, objective=?4, assessment=?5, plan=?6, prescription_notes=?7, status=?8, updated_at=?9
         WHERE id=?10 AND organization_id=?11",
        crate::params![
            body.employee_user_id,
            body.consultation_date.trim(),
            body.subjective.as_deref().unwrap_or(""),
            body.objective.as_deref().unwrap_or(""),
            body.assessment.as_deref().unwrap_or(""),
            body.plan.as_deref().unwrap_or(""),
            body.prescription_notes,
            status,
            &now,
            report_id,
            org_id
        ],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Report not found")),
        Ok(_) => {
            if status == "published" && previous_status != "published" {
                if let Some(email) = crate::tenant_email::user_email(&conn, body.employee_user_id) {
                    let doctor_name = crate::tenant_email::user_name(&conn, claims.sub)
                        .unwrap_or_else(|| "Doctor".to_string());
                    let (text, html) = crate::doctor_report_email::render_published_email(
                        body.consultation_date.trim(),
                        &doctor_name,
                    );
                    crate::tenant_email::send_tenant_email(
                        &conn,
                        org_id,
                        &email,
                        "Doctor Report Published",
                        text,
                        html,
                    );
                }
                crate::workflow_logic::trigger(
                    &conn,
                    org_id,
                    "doctor_report_published",
                    &serde_json::json!({
                        "report_id": report_id,
                        "employee_user_id": body.employee_user_id,
                        "user_id": body.employee_user_id,
                        "doctor_user_id": claims.sub,
                        "consultation_date": body.consultation_date.trim(),
                        "organization_id": org_id,
                        "created_by": claims.sub,
                    }),
                );
            }
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"})))
        }
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

/// DELETE /api/admin/doctor-reports/{id} — delete a report.
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

    let report_id = path.into_inner();

    // Check ownership — author, delete-permission holder, or super-admin
    let (existing_doctor, employee_user_id): (i64, i64) = match conn.query_row(
        "SELECT doctor_user_id, employee_user_id FROM doctor_reports WHERE id = ?1 AND organization_id = ?2",
        crate::params![report_id, org_id],
        |row| Ok((row.get_idx::<i64>(0)?, row.get_idx::<i64>(1)?)),
    ) {
        Ok(d) => d,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Report not found")),
    };

    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Err(resp) =
        crate::branch_scope::require_user_in_scope(&conn, employee_user_id, org_id, &scope)
    {
        return resp;
    }

    let is_super = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    if existing_doctor != claims.sub && !is_super {
        let perms = load_user_permissions(&conn, claims.sub, false);
        if !has_permission(&perms, "delete-doctor-reports") {
            return HttpResponse::Forbidden().json(ApiError::new(
                "Only the authoring doctor or an authorized admin can delete this report",
            ));
        }
    }

    // Delete prescription file if present
    if let Ok(Some(path_str)) = conn.query_row(
        "SELECT prescription_path FROM doctor_reports WHERE id = ?1",
        crate::params![report_id],
        |row| row.get::<Option<String>>("prescription_path"),
    ) {
        crate::storage::delete_photo_path(&path_str);
    }

    match conn.execute(
        "DELETE FROM doctor_reports WHERE id=?1 AND organization_id=?2",
        crate::params![report_id, org_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiError::new("Report not found")),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

/// POST /api/admin/doctor-reports/{id}/prescription — upload prescription file.
pub async fn upload_prescription(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    mut payload: Multipart,
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

    let report_id = path.into_inner();

    // Verify report exists and caller is the doctor author or admin
    let (existing_doctor, employee_user_id): (i64, i64) = match conn.query_row(
        "SELECT doctor_user_id, employee_user_id FROM doctor_reports WHERE id = ?1 AND organization_id = ?2",
        crate::params![report_id, org_id],
        |row| Ok((row.get_idx::<i64>(0)?, row.get_idx::<i64>(1)?)),
    ) {
        Ok(d) => d,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Report not found")),
    };

    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Err(resp) =
        crate::branch_scope::require_user_in_scope(&conn, employee_user_id, org_id, &scope)
    {
        return resp;
    }

    let is_super = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    if existing_doctor != claims.sub && !is_super {
        let perms = load_user_permissions(&conn, claims.sub, false);
        if !has_permission(&perms, "edit-doctor-reports") {
            return HttpResponse::Forbidden().json(ApiError::new(
                "Only the authoring doctor or an admin can upload prescriptions",
            ));
        }
    }

    // Parse multipart
    let mut file_data: Option<(Vec<u8>, String, Option<String>)> = None;
    while let Some(item) = payload.next().await {
        let mut field = match item {
            Ok(f) => f,
            Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&format!("Upload error: {e}"))),
        };
        let field_name = field.name().unwrap_or("").to_string();
        let filename = field
            .content_disposition()
            .and_then(|d| d.get_filename().map(|s| s.to_string()))
            .unwrap_or_else(|| "prescription".to_string());
        let mime = field.content_type().map(|m| m.to_string());
        let mut bytes = Vec::new();
        while let Some(chunk) = field.next().await {
            match chunk {
                Ok(data) => bytes.extend_from_slice(&data),
                Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&format!("Upload error: {e}"))),
            }
        }
        if bytes.is_empty() {
            continue;
        }
        if field_name == "file" || field_name == "prescription" {
            file_data = Some((bytes, filename, mime));
            break;
        }
        if file_data.is_none() {
            file_data = Some((bytes, filename, mime));
        }
    }

    let Some((data, filename, mime)) = file_data else {
        return HttpResponse::BadRequest().json(ApiError::new("No file uploaded"));
    };

    let relative = match crate::storage::save_doctor_report_file(&data, mime.as_deref(), Some(&filename)) {
        Ok(p) => p,
        Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&e)),
    };

    // Delete old prescription file if it exists
    if let Ok(Some(old_path)) = conn.query_row(
        "SELECT prescription_path FROM doctor_reports WHERE id = ?1",
        crate::params![report_id],
        |row| row.get::<Option<String>>("prescription_path"),
    ) {
        crate::storage::delete_photo_path(&old_path);
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "UPDATE doctor_reports SET prescription_path = ?1, updated_at = ?2 WHERE id = ?3 AND organization_id = ?4",
        crate::params![&relative, &now, report_id, org_id],
    ) {
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "prescription_path": relative,
            "message": "Prescription uploaded"
        }))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}
