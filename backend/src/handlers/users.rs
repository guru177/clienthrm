use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::user::{User, CreateUserRequest, UpdateUserRequest};

/// GET /api/admin/users
pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let query_string = req.query_string();
    let params: Vec<(String, String)> = serde_urlencoded::from_str(query_string).unwrap_or_default();
    let search = params.iter().find(|(k, _)| k == "search").map(|(_, v)| v.clone());
    let page: i64 = params.iter().find(|(k, _)| k == "page").and_then(|(_, v)| v.parse().ok()).unwrap_or(1);
    let per_page: i64 = params.iter().find(|(k, _)| k == "per_page").and_then(|(_, v)| v.parse().ok()).unwrap_or(15);
    let offset = (page - 1) * per_page;

    let (where_clause, search_param) = if let Some(ref s) = search {
        ("WHERE u.deleted_at IS NULL AND (u.name LIKE ?1 OR u.email LIKE ?1)".to_string(), format!("%{}%", s))
    } else {
        ("WHERE u.deleted_at IS NULL".to_string(), String::new())
    };

    let total: i64 = if search.is_some() {
        conn.query_row(
            &format!("SELECT COUNT(*) FROM users u {}", where_clause),
            [&search_param],
            |row| row.get(0),
        ).unwrap_or(0)
    } else {
        conn.query_row(
            &format!("SELECT COUNT(*) FROM users u {}", where_clause),
            [],
            |row| row.get(0),
        ).unwrap_or(0)
    };

    let sql = format!(
        "SELECT u.* FROM users u {} ORDER BY u.created_at DESC LIMIT ?2 OFFSET ?3",
        where_clause
    );

    let users: Vec<serde_json::Value> = if search.is_some() {
        let mut stmt = conn.prepare(&sql).unwrap();
        stmt.query_map(rusqlite::params![&search_param, per_page, offset], |row| {
            let user = User::from_row(row)?;
            Ok(user)
        }).unwrap().filter_map(|r| r.ok()).map(|u| {
            let mut summary = u.to_summary();
            // Load department
            if let Some(dept_id) = summary.department_id {
                summary.department = conn.query_row(
                    "SELECT * FROM departments WHERE id = ?1", [dept_id],
                    crate::models::department::Department::from_row,
                ).ok();
            }
            if let Some(desg_id) = summary.designation_id {
                summary.designation = conn.query_row(
                    "SELECT * FROM designations WHERE id = ?1", [desg_id],
                    crate::models::designation::Designation::from_row,
                ).ok();
            }
            serde_json::to_value(summary).unwrap()
        }).collect()
    } else {
        let mut stmt = conn.prepare(
            &format!("SELECT u.* FROM users u {} ORDER BY u.created_at DESC LIMIT ?1 OFFSET ?2", where_clause)
        ).unwrap();
        stmt.query_map(rusqlite::params![per_page, offset], |row| {
            let user = User::from_row(row)?;
            Ok(user)
        }).unwrap().filter_map(|r| r.ok()).map(|u| {
            let mut summary = u.to_summary();
            if let Some(dept_id) = summary.department_id {
                summary.department = conn.query_row(
                    "SELECT * FROM departments WHERE id = ?1", [dept_id],
                    crate::models::department::Department::from_row,
                ).ok();
            }
            if let Some(desg_id) = summary.designation_id {
                summary.designation = conn.query_row(
                    "SELECT * FROM designations WHERE id = ?1", [desg_id],
                    crate::models::designation::Designation::from_row,
                ).ok();
            }
            serde_json::to_value(summary).unwrap()
        }).collect()
    };

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "type": "success",
        "data": users,
        "total": total,
        "page": page,
        "per_page": per_page,
    }))
}

/// GET /api/admin/users/{id}
pub async fn show(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let _claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let user_id = path.into_inner();
    let user = match conn.query_row(
        "SELECT * FROM users WHERE id = ?1 AND deleted_at IS NULL",
        [user_id],
        User::from_row,
    ) {
        Ok(u) => u,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("User not found")),
    };

    let mut summary = user.to_summary();
    if let Some(dept_id) = summary.department_id {
        summary.department = conn.query_row(
            "SELECT * FROM departments WHERE id = ?1", [dept_id],
            crate::models::department::Department::from_row,
        ).ok();
    }
    if let Some(desg_id) = summary.designation_id {
        summary.designation = conn.query_row(
            "SELECT * FROM designations WHERE id = ?1", [desg_id],
            crate::models::designation::Designation::from_row,
        ).ok();
    }

    // Load roles
    let mut stmt = conn.prepare(
        "SELECT r.* FROM roles r JOIN role_user ru ON r.id = ru.role_id WHERE ru.user_id = ?1"
    ).unwrap();
    let roles: Vec<crate::models::role::Role> = stmt.query_map([user_id], crate::models::role::Role::from_row)
        .unwrap().filter_map(|r| r.ok()).collect();
    summary.roles = Some(roles);

    HttpResponse::Ok().json(ApiResponse::success(summary))
}

/// POST /api/admin/users
pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<CreateUserRequest>) -> HttpResponse {
    let _claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let hashed = bcrypt::hash(&body.password, 12).unwrap();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let result = conn.execute(
        "INSERT INTO users (name, email, password, phone, department_id, designation_id, employment_type, employee_id, date_of_joining, work_location, email_verified_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![
            body.name, body.email, hashed, body.phone,
            body.department_id, body.designation_id,
            body.employment_type.as_deref().unwrap_or("full-time"),
            body.employee_id, body.date_of_joining, body.work_location,
            &now, &now, &now,
        ],
    );

    match result {
        Ok(_) => {
            let user_id = conn.last_insert_rowid();

            // Assign roles if provided
            if let Some(ref role_ids) = body.role_ids {
                for role_id in role_ids {
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO role_user (user_id, role_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                        rusqlite::params![user_id, role_id, &now, &now],
                    );
                }
            }

            HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
                "id": user_id,
                "message": "User created successfully"
            })))
        }
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed to create user: {}", e))),
    }
}

/// PUT /api/admin/users/{id}
pub async fn update(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<UpdateUserRequest>) -> HttpResponse {
    let _claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let user_id = path.into_inner();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Build dynamic UPDATE query
    let mut sets = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    macro_rules! maybe_set {
        ($field:ident, $col:expr) => {
            if let Some(ref val) = body.$field {
                sets.push(format!("{} = ?{}", $col, idx));
                params.push(Box::new(val.clone()));
                idx += 1;
            }
        };
    }

    maybe_set!(name, "name");
    maybe_set!(email, "email");
    maybe_set!(phone, "phone");
    maybe_set!(avatar, "avatar");
    maybe_set!(photo, "photo");
    maybe_set!(bio, "bio");
    maybe_set!(date_of_birth, "date_of_birth");
    maybe_set!(gender, "gender");
    maybe_set!(address, "address");
    maybe_set!(city, "city");
    maybe_set!(state, "state");
    maybe_set!(country, "country");
    maybe_set!(postal_code, "postal_code");
    maybe_set!(employment_type, "employment_type");
    maybe_set!(status, "status");
    maybe_set!(work_location, "work_location");
    maybe_set!(employee_id, "employee_id");
    maybe_set!(account_number, "account_number");
    maybe_set!(ifsc_code, "ifsc_code");
    maybe_set!(bank_name, "bank_name");
    maybe_set!(pan_number, "pan_number");

    if let Some(dept_id) = body.department_id {
        sets.push(format!("department_id = ?{}", idx));
        params.push(Box::new(dept_id));
        idx += 1;
    }
    if let Some(desg_id) = body.designation_id {
        sets.push(format!("designation_id = ?{}", idx));
        params.push(Box::new(desg_id));
        idx += 1;
    }

    if sets.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new("No fields to update"));
    }

    sets.push(format!("updated_at = ?{}", idx));
    params.push(Box::new(now));
    idx += 1;

    params.push(Box::new(user_id));

    let sql = format!(
        "UPDATE users SET {} WHERE id = ?{}",
        sets.join(", "),
        idx - 1  // We already incremented for user_id
    );

    // Actually user_id was the last param
    let sql = format!(
        "UPDATE users SET {} WHERE id = ?{}",
        sets.join(", "),
        idx
    );

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    match conn.execute(&sql, param_refs.as_slice()) {
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "message": "User updated successfully"
        }))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed to update user: {}", e))),
    }
}

/// DELETE /api/admin/users/{id}
pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let _claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let user_id = path.into_inner();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Soft delete
    match conn.execute(
        "UPDATE users SET deleted_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, user_id],
    ) {
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "message": "User deleted successfully"
        }))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("Failed to delete user: {}", e))),
    }
}

/// GET /api/admin/users/stats
pub async fn stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let total: i64 = conn.query_row("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL", [], |r| r.get(0)).unwrap_or(0);
    let active: i64 = conn.query_row("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND status = 'active'", [], |r| r.get(0)).unwrap_or(0);
    let on_leave: i64 = conn.query_row("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND status = 'on-leave'", [], |r| r.get(0)).unwrap_or(0);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "total": total,
        "active": active,
        "on_leave": on_leave,
        "inactive": total - active - on_leave,
    })))
}

/// GET /api/admin/users/list (simple list for dropdowns)
pub async fn list(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let mut stmt = conn.prepare(
        "SELECT id, name, email, employee_id FROM users WHERE deleted_at IS NULL ORDER BY name"
    ).unwrap();

    let users: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "name": row.get::<_, String>(1)?,
            "email": row.get::<_, String>(2)?,
            "employee_id": row.get::<_, Option<String>>(3)?,
        }))
    }).unwrap().filter_map(|r| r.ok()).collect();

    HttpResponse::Ok().json(ApiResponse::success(users))
}
