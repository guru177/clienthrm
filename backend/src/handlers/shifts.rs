use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;

#[derive(Debug, Deserialize)]
pub struct ShiftTemplateRequest {
    pub name: String,
    pub start_time: String,
    pub end_time: String,
    pub grace_in_minutes: Option<i64>,
    pub grace_out_minutes: Option<i64>,
    pub is_active: Option<bool>,
    /// When true, this template is auto-assigned to employees without a shift.
    pub is_default: Option<bool>,
    /// Weekdays this shift works: mon, tue, wed, thu, fri, sat, sun
    pub working_days: Option<Vec<String>>,
}

fn resolve_working_days_mask(body: &ShiftTemplateRequest) -> i64 {
    match &body.working_days {
        Some(days) if !days.is_empty() => {
            crate::shift_logic::mask_from_weekday_keys(days) as i64
        }
        _ => crate::shift_logic::DEFAULT_WORKING_DAYS_MASK as i64,
    }
}

fn shift_template_json(
    id: i64,
    name: String,
    start_time: String,
    end_time: String,
    grace_in: i64,
    grace_out: i64,
    is_active: bool,
    is_default: bool,
    working_days_mask: i64,
    created_at: Option<String>,
    updated_at: Option<String>,
    assigned_count: i64,
) -> serde_json::Value {
    let mask = crate::shift_logic::normalize_working_days_mask(working_days_mask);
    serde_json::json!({
        "id": id,
        "name": name,
        "start_time": start_time,
        "end_time": end_time,
        "grace_in_minutes": grace_in,
        "grace_out_minutes": grace_out,
        "is_active": is_active,
        "is_default": is_default,
        "working_days_mask": mask,
        "working_days": crate::shift_logic::mask_to_weekday_keys(mask),
        "working_days_label": crate::shift_logic::format_working_days_label(mask),
        "created_at": created_at,
        "updated_at": updated_at,
        "assigned_count": assigned_count,
    })
}

fn set_default_shift(
    conn: &crate::db::Transaction,
    template_id: i64,
    org_id: i64,
) -> crate::db::Result<()> {
    conn.execute(
        "UPDATE shift_templates SET is_default = 0 WHERE organization_id = ?1",
        [org_id],
    )?;
    conn.execute(
        "UPDATE shift_templates SET is_default = 1 WHERE id = ?1 AND organization_id = ?2",
        crate::params![template_id, org_id],
    )?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct ShiftAssignmentRequest {
    pub user_id: i64,
    pub shift_template_id: i64,
    pub effective_from: String,
    pub effective_to: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ShiftRosterQuery {
    pub shift_id: Option<i64>,
    pub date: Option<String>,
    pub center_id: Option<i64>,
}

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);

    let stmt = match conn.prepare(
        "SELECT st.id, st.name, st.start_time, st.end_time, st.grace_in_minutes, st.grace_out_minutes,
                st.is_active, st.is_default, COALESCE(st.working_days_mask, 31) AS working_days_mask,
                st.created_at, st.updated_at
         FROM shift_templates st
         WHERE st.organization_id = ?1
         ORDER BY st.is_default DESC, st.name",
    ) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    let templates: Vec<(
        i64,
        String,
        String,
        String,
        i64,
        i64,
        bool,
        bool,
        i64,
        Option<String>,
        Option<String>,
    )> = stmt.query_map([org_id], |row| {
        Ok((
            row.get_idx::<i64>(0)?,
            row.get_idx::<String>(1)?,
            row.get_idx::<String>(2)?,
            row.get_idx::<String>(3)?,
            row.get_idx::<i64>(4).unwrap_or(0),
            row.get_idx::<i64>(5).unwrap_or(0),
            row.get_idx::<i64>(6).unwrap_or(0) != 0,
            row.get_idx::<i64>(7).unwrap_or(0) != 0,
            row.get_idx::<i64>(8).unwrap_or(31),
            row.get_idx::<Option<String>>(9)?,
            row.get_idx::<Option<String>>(10)?,
        ))
    });

    let mut rows = Vec::with_capacity(templates.len());
    for (id, name, start, end, grace_in, grace_out, is_active, is_default, mask, created, updated) in
        templates
    {
        let mut count_sql = String::from(
            "SELECT COUNT(DISTINCT usa.user_id)
             FROM user_shift_assignments usa
             JOIN users u ON u.id = usa.user_id
             WHERE usa.shift_template_id = ?1
               AND u.deleted_at IS NULL
               AND u.organization_id = ?2",
        );
        let mut count_params: Vec<crate::db::ParamValue> = vec![
            crate::db::into_param_value(id),
            crate::db::into_param_value(org_id),
        ];
        crate::branch_scope::append_users_branch_filter(
            &mut count_sql,
            &mut count_params,
            &scope,
            "u",
        );
        let assigned_count: i64 = conn
            .query_row(&count_sql, &count_params, |r| r.get_idx::<i64>(0))
            .unwrap_or(0);

        // Org-wide count keeps delete safety when the actor only sees their branch.
        let org_assigned_count: i64 = conn
            .query_row(
                "SELECT COUNT(DISTINCT usa.user_id)
                 FROM user_shift_assignments usa
                 JOIN users u ON u.id = usa.user_id
                 WHERE usa.shift_template_id = ?1
                   AND u.deleted_at IS NULL
                   AND u.organization_id = ?2",
                crate::params![id, org_id],
                |r| r.get_idx::<i64>(0),
            )
            .unwrap_or(0);

        let mut json = shift_template_json(
            id,
            name,
            start,
            end,
            grace_in,
            grace_out,
            is_active,
            is_default,
            mask,
            created,
            updated,
            assigned_count,
        );
        if let Some(obj) = json.as_object_mut() {
            obj.insert(
                "org_assigned_count".to_string(),
                serde_json::json!(org_assigned_count),
            );
        }
        rows.push(json);
    }

    HttpResponse::Ok().json(ApiResponse::success(rows))
}

pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<ShiftTemplateRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let tx = match conn.unchecked_transaction() {
        Ok(t) => t,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Could not start transaction")),
    };
    if body.is_default.unwrap_or(false) {
        let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
        if !scope.is_all() {
            return HttpResponse::Forbidden().json(ApiError::new(
                "Only organization admins can set the default shift for all branches",
            ));
        }
        let _ = tx.execute(
            "UPDATE shift_templates SET is_default = 0 WHERE organization_id = ?1",
            [org_id],
        );
    }
    let working_mask = resolve_working_days_mask(&body);
    match tx.execute(
        "INSERT INTO shift_templates (name, start_time, end_time, grace_in_minutes, grace_out_minutes, is_active, is_default, working_days_mask, organization_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
        crate::params![
            body.name.trim(),
            body.start_time.trim(),
            body.end_time.trim(),
            body.grace_in_minutes.unwrap_or(0).max(0),
            body.grace_out_minutes.unwrap_or(0).max(0),
            if body.is_active.unwrap_or(true) { 1 } else { 0 },
            if body.is_default.unwrap_or(false) { 1 } else { 0 },
            working_mask,
            org_id,
            now,
        ],
    ) {
        Ok(_) => {
            let id = tx.last_insert_rowid();
            if tx.commit().is_err() {
                return HttpResponse::InternalServerError().json(ApiError::new("Failed to persist shift"));
            }
            HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
            "id": id,
            "message": "Shift template created",
        })))
        }
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {e}"))),
    }
}

pub async fn update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<ShiftTemplateRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let id = path.into_inner();
    let tx = match conn.unchecked_transaction() {
        Ok(t) => t,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Could not start transaction")),
    };
    match body.is_default {
        Some(true) | Some(false) => {
            let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
            if !scope.is_all() {
                return HttpResponse::Forbidden().json(ApiError::new(
                    "Only organization admins can change the default shift for all branches",
                ));
            }
        }
        None => {}
    }
    match body.is_default {
        Some(true) => {
            if set_default_shift(&tx, id, org_id).is_err() {
                return HttpResponse::InternalServerError().json(ApiError::new("Failed to set default shift"));
            }
        }
        Some(false) => {
            let _ = tx.execute(
                "UPDATE shift_templates SET is_default = 0 WHERE id = ?1 AND organization_id = ?2",
                crate::params![id, org_id],
            );
        }
        None => {}
    }
    let working_mask = resolve_working_days_mask(&body);
    match tx.execute(
        "UPDATE shift_templates
         SET name=?1, start_time=?2, end_time=?3, grace_in_minutes=?4, grace_out_minutes=?5, is_active=?6, working_days_mask=?7, updated_at=?8
         WHERE id=?9 AND organization_id=?10",
        crate::params![
            body.name.trim(),
            body.start_time.trim(),
            body.end_time.trim(),
            body.grace_in_minutes.unwrap_or(0).max(0),
            body.grace_out_minutes.unwrap_or(0).max(0),
            if body.is_active.unwrap_or(true) { 1 } else { 0 },
            working_mask,
            now,
            id,
            org_id,
        ],
    ) {
        Ok(rows) if rows > 0 => {
            if tx.commit().is_err() {
                return HttpResponse::InternalServerError().json(ApiError::new("Failed to persist shift"));
            }
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "message": "Shift template updated",
        })))
        }
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Shift template not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {e}"))),
    }
}

pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let id = path.into_inner();

    let assigned: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM user_shift_assignments usa
             JOIN shift_templates st ON st.id = usa.shift_template_id
             WHERE usa.shift_template_id = ?1 AND st.organization_id = ?2",
            crate::params![id, org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    if assigned > 0 {
        return HttpResponse::BadRequest().json(ApiError::new(&format!(
            "Cannot delete: {assigned} employee(s) are assigned to this shift. Reassign them via Shift Roster first, or deactivate the shift.",
        )));
    }

    let was_default: bool = conn
        .query_row(
            "SELECT is_default FROM shift_templates WHERE id = ?1 AND organization_id = ?2",
            crate::params![id, org_id],
            |r| r.get_idx::<i64>(0),
        )
        .map(|v| v != 0)
        .unwrap_or(false);

    match conn.execute(
        "DELETE FROM shift_templates WHERE id = ?1 AND organization_id = ?2",
        crate::params![id, org_id],
    ) {
        Ok(rows) if rows > 0 => {
            if was_default {
                let _ = crate::shift_logic::ensure_general_shift_template(&conn, org_id);
            }
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "message": "Shift template deleted",
        })))
        }
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Shift template not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {e}"))),
    }
}

pub async fn assign_user(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<ShiftAssignmentRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let tx = match conn.unchecked_transaction() {
        Ok(t) => t,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Could not start transaction")),
    };

    if !crate::tenant::user_in_organization(&conn, body.user_id, org_id) {
        return HttpResponse::BadRequest().json(ApiError::new("User not found in organization"));
    }
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Err(resp) = crate::branch_scope::require_user_in_scope(&conn, body.user_id, org_id, &scope) {
        return resp;
    }
    let shift_ok = tx
        .query_row(
            "SELECT 1 FROM shift_templates WHERE id = ?1 AND organization_id = ?2",
            crate::params![body.shift_template_id, org_id],
            |_| Ok(()),
        )
        .is_ok();
    if !shift_ok {
        return HttpResponse::BadRequest().json(ApiError::new("Shift template not found"));
    }

    // Close any open-ended active assignment before inserting the new one.
    let _ = tx.execute(
        "UPDATE user_shift_assignments
         SET effective_to = ?1, updated_at = ?2
         WHERE user_id = ?3
           AND (effective_to IS NULL OR effective_to >= ?1)",
        crate::params![body.effective_from.trim(), &now, body.user_id],
    );

    let inserted = tx.execute(
        "INSERT INTO user_shift_assignments (user_id, shift_template_id, effective_from, effective_to, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        crate::params![
            body.user_id,
            body.shift_template_id,
            body.effective_from.trim(),
            body.effective_to.as_deref().map(str::trim),
            &now,
        ],
    );

    match inserted {
        Ok(_) => {
            if tx.commit().is_err() {
                return HttpResponse::InternalServerError().json(ApiError::new("Failed to persist assignment"));
            }
            let shift_meta: Option<(String, String, String)> = conn
                .query_row(
                    "SELECT name, start_time, end_time FROM shift_templates WHERE id = ?1 AND organization_id = ?2",
                    crate::params![body.shift_template_id, org_id],
                    |row| {
                        Ok((
                            row.get_idx::<String>(0)?,
                            row.get_idx::<String>(1)?,
                            row.get_idx::<String>(2)?,
                        ))
                    },
                )
                .ok();
            if let Some((name, start, end)) = shift_meta {
                if let Some(email) = crate::tenant_email::user_email(&conn, body.user_id) {
                    let (text, html) = crate::attendance_shift_email::render_shift_assigned_email(
                        &name,
                        body.effective_from.trim(),
                        &start,
                        &end,
                    );
                    crate::tenant_email::send_tenant_email(
                        &conn,
                        org_id,
                        &email,
                        &format!("Shift Assigned: {name}"),
                        text,
                        html,
                    );
                }
            }
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
                "message": "Shift assigned — Attendance uses this for late/early and working-day checks",
                "id": conn.last_insert_rowid(),
            })))
        }
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed: {e}"))),
    }
}

pub async fn user_assignment(
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
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let user_id = path.into_inner();

    if !crate::tenant::user_in_organization(&conn, user_id, org_id) {
        return HttpResponse::NotFound().json(ApiError::new("User not found in organization"));
    }
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Err(resp) = crate::branch_scope::require_user_in_scope(&conn, user_id, org_id, &scope) {
        return resp;
    }

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let _ = crate::shift_logic::assign_general_shift_to_user(&conn, user_id, &today);

    let data: Option<serde_json::Value> = conn
        .query_row(
            "SELECT usa.id, usa.user_id, usa.shift_template_id, usa.effective_from, usa.effective_to,
                    st.name, st.start_time, st.end_time, st.grace_in_minutes, st.grace_out_minutes,
                    COALESCE(st.working_days_mask, 31) AS working_days_mask
             FROM user_shift_assignments usa
             JOIN shift_templates st ON st.id = usa.shift_template_id
             JOIN users u ON u.id = usa.user_id
             WHERE usa.user_id = ?1 AND u.organization_id = ?2 AND st.organization_id = ?2
             ORDER BY usa.effective_from DESC, usa.id DESC
             LIMIT 1",
            crate::params![user_id, org_id],
            |row| {
                let mask = crate::shift_logic::normalize_working_days_mask(
                    row.get_idx::<i64>(10).unwrap_or(31),
                );
                Ok(serde_json::json!({
                    "id": row.get_idx::<i64>(0)?,
                    "user_id": row.get_idx::<i64>(1)?,
                    "shift_template_id": row.get_idx::<i64>(2)?,
                    "effective_from": row.get_idx::<String>(3)?,
                    "effective_to": row.get_idx::<Option<String>>(4).ok().flatten(),
                    "template": {
                        "name": row.get_idx::<String>(5)?,
                        "start_time": row.get_idx::<String>(6)?,
                        "end_time": row.get_idx::<String>(7)?,
                        "grace_in_minutes": row.get_idx::<i64>(8).unwrap_or(0),
                        "grace_out_minutes": row.get_idx::<i64>(9).unwrap_or(0),
                        "working_days": crate::shift_logic::mask_to_weekday_keys(mask),
                        "working_days_label": crate::shift_logic::format_working_days_label(mask),
                    }
                }))
            },
        )
        .ok();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "assignment": data
    })))
}

/// List employees currently on a shift (or unassigned default) as of a given date.
pub async fn roster(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<ShiftRosterQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let as_of = query
        .date
        .as_deref()
        .filter(|d| !d.is_empty())
        .map(|d| d.to_string())
        .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());

    let shift_id = query.shift_id.unwrap_or(0);

    if shift_id != 0 {
        let shift_ok = conn
            .query_row(
                "SELECT 1 FROM shift_templates WHERE id = ?1 AND organization_id = ?2",
                crate::params![shift_id, org_id],
                |_| Ok(()),
            )
            .is_ok();
        if !shift_ok {
            return HttpResponse::NotFound().json(ApiError::new("Shift template not found"));
        }
    }

    let mut all_users: Vec<(i64, String, Option<String>, Option<String>)> = {
        let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
        if let Some(center_id) = query.center_id {
            if !crate::tenant::center_in_organization(&conn, center_id, org_id) {
                return HttpResponse::BadRequest().json(ApiError::new("Branch not found"));
            }
            if let Err(resp) = crate::branch_scope::ensure_center_allowed(&scope, Some(center_id)) {
                return resp;
            }
        }
        let mut sql = String::from(
            "SELECT u.id, u.name, u.email, u.employee_id FROM users u
             WHERE u.deleted_at IS NULL AND u.organization_id = ?1
               AND TRIM(COALESCE(u.name, '')) != ''",
        );
        let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
        if let Some(center_id) = query.center_id {
            let wl_idx = params.len() + 1;
            let dept_idx = wl_idx + 1;
            let org_idx = wl_idx + 2;
            sql.push_str(&format!(
                " AND (
                    TRIM(COALESCE(u.work_location, '')) = ?{wl_idx}
                    OR u.department_id IN (
                      SELECT d.id FROM departments d
                      WHERE d.center_id = ?{dept_idx} AND d.organization_id = ?{org_idx}
                    )
                  )"
            ));
            params.push(crate::db::into_param_value(center_id.to_string()));
            params.push(crate::db::into_param_value(center_id));
            params.push(crate::db::into_param_value(org_id));
        }
        crate::branch_scope::append_users_branch_filter(&mut sql, &mut params, &scope, "u");
        sql.push_str(" ORDER BY u.name");
        match conn.prepare(&sql) {
            Ok(stmt) => stmt.query_map(&params, |row| {
                Ok((
                    row.get_idx::<i64>(0)?,
                    row.get_idx::<String>(1)?,
                    row.get_idx::<Option<String>>(2)?,
                    row.get_idx::<Option<String>>(3)?,
                ))
            }),
            Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
        }
    };

    let rows: Vec<serde_json::Value> = if shift_id == 0 {
        all_users
            .drain(..)
            .filter(|(uid, _, _, _)| {
                !crate::shift_logic::user_has_active_assignment(&conn, *uid, &as_of)
            })
            .map(|(user_id, name, email, employee_id)| {
                let shift = crate::shift_logic::resolve_shift_for_user(&conn, user_id, &as_of);
                serde_json::json!({
                    "assignment_id": null,
                    "user_id": user_id,
                    "name": name,
                    "email": email,
                    "employee_id": employee_id,
                    "shift_template_id": shift.template_id,
                    "shift_name": shift.template_name.unwrap_or_else(|| "Default".into()),
                    "start_time": shift.start_time,
                    "end_time": shift.end_time,
                    "schedule_source": shift.schedule_source,
                    "is_day_off": shift.is_day_off,
                    "effective_from": null,
                    "effective_to": null,
                })
            })
            .collect()
    } else {
        all_users
            .into_iter()
            .filter_map(|(user_id, name, email, employee_id)| {
                let shift = crate::shift_logic::resolve_shift_for_user(&conn, user_id, &as_of);
                if shift.is_day_off || shift.template_id != Some(shift_id) {
                    return None;
                }
                Some(serde_json::json!({
                    "assignment_id": null,
                    "user_id": user_id,
                    "name": name,
                    "email": email,
                    "employee_id": employee_id,
                    "shift_template_id": shift.template_id,
                    "shift_name": shift.template_name,
                    "start_time": shift.start_time,
                    "end_time": shift.end_time,
                    "schedule_source": shift.schedule_source,
                    "is_day_off": shift.is_day_off,
                    "effective_from": null,
                    "effective_to": null,
                }))
            })
            .collect()
    };

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "as_of": as_of,
        "shift_id": shift_id,
        "total": rows.len(),
        "employees": rows,
    })))
}

#[derive(Debug, Deserialize)]
pub struct DailyRosterQuery {
    pub week_start: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub center_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct DailyRosterEntry {
    pub user_id: i64,
    pub roster_date: String,
    pub shift_template_id: Option<i64>,
    pub is_day_off: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct DailyRosterStoreRequest {
    pub entries: Vec<DailyRosterEntry>,
}

/// Week (or range) grid: daily shift overrides per employee.
pub async fn daily_roster_show(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<DailyRosterQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let week_start = query
        .week_start
        .as_deref()
        .or(query.from.as_deref())
        .filter(|d| !d.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());

    let start = match chrono::NaiveDate::parse_from_str(&week_start, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return HttpResponse::BadRequest().json(ApiError::new("Invalid week_start date")),
    };
    let end = if let Some(to) = query.to.as_deref().filter(|d| !d.is_empty()) {
        chrono::NaiveDate::parse_from_str(to, "%Y-%m-%d").unwrap_or(start + chrono::Duration::days(6))
    } else {
        start + chrono::Duration::days(6)
    };

    let mut dates = Vec::new();
    let mut d = start;
    while d <= end {
        dates.push(d.format("%Y-%m-%d").to_string());
        d += chrono::Duration::days(1);
    }
    let from_s = start.format("%Y-%m-%d").to_string();
    let to_s = end.format("%Y-%m-%d").to_string();

    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Some(center_id) = query.center_id {
        if !crate::tenant::center_in_organization(&conn, center_id, org_id) {
            return HttpResponse::BadRequest().json(ApiError::new("Branch not found"));
        }
        if let Err(resp) = crate::branch_scope::ensure_center_allowed(&scope, Some(center_id)) {
            return resp;
        }
    }

    let mut user_sql = String::from(
        "SELECT u.id, u.name, u.employee_id FROM users u
         WHERE u.deleted_at IS NULL AND u.organization_id = ?1
           AND TRIM(COALESCE(u.name, '')) != ''",
    );
    let mut user_params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    if let Some(center_id) = query.center_id {
        let wl_idx = user_params.len() + 1;
        let dept_idx = wl_idx + 1;
        let org_idx = wl_idx + 2;
        user_sql.push_str(&format!(
            " AND (
                TRIM(COALESCE(u.work_location, '')) = ?{wl_idx}
                OR u.department_id IN (
                  SELECT d.id FROM departments d
                  WHERE d.center_id = ?{dept_idx} AND d.organization_id = ?{org_idx}
                )
              )"
        ));
        user_params.push(crate::db::into_param_value(center_id.to_string()));
        user_params.push(crate::db::into_param_value(center_id));
        user_params.push(crate::db::into_param_value(org_id));
    }
    crate::branch_scope::append_users_branch_filter(&mut user_sql, &mut user_params, &scope, "u");
    user_sql.push_str(" ORDER BY u.name");

    let users: Vec<(i64, String, Option<String>)> = match conn.prepare(&user_sql) {
        Ok(stmt) => stmt.query_map(&user_params, |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<Option<String>>(2)?,
            ))
        }),
        Err(e) => {
            return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}")));
        }
    };

    let scoped_user_ids: std::collections::HashSet<i64> =
        users.iter().map(|(id, _, _)| *id).collect();

    let mut overrides: std::collections::HashMap<(i64, String), (Option<i64>, bool, Option<String>)> =
        std::collections::HashMap::new();
    if let Ok(stmt) = conn.prepare(
        "SELECT sdr.user_id, sdr.roster_date, sdr.shift_template_id, COALESCE(sdr.is_day_off, 0), st.name
         FROM shift_daily_roster sdr
         JOIN users u ON u.id = sdr.user_id
         LEFT JOIN shift_templates st ON st.id = sdr.shift_template_id
         WHERE sdr.roster_date >= ?1 AND sdr.roster_date <= ?2 AND u.organization_id = ?3",
    ) {
        let rows = stmt.query_map(crate::params![&from_s, &to_s, org_id], |row| {
            Ok((
                row.get_idx::<i64>(0)?,
                row.get_idx::<String>(1)?,
                row.get_idx::<Option<i64>>(2)?,
                row.get_idx::<i64>(3)? != 0,
                row.get_idx::<Option<String>>(4)?,
            ))
        });
        for r in rows {
            if scoped_user_ids.contains(&r.0) {
                overrides.insert((r.0, r.1), (r.2, r.3, r.4));
            }
        }
    }

    let mut employees = Vec::new();
    for (user_id, name, employee_id) in users {
        let mut days = serde_json::Map::new();
        for date in &dates {
            if let Some((shift_id, is_off, shift_name)) = overrides.get(&(user_id, date.clone())) {
                days.insert(
                    date.clone(),
                    serde_json::json!({
                        "is_daily_override": true,
                        "is_day_off": is_off,
                        "shift_template_id": shift_id,
                        "shift_name": shift_name,
                    }),
                );
            } else {
                let resolved = crate::shift_logic::resolve_shift_for_user(&conn, user_id, date);
                days.insert(
                    date.clone(),
                    serde_json::json!({
                        "is_daily_override": false,
                        "is_day_off": resolved.is_day_off,
                        "shift_template_id": resolved.template_id,
                        "shift_name": resolved.template_name,
                        "schedule_source": resolved.schedule_source,
                    }),
                );
            }
        }
        employees.push(serde_json::json!({
            "user_id": user_id,
            "name": name,
            "employee_id": employee_id,
            "days": days,
        }));
    }

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "from": from_s,
        "to": to_s,
        "dates": dates,
        "employees": employees,
    })))
}

pub async fn daily_roster_store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<DailyRosterStoreRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };
    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);

    let tx = match conn.unchecked_transaction() {
        Ok(t) => t,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    };

    for entry in &body.entries {
        if chrono::NaiveDate::parse_from_str(&entry.roster_date, "%Y-%m-%d").is_err() {
            return HttpResponse::BadRequest().json(ApiError::new("Invalid roster_date"));
        }
        if !crate::tenant::user_in_organization(&conn, entry.user_id, org_id) {
            return HttpResponse::BadRequest().json(ApiError::new("User not found in organization"));
        }
        if let Err(resp) =
            crate::branch_scope::require_user_in_scope(&conn, entry.user_id, org_id, &scope)
        {
            return resp;
        }
        if let Some(shift_id) = entry.shift_template_id {
            let shift_ok = tx
                .query_row(
                    "SELECT 1 FROM shift_templates WHERE id = ?1 AND organization_id = ?2",
                    crate::params![shift_id, org_id],
                    |_| Ok(()),
                )
                .is_ok();
            if !shift_ok {
                return HttpResponse::BadRequest().json(ApiError::new("Shift template not found"));
            }
        }
        let is_off = entry.is_day_off.unwrap_or(false);
        if let Err(e) = crate::shift_logic::upsert_daily_roster(
            &tx,
            entry.user_id,
            &entry.roster_date,
            entry.shift_template_id,
            is_off,
        ) {
            return HttpResponse::BadRequest().json(ApiError::new(&format!("{e}")));
        }
    }

    match tx.commit() {
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "message": "Daily roster updated — Attendance uses these shifts for late/early and working-day checks",
            "count": body.entries.len(),
        }))),
        Err(e) => HttpResponse::InternalServerError().json(ApiError::new(&format!("{e}"))),
    }
}
