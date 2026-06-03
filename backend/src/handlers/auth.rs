use actix_web::{web, HttpRequest, HttpResponse};
use std::sync::Arc;

use crate::db::DbPool;
use crate::middleware::auth::{generate_token, get_claims_from_request};
use crate::models::user::{LoginRequest, LoginResponse, User};
use crate::models::{ApiError, ApiResponse};

/// POST /api/auth/login
pub async fn login(
    pool: web::Data<DbPool>,
    jwt_secret: web::Data<Arc<String>>,
    body: web::Json<LoginRequest>,
) -> HttpResponse {
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    // Find user by email
    let user_result = conn.query_row(
        "SELECT * FROM users WHERE email = ?1 AND deleted_at IS NULL",
        [&body.email],
        User::from_row,
    );

    let user = match user_result {
        Ok(u) => u,
        Err(_) => {
            return HttpResponse::Unauthorized().json(ApiError::new("Invalid credentials"))
        }
    };

    // Verify password using bcrypt
    // Laravel stores passwords with bcrypt ($2y$ prefix). The bcrypt crate handles $2b$ and $2a$.
    // We need to handle $2y$ → $2b$ conversion.
    let stored_hash = user.password.replace("$2y$", "$2b$");
    let password_valid = bcrypt::verify(&body.password, &stored_hash).unwrap_or(false);

    if !password_valid {
        return HttpResponse::Unauthorized().json(ApiError::new("Invalid credentials"));
    }

    // Get user permissions
    let permissions = get_user_permissions(&conn, user.id, user.is_super_admin);

    // Generate JWT token
    let expiration_hours: u64 = std::env::var("JWT_EXPIRATION_HOURS")
        .unwrap_or_else(|_| "24".to_string())
        .parse()
        .unwrap_or(24);

    let token = match generate_token(
        user.id,
        &user.email,
        user.is_super_admin,
        &jwt_secret,
        expiration_hours,
    ) {
        Ok(t) => t,
        Err(_) => {
            return HttpResponse::InternalServerError()
                .json(ApiError::new("Failed to generate token"))
        }
    };

    // Load roles for response
    let roles = load_user_roles(&conn, user.id);
    let mut summary = user.to_summary();
    summary.roles = Some(roles);

    // Load department & designation
    if let Some(dept_id) = summary.department_id {
        summary.department = conn
            .query_row(
                "SELECT * FROM departments WHERE id = ?1",
                [dept_id],
                crate::models::department::Department::from_row,
            )
            .ok();
    }
    if let Some(desg_id) = summary.designation_id {
        summary.designation = conn
            .query_row(
                "SELECT * FROM designations WHERE id = ?1",
                [desg_id],
                crate::models::designation::Designation::from_row,
            )
            .ok();
    }

    let mut settings = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT key, value FROM app_settings") {
        if let Ok(iter) = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?.unwrap_or_default()))
        }) {
            for item in iter.flatten() {
                settings.insert(item.0, item.1);
            }
        }
    }

    #[derive(serde::Serialize)]
    struct LoginResponseExt {
        token: String,
        user: crate::models::user::UserSummary,
        permissions: Vec<String>,
        settings: std::collections::HashMap<String, String>,
    }

    let response = LoginResponseExt {
        token,
        user: summary,
        permissions,
        settings,
    };

    HttpResponse::Ok().json(ApiResponse::success(response))
}

/// GET /api/auth/me — returns current user info
pub async fn me(
    pool: web::Data<DbPool>,
    req: HttpRequest,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let user = match conn.query_row(
        "SELECT * FROM users WHERE id = ?1 AND deleted_at IS NULL",
        [claims.sub],
        User::from_row,
    ) {
        Ok(u) => u,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("User not found")),
    };

    let permissions = get_user_permissions(&conn, user.id, user.is_super_admin);
    let roles = load_user_roles(&conn, user.id);

    let mut summary = user.to_summary();
    summary.roles = Some(roles);

    if let Some(dept_id) = summary.department_id {
        summary.department = conn
            .query_row(
                "SELECT * FROM departments WHERE id = ?1",
                [dept_id],
                crate::models::department::Department::from_row,
            )
            .ok();
    }
    if let Some(desg_id) = summary.designation_id {
        summary.designation = conn
            .query_row(
                "SELECT * FROM designations WHERE id = ?1",
                [desg_id],
                crate::models::designation::Designation::from_row,
            )
            .ok();
    }

    let mut settings = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT key, value FROM app_settings") {
        if let Ok(iter) = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?.unwrap_or_default()))
        }) {
            for item in iter.flatten() {
                settings.insert(item.0, item.1);
            }
        }
    }

    #[derive(serde::Serialize)]
    struct MeResponse {
        user: crate::models::user::UserSummary,
        permissions: Vec<String>,
        settings: std::collections::HashMap<String, String>,
    }

    HttpResponse::Ok().json(ApiResponse::success(MeResponse {
        user: summary,
        permissions,
        settings,
    }))
}

/// POST /api/auth/logout
pub async fn logout() -> HttpResponse {
    // With JWT, logout is handled client-side by removing the token.
    // We return success for API compatibility.
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "message": "Successfully logged out"
    })))
}

// Helper functions

fn get_user_permissions(
    conn: &r2d2::PooledConnection<r2d2_sqlite::SqliteConnectionManager>,
    user_id: i64,
    is_super_admin: bool,
) -> Vec<String> {
    if is_super_admin {
        return vec!["*".to_string()];
    }

    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT p.slug
             FROM permissions p
             JOIN permission_role pr ON p.id = pr.permission_id
             JOIN role_user ru ON pr.role_id = ru.role_id
             WHERE ru.user_id = ?1",
        )
        .unwrap();

    stmt.query_map([user_id], |row| row.get::<_, String>(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

fn load_user_roles(
    conn: &r2d2::PooledConnection<r2d2_sqlite::SqliteConnectionManager>,
    user_id: i64,
) -> Vec<crate::models::role::Role> {
    let mut stmt = conn
        .prepare(
            "SELECT r.* FROM roles r
             JOIN role_user ru ON r.id = ru.role_id
             WHERE ru.user_id = ?1",
        )
        .unwrap();

    stmt.query_map([user_id], crate::models::role::Role::from_row)
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}
