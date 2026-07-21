use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;
use crate::config::AppConfig;
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::job_application::JobApplication;
use crate::tenant::org_id_from_claims;

pub async fn index(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<crate::models::job_application::JobApplicationQuery>,
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

    let mut sql = String::from("SELECT * FROM job_applications WHERE organization_id = ?");
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];

    if let Some(s) = &query.search {
        if !s.is_empty() {
            sql.push_str(" AND (name LIKE ? OR applied_position LIKE ?)");
            let like_s = format!("%{}%", s);
            params.push(crate::db::into_param_value(like_s.clone()));
            params.push(crate::db::into_param_value(like_s));
        }
    }

    if let Some(exp) = &query.experience {
        if !exp.is_empty() && exp != "all" {
            match exp.as_str() {
                "0-2" => sql.push_str(" AND experience_years >= 0 AND experience_years <= 2"),
                "3-5" => sql.push_str(" AND experience_years >= 3 AND experience_years <= 5"),
                "6+" => sql.push_str(" AND experience_years >= 6"),
                _ => {}
            }
        }
    }

    if let Some(st) = &query.status {
        if !st.is_empty() && st != "all" {
            sql.push_str(" AND status = ?");
            params.push(crate::db::into_param_value(st.clone()));
        }
    }

    sql.push_str(" ORDER BY created_at DESC");

    let stmt = conn.prepare(&sql).unwrap();
    let items: Vec<JobApplication> = stmt
        .query_map(&params, JobApplication::from_row);
    HttpResponse::Ok().json(ApiResponse::success(items))
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
    match conn.query_row(
        "SELECT * FROM job_applications WHERE id=?1 AND organization_id = ?2",
        crate::params![path.into_inner(), org_id],
        JobApplication::from_row,
    ) {
        Ok(j) => HttpResponse::Ok().json(ApiResponse::success(j)),
        Err(_) => HttpResponse::NotFound().json(ApiError::new("Not found")),
    }
}

pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<crate::models::job_application::CreateJobApplicationRequest>,
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

    if let Some(career_id) = body.career_id {
        let valid = conn
            .query_row(
                "SELECT 1 FROM careers WHERE id = ?1 AND organization_id = ?2",
                crate::params![career_id, org_id],
                |_| Ok(()),
            )
            .is_ok();
        if !valid {
            return HttpResponse::BadRequest().json(ApiError::new("Career not found in your organization"));
        }
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let tracking = format!(
        "APP-{}",
        uuid::Uuid::new_v4()
            .to_string()
            .split('-')
            .next()
            .unwrap_or("0000")
            .to_uppercase()
    );
    match conn.execute(
        "INSERT INTO job_applications (career_id,name,email,phone,cover_letter,dob,applied_position,status,tracking_number,organization_id,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,'pending',?8,?9,?10,?10)",
        crate::params![
            body.career_id,
            body.name,
            body.email,
            body.phone,
            body.cover_letter,
            body.date_of_birth,
            body.applied_position,
            tracking,
            org_id,
            &now,
        ],
    ) {
        Ok(_) => HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
            "id": conn.last_insert_rowid()
        }))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
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
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let deleted = conn.execute(
        "DELETE FROM job_applications WHERE id=?1 AND organization_id = ?2",
        crate::params![path.into_inner(), org_id],
    );
    if deleted.unwrap_or(0) == 0 {
        return HttpResponse::NotFound().json(ApiError::new("Application not found"));
    }
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
    let t: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM job_applications WHERE organization_id = ?1",
            [org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"total": t})))
}

pub async fn list(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<crate::models::job_application::JobApplicationQuery>,
) -> HttpResponse {
    index(pool, req, query).await
}

const VALID_APP_STATUSES: &[&str] = &[
    "pending", "reviewing", "shortlisted", "interview", "offered", "hired", "rejected",
];

pub async fn update_status(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<crate::models::job_application::UpdateStatusRequest>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    if !VALID_APP_STATUSES.contains(&body.status.as_str()) {
        return HttpResponse::BadRequest().json(ApiError::new("Invalid application status"));
    }
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let id = path.into_inner();
    let updated = conn.execute(
        "UPDATE job_applications SET status=?1,updated_at=?2 WHERE id=?3 AND organization_id = ?4",
        crate::params![body.status, &now, id, org_id],
    );
    if updated.unwrap_or(0) == 0 {
        return HttpResponse::NotFound().json(ApiError::new("Application not found"));
    }
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Status updated"})))
}

#[derive(Deserialize)]
pub struct IncomingResumeWebhook {
    pub candidate_name: String,
    pub candidate_email: String,
    pub candidate_phone: Option<String>,
    pub resume_url: String,
    pub email_body: Option<String>,
    pub position_hint: Option<String>,
    pub org: Option<String>,
    #[serde(alias = "org_slug")]
    pub org_slug: Option<String>,
    pub career_id: Option<i64>,
}

pub async fn webhook_incoming_resume(
    pool: web::Data<DbPool>,
    app_config: web::Data<std::sync::Arc<AppConfig>>,
    req: HttpRequest,
    body: web::Json<IncomingResumeWebhook>,
) -> HttpResponse {
    let expected = app_config.webhook_secret.as_str();
    if expected.is_empty() {
        return HttpResponse::ServiceUnavailable().json(ApiError::new(
            "Resume webhook is disabled — set WEBHOOK_SECRET to enable",
        ));
    }
    let provided = req
        .headers()
        .get("X-Webhook-Secret")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if provided != expected {
        return HttpResponse::Unauthorized().json(ApiError::new("Invalid webhook secret"));
    }

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("Database error")),
    };

    let applied_position = body
        .position_hint
        .clone()
        .unwrap_or_else(|| "Open Position".to_string());
    let tracking_number = format!(
        "APP-{}-{}",
        chrono::Utc::now().format("%Y"),
        chrono::Utc::now().timestamp()
    );
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let (career_id, org_id): (i64, i64) = if let Some(cid) = body.career_id {
        match conn.query_row(
            "SELECT id, organization_id FROM careers WHERE id = ?1 AND is_active = 1",
            [cid],
            |row| Ok((row.get_idx::<i64>(0)?, row.get_idx::<i64>(1)?)),
        ) {
            Ok(row) => row,
            Err(_) => {
                return HttpResponse::BadRequest().json(ApiError::new("Career not found or inactive"));
            }
        }
    } else {
        let slug = body.org.as_deref().or(body.org_slug.as_deref()).or_else(|| {
            req.headers()
                .get("X-Org-Slug")
                .and_then(|v| v.to_str().ok())
        });
        let org_id = match crate::tenant::resolve_organization_id(&conn, slug) {
            Ok(id) => id,
            Err(msg) => return HttpResponse::BadRequest().json(ApiError::new(&msg)),
        };
        match conn.query_row(
            "SELECT id FROM careers WHERE organization_id = ?1 AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
            [org_id],
            |row| row.get_idx::<i64>(0),
        ) {
            Ok(cid) => (cid, org_id),
            Err(_) => {
                return HttpResponse::BadRequest().json(ApiError::new(
                    "No active career posting for this organization — provide career_id",
                ));
            }
        }
    };

    let sql = "
        INSERT INTO job_applications (
            career_id, tracking_number, name, email, phone, cover_letter, resume, status,
            applied_position, source, organization_id, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, 'webhook', ?9, ?10, ?10)
    ";

    let result = conn.execute(
        sql,
        crate::params![
            career_id,
            tracking_number,
            body.candidate_name,
            body.candidate_email,
            body.candidate_phone.as_deref().unwrap_or(""),
            body.email_body.as_deref().unwrap_or(""),
            body.resume_url,
            applied_position,
            org_id,
            now,
        ],
    );

    match result {
        Ok(_) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "message": "Resume ingested successfully",
            "tracking_number": tracking_number
        }))),
        Err(e) => {
            eprintln!("Webhook DB Error: {:?}", e);
            HttpResponse::InternalServerError().json(ApiError::new("Failed to save application"))
        }
    }
}

#[derive(Deserialize)]
pub struct SendEmailRequest {
    pub subject: String,
    pub body: String,
    pub html_body: Option<String>,
}

pub async fn send_email(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<SendEmailRequest>,
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

    let application_id = path.into_inner();
    let email: String = match conn.query_row(
        "SELECT email FROM job_applications WHERE id=?1 AND organization_id = ?2",
        crate::params![application_id, org_id],
        |row| row.get_idx::<String>(0),
    ) {
        Ok(e) => e,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Application not found")),
    };

    let smtp = match crate::smtp_config::resolve(&conn, org_id) {
        Some(c) => c,
        None => {
            return HttpResponse::BadRequest().json(ApiError::new(
                "SMTP not configured (set in App Settings or .env)",
            ));
        }
    };

    let inner_html = if let Some(html) = &body.html_body {
        html.clone()
    } else {
        format!(
            "<p style=\"margin:0;font-size:15px;line-height:1.6;color:#64748b;\">{}</p>",
            body.body.replace('\n', "<br />")
        )
    };
    let html = crate::tenant_email::render_base_template(&body.subject, &inner_html);

    let email_message = match crate::tenant_email::build_html_email(
        &smtp,
        &email,
        &body.subject,
        body.body.clone(),
        html,
    ) {
        Ok(m) => m,
        Err(e) => return HttpResponse::BadRequest().json(ApiError::new(&e)),
    };

    let result = crate::tenant_email::send_built_email(smtp, email_message).await;

    match result {
        Ok(()) => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "message": "Email sent successfully"
        }))),
        Err(e) => {
            HttpResponse::InternalServerError().json(ApiError::new(&format!("SMTP send failed: {e}")))
        }
    }
}
