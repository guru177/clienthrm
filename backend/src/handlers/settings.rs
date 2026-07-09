use actix_multipart::Multipart;
use actix_web::{web, HttpRequest, HttpResponse};
use futures_util::StreamExt;
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;

/// GET /api/admin/settings/app — return all settings as an array
/// Tries app_settings first, then falls back to the legacy Laravel 'settings' table
pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    // Read CLOUDFRONT_URL from env for URL rewriting
    let cloudfront_url = std::env::var("CLOUDFRONT_URL").unwrap_or_default();

    let rewrite_url = |val: Option<String>| -> Option<String> {
        match val {
            Some(v) if !cloudfront_url.is_empty() && v.contains(".cloudfront.net") => {
                let mut result = v;
                let mut offset = 0;
                while let Some(start) = result[offset..].find("https://") {
                    let abs_start = offset + start;
                    if let Some(cf_pos) = result[abs_start..].find(".cloudfront.net") {
                        let end = abs_start + cf_pos + ".cloudfront.net".len();
                        let old_url = &result[abs_start..end];
                        
                        if old_url == cloudfront_url {
                            offset = end;
                            continue;
                        }
                        
                        result = result.replace(old_url, &cloudfront_url);
                        offset = abs_start + cloudfront_url.len();
                    } else {
                        break;
                    }
                }
                Some(result)
            }
            other => other,
        }
    };

    let merge_env = |mut items: Vec<serde_json::Value>| -> Vec<serde_json::Value> {
        let env_vars = vec![
            ("mail_host", "SMTP_HOST", false),
            ("mail_port", "SMTP_PORT", false),
            ("mail_username", "SMTP_USER", false),
            ("mail_password", "SMTP_PASS", true),
            ("mail_from_address", "SMTP_FROM", false),
            ("mail_from_name", "APP_NAME", false),
            ("smtp_host", "SMTP_HOST", false),
            ("smtp_port", "SMTP_PORT", false),
            ("smtp_user", "SMTP_USER", false),
            ("smtp_pass", "SMTP_PASS", true),
            ("smtp_from", "SMTP_FROM", false),
            ("ai_api_key", "GEMINI_API_KEY", true),
        ];
        for (k, env_k, is_secret) in env_vars {
            if !items.iter().any(|i| i.get("key").and_then(|v| v.as_str()) == Some(k)) {
                if let Ok(val) = std::env::var(env_k) {
                    if !val.is_empty() {
                        items.push(serde_json::json!({
                            "id": 0,
                            "key": k,
                            "value": if is_secret { "********" } else { &val },
                            "type": if is_secret { "password" } else { "text" },
                            "is_configured": is_secret,
                            "description": null
                        }));
                    }
                }
            }
        }
        items
    };

    let mask_secrets = |items: Vec<serde_json::Value>| -> Vec<serde_json::Value> {
        items.into_iter().map(|mut item| {
            if let Some(key) = item.get("key").and_then(|v| v.as_str()) {
                let is_secret = key.contains("pass")
                    || key.contains("key")
                    || key.contains("secret")
                    || key == "msg91_auth_key";
                if is_secret {
                    let configured = item
                        .get("value")
                        .and_then(|v| v.as_str())
                        .map(|s| !s.is_empty())
                        .unwrap_or(false);
                    if let Some(obj) = item.as_object_mut() {
                        if configured {
                            obj.insert("value".to_string(), serde_json::json!("********"));
                            obj.insert("is_configured".to_string(), serde_json::json!(true));
                        }
                    }
                }
            }
            item
        }).collect()
    };

    // Try app_settings first
    if let Ok(stmt) = conn.prepare("SELECT id, key, value, type, description FROM app_settings WHERE organization_id = ?1 ORDER BY id") {
        let items: Vec<serde_json::Value> = stmt.query_map([org_id], |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "key": row.get_idx::<String>(1)?,
                "value": row.get_idx::<Option<String>>(2)?,
                "type": row.get_idx::<Option<String>>(3)?.unwrap_or_else(|| "text".to_string()),
                "description": row.get_idx::<Option<String>>(4)?
            }))
        });

        if !items.is_empty() {
            // Rewrite CloudFront URLs in values
            let items: Vec<serde_json::Value> = items.into_iter().map(|mut item| {
                if let Some(v) = item.get("value").and_then(|v| v.as_str()) {
                    if let Some(rewritten) = rewrite_url(Some(v.to_string())) {
                        if let Some(obj) = item.as_object_mut() {
                            obj.insert("value".to_string(), serde_json::json!(rewritten));
                        }
                    }
                }
                item
            }).collect();
            let items = merge_env(items);
            return HttpResponse::Ok().json(ApiResponse::success(mask_secrets(items)));
        }
    }

    // No org-scoped app_settings — return env defaults only (never cross-tenant legacy table).
    let items = merge_env(Vec::new());
    HttpResponse::Ok().json(ApiResponse::success(mask_secrets(items)))
}

pub async fn update(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<serde_json::Value>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    if let Some(obj) = body.as_object() {
        for (key, value) in obj {
            let val_str = value.as_str().unwrap_or("").to_string();
            if val_str == "********" || val_str.is_empty() && (key.contains("pass") || key.contains("key")) {
                continue;
            }
            if key == "annual_leave_quota" {
                let quota: i64 = val_str.parse().unwrap_or(-1);
                if quota < 0 || quota > 365 {
                    return HttpResponse::BadRequest().json(ApiError::new(
                        "Annual leave quota must be between 0 and 365 days",
                    ));
                }
            }
            let _ = conn.execute(
                "INSERT INTO app_settings (organization_id, key, value) VALUES (?1, ?2, ?3)
                 ON CONFLICT(organization_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
                crate::params![org_id, key, val_str],
            );
        }
    }

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Settings updated"})))
}

pub async fn upload_logo(req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let _ = _c;
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deprecated"})))
}

#[derive(Debug, serde::Deserialize)]
pub struct UpdatePasswordRequest {
    pub current_password: String,
    pub password: String,
    pub password_confirmation: String,
}

/// PUT /api/admin/settings/password
pub async fn update_password(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<UpdatePasswordRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    if body.password.len() < 8 {
        return HttpResponse::BadRequest().json(ApiError::new("Password must be at least 8 characters"));
    }
    if body.password != body.password_confirmation {
        return HttpResponse::BadRequest().json(ApiError::new("Password confirmation does not match"));
    }

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let stored_hash: String = match conn.query_row(
        "SELECT password FROM users WHERE id=?1 AND deleted_at IS NULL",
        [claims.sub],
        |row| row.get_idx::<String>(0),
    ) {
        Ok(h) => h,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("User not found")),
    };

    let hash = stored_hash.replace("$2y$", "$2b$");
    if !bcrypt::verify(&body.current_password, &hash).unwrap_or(false) {
        return HttpResponse::BadRequest().json(ApiError::new("Current password is incorrect"));
    }

    let new_hash = match bcrypt::hash(&body.password, 12) {
        Ok(h) => h,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Failed to hash password")),
    };
    let now = chrono::Utc::now().naive_utc();
    let _ = conn.execute(
        "UPDATE users SET password=?1, updated_at=?2 WHERE id=?3",
        crate::params![new_hash, now, claims.sub],
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Password updated successfully"})))
}

/// PATCH /api/admin/settings/profile — update user profile fields
pub async fn update_profile(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = crate::tenant::org_id_from_claims(&claims);
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let allowed = [
        "name", "email", "phone", "bio", "date_of_birth", "gender", "timezone",
        "address", "city", "state", "country", "postal_code",
    ];
    let obj = match body.as_object() {
        Some(o) => o,
        None => return HttpResponse::BadRequest().json(ApiError::new("Invalid body")),
    };

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    for key in allowed {
        if let Some(val) = obj.get(key) {
            if val.is_null() {
                continue;
            }
            let val_str = val.as_str().unwrap_or(&val.to_string()).to_string();
            if key == "email" {
                let email = val_str.trim().to_lowercase();
                if email.is_empty() {
                    continue;
                }
                let taken: bool = conn
                    .query_row(
                        "SELECT 1 FROM users WHERE organization_id = ?1 AND LOWER(email) = ?2
                         AND id != ?3 AND deleted_at IS NULL",
                        crate::params![org_id, &email, claims.sub],
                        |_| Ok(()),
                    )
                    .is_ok();
                if taken {
                    return HttpResponse::Conflict()
                        .json(ApiError::new("Email is already used in this organization"));
                }
                let _ = conn.execute(
                    "UPDATE users SET email=?1, updated_at=?2 WHERE id=?3 AND organization_id=?4",
                    crate::params![email, &now, claims.sub, org_id],
                );
                continue;
            }
            let sql = format!(
                "UPDATE users SET {}=?1, updated_at=?2 WHERE id=?3 AND organization_id=?4",
                key
            );
            let _ = conn.execute(&sql, crate::params![val_str, &now, claims.sub, org_id]);
        }
    }

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Profile updated"})))
}

/// POST /api/admin/settings/profile/photo — self-service profile photo upload (multipart)
pub async fn update_profile_photo(
    pool: web::Data<DbPool>,
    req: HttpRequest,
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

    let mut photo_data: Option<(Option<String>, Option<String>, Vec<u8>)> = None;
    while let Some(field) = payload.next().await {
        let mut field = match field {
            Ok(f) => f,
            Err(e) => {
                return HttpResponse::BadRequest()
                    .json(ApiError::new(&format!("Upload error: {}", e)))
            }
        };
        let name = field.name().unwrap_or("").to_string();
        let content_type = field.content_type().map(|ct| ct.to_string());
        let filename = field
            .content_disposition()
            .and_then(|cd| cd.get_filename().map(|s| s.to_string()));

        let mut bytes = Vec::new();
        while let Some(chunk) = field.next().await {
            match chunk {
                Ok(data) => bytes.extend_from_slice(&data),
                Err(e) => {
                    return HttpResponse::BadRequest()
                        .json(ApiError::new(&format!("Upload error: {}", e)))
                }
            }
        }
        if name == "photo" && !bytes.is_empty() {
            photo_data = Some((content_type, filename, bytes));
        }
    }

    let Some((mime, fname, data)) = photo_data else {
        return HttpResponse::BadRequest().json(ApiError::new("No photo provided"));
    };

    let relative = match crate::storage::save_user_photo(&data, mime.as_deref(), fname.as_deref()) {
        Ok(rel) => rel,
        Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&e)),
    };

    // Remove the previous photo file if any.
    if let Ok(old) = conn.query_row(
        "SELECT photo FROM users WHERE id = ?1 AND organization_id = ?2",
        crate::params![claims.sub, org_id],
        |row| row.get_idx::<Option<String>>(0),
    ) {
        if let Some(old_path) = old.filter(|p| !p.is_empty()) {
            crate::storage::delete_photo_path(&old_path);
        }
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "UPDATE users SET photo = ?1, updated_at = ?2 WHERE id = ?3 AND organization_id = ?4",
        crate::params![&relative, &now, claims.sub, org_id],
    );

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "message": "Profile photo updated",
        "photo": relative,
    })))
}

/// POST /api/onboarding/complete — first-time employee profile setup
pub async fn complete_onboarding(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let allowed = [
        "phone", "date_of_birth", "gender", "address", "city", "state", "country", "postal_code",
        "bio", "account_number", "ifsc_code", "bank_name", "pan_number", "aadhar_number",
    ];
    let obj = match body.as_object() {
        Some(o) => o,
        None => return HttpResponse::BadRequest().json(ApiError::new("Invalid body")),
    };

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    for key in allowed {
        if let Some(val) = obj.get(key) {
            if val.is_null() {
                continue;
            }
            let val_str = val.as_str().unwrap_or(&val.to_string()).to_string();
            let sql = format!("UPDATE users SET {}=?1, updated_at=?2 WHERE id=?3", key);
            let _ = conn.execute(&sql, crate::params![val_str, &now, claims.sub]);
        }
    }

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "message": "Onboarding complete",
        "redirect": "/admin/attendance",
    })))
}
