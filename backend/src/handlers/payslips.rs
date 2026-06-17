use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;
use std::io::Write;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::payslip::Payslip;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::{org_id_from_claims, user_in_organization};

#[derive(Debug, Deserialize)]
pub struct PayslipListQuery {
    pub month: Option<i32>,
    pub year: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct BulkPayslipDownloadRequest {
    pub payslip_ids: Option<Vec<i64>>,
    pub month: Option<i32>,
    pub year: Option<i32>,
}

const MONTH_NAMES: [&str; 12] = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

/// GET /api/admin/me/payslips — current user's payslips (no special permission)
pub async fn my_payslips_list(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<PayslipListQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    employee_payslips_list_inner(pool, claims.sub, org_id, query).await
}

async fn employee_payslips_list_inner(
    pool: web::Data<DbPool>,
    user_id: i64,
    org_id: i64,
    query: web::Query<PayslipListQuery>,
) -> HttpResponse {
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    if !user_in_organization(&conn, user_id, org_id) {
        return HttpResponse::NotFound().json(ApiError::new("Employee not found"));
    }

    let mut sql = String::from(
        "SELECT p.* FROM payslips p
         JOIN users u ON u.id = p.user_id
         WHERE p.user_id=?1 AND u.organization_id=?2 AND p.status != 'draft'",
    );
    let mut params: Vec<crate::db::ParamValue> =
        vec![crate::db::into_param_value(user_id), crate::db::into_param_value(org_id)];
        vec![crate::db::into_param_value(user_id), crate::db::into_param_value(org_id)];

    if let Some(year) = query.year {
        sql.push_str(" AND p.year=?");
        params.push(crate::db::into_param_value(year));
    }
    if let Some(month) = query.month {
        sql.push_str(" AND p.month=?");
        params.push(crate::db::into_param_value(month));
    }
    sql.push_str(" ORDER BY p.year DESC, p.month DESC");

    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("{}", e))),
    };

    let items: Vec<serde_json::Value> = stmt
        .query_map(&params, |row| {
            let p = Payslip::from_row(row)?;
            Ok(serde_json::json!({
                "id": p.id,
                "month": p.month,
                "year": p.year,
                "gross_salary": format!("{:.2}", p.gross_salary),
                "total_deductions": format!("{:.2}", p.total_deductions),
                "net_salary": format!("{:.2}", p.net_salary),
                "status": p.status,
                "generated_at": p.generated_at.or(p.updated_at),
                "created_at": p.created_at,
            }))
        });

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// GET /api/admin/salaries/employees/{id}/payslips/list
pub async fn employee_payslips_list(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    query: web::Query<PayslipListQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    employee_payslips_list_inner(pool, path.into_inner(), org_id, query).await
}

/// POST /api/admin/payslips/{id}/send-whatsapp
pub async fn send_whatsapp(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let payslip_id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let row: Option<(String, Option<String>, i32, i32, f64, f64, String)> = conn
        .query_row(
            "SELECT u.name, u.phone, p.month, p.year, p.net_salary, p.gross_salary, p.status
             FROM payslips p JOIN users u ON u.id = p.user_id
             WHERE p.id=?1 AND u.organization_id=?2",
            crate::params![payslip_id, org_id],
            |r| {
                Ok((
                    r.get_idx::<String>(0)?,
                    r.get_idx::<Option<String>>(1)?,
                    r.get_idx::<i32>(2)?,
                    r.get_idx::<i32>(3)?,
                    r.get_idx::<f64>(4)?,
                    r.get_idx::<f64>(5)?,
                    r.get_idx::<String>(6)?,
                ))
            },
        )
        .ok();

    let Some((name, phone, month, year, net, gross, status)) = row else {
        return HttpResponse::NotFound().json(ApiError::new("Payslip not found"));
    };
    if status != "generated" {
        return HttpResponse::BadRequest().json(ApiError::new("Only generated payslips can be sent"));
    }

    let phone = phone.filter(|p| !p.trim().is_empty());
    let Some(phone) = phone else {
        return HttpResponse::BadRequest().json(ApiError::new("Employee has no phone number on file"));
    };

    let msg91_key: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE organization_id = ?1 AND key = 'msg91_auth_key'",
            [org_id],
            |r| r.get_idx::<Option<String>>(0),
        )
        .ok()
        .flatten()
        .filter(|s: &String| !s.is_empty());

    let Some(auth_key) = msg91_key else {
        return HttpResponse::BadRequest().json(ApiError::new(
            "WhatsApp not configured. Add MSG91 Auth Key in App Settings (key: msg91_auth_key).",
        ));
    };

    let sender: String = conn
        .query_row(
            "SELECT value FROM app_settings WHERE organization_id = ?1 AND key = 'msg91_whatsapp_sender'",
            [org_id],
            |r| r.get_idx::<Option<String>>(0),
        )
        .ok()
        .flatten()
        .filter(|s: &String| !s.is_empty())
        .unwrap_or_else(|| phone.clone());

    let month_label = MONTH_NAMES
        .get((month as usize).saturating_sub(1))
        .copied()
        .unwrap_or("Month");
    let message = format!(
        "Hello {}, your payslip for {} {} is ready. Gross: {:.2}, Net: {:.2}.",
        name, month_label, year, gross, net
    );

    let phone_digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
    let payload = serde_json::json!({
        "integrated_number": sender,
        "content_type": "text",
        "payload": {
            "to": phone_digits,
            "type": "text",
            "text": {
                "body": message
            }
        }
    });

    let client = reqwest::Client::new();
    let resp = client
        .post("https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/")
        .header("authkey", &auth_key)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await;

    match resp {
        Ok(r) if r.status().is_success() => HttpResponse::Ok().json(ApiResponse::success(
            serde_json::json!({
                "message": "WhatsApp notification sent via MSG91",
                "payslip_id": payslip_id,
            }),
        )),
        Ok(r) => {
            let body = r.text().await.unwrap_or_default();
            log::error!("MSG91 WhatsApp failed: {}", body);
            HttpResponse::BadGateway().json(ApiError::new(&format!(
                "MSG91 rejected the request: {}",
                if body.is_empty() { "unknown error" } else { &body }
            )))
        }
        Err(e) => HttpResponse::BadGateway().json(ApiError::new(&format!(
            "Failed to reach MSG91: {}",
            e
        ))),
    }
}

fn collect_payslip_ids(
    conn: &crate::db::Connection,
    org_id: i64,
    body: &BulkPayslipDownloadRequest,
) -> Vec<i64> {
    if let Some(ids) = &body.payslip_ids {
        return ids.clone();
    }
    if let (Some(month), Some(year)) = (body.month, body.year) {
        let mut stmt = match conn.prepare(
            "SELECT p.id FROM payslips p
             JOIN users u ON u.id = p.user_id AND u.organization_id = ?1
             WHERE p.month = ?2 AND p.year = ?3 AND p.status = 'generated'
             ORDER BY u.name",
        ) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        return stmt
            .query_map(crate::params![org_id, month, year], |row| row.get_idx::<i64>(0));
    }
    Vec::new()
}

/// GET /api/admin/payslips/{id}/pdf — printable payslip HTML (Save as PDF)
pub async fn payslip_pdf(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) {
        Ok(c) => c,
        Err(e) => return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())),
    };
    let org_id = org_id_from_claims(&claims);
    let payslip_id = path.into_inner();
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return HttpResponse::InternalServerError().json(ApiError::new("DB error")),
    };

    let Some(data) = crate::payslip_render::load_payslip(&conn, payslip_id, org_id) else {
        return HttpResponse::NotFound().json(ApiError::new("Payslip not found"));
    };

    let (owner_id, payslip_status): (i64, String) = conn
        .query_row(
            "SELECT p.user_id, p.status FROM payslips p
             INNER JOIN users u ON u.id = p.user_id AND u.organization_id = ?2
             WHERE p.id = ?1",
            crate::params![payslip_id, org_id],
            |r| Ok((r.get_idx::<i64>(0)?, r.get_idx::<String>(1)?)),
        )
        .unwrap_or((0, String::new()));

    let owns_payslip = owner_id == claims.sub;
    let is_super_admin =
        crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    let perms =
        crate::middleware::rbac::load_user_permissions(&conn, claims.sub, is_super_admin);
    let can_manage_payroll = crate::middleware::rbac::has_permission(&perms, "manage-payroll");
    let can_view_payroll = crate::middleware::rbac::has_permission(&perms, "view-payroll");

    if payslip_status != "generated" {
        if owns_payslip || !can_manage_payroll {
            return HttpResponse::Forbidden().json(ApiError::new(
                "Payslip is not yet finalized — only generated payslips can be downloaded",
            ));
        }
    }
    if !owns_payslip && !can_view_payroll {
        return HttpResponse::Forbidden().json(ApiError::new("Not allowed to view this payslip"));
    }

    let filename = crate::payslip_render::payslip_filename(&data);
    let html = crate::payslip_render::render_payslip_html(&data, true);

    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .insert_header(("Content-Disposition", format!("inline; filename=\"{filename}\"")))
        .body(html)
}

/// POST /api/admin/payslips/bulk-download — ZIP of printable payslip HTML files
pub async fn bulk_download(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<BulkPayslipDownloadRequest>,
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

    let ids = collect_payslip_ids(&conn, org_id, &body);
    if ids.is_empty() {
        return HttpResponse::BadRequest().json(ApiError::new(
            "No generated payslips found for download",
        ));
    }

    let mut buffer = Vec::new();
    {
        let mut zip = ZipWriter::new(std::io::Cursor::new(&mut buffer));
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        for payslip_id in ids {
            let Some(data) = crate::payslip_render::load_payslip(&conn, payslip_id, org_id) else {
                continue;
            };
            let filename = crate::payslip_render::payslip_filename(&data);
            let html = crate::payslip_render::render_payslip_html(&data, true);
            if zip.start_file(filename, options).is_err() {
                continue;
            }
            let _ = zip.write_all(html.as_bytes());
        }

        if zip.finish().is_err() {
            return HttpResponse::InternalServerError().json(ApiError::new("Failed to build ZIP"));
        }
    }

    let zip_name = if let (Some(month), Some(year)) = (body.month, body.year) {
        format!("payslips-{year}-{month:02}.zip")
    } else {
        "payslips.zip".to_string()
    };

    HttpResponse::Ok()
        .content_type("application/zip")
        .insert_header(("Content-Disposition", format!("attachment; filename=\"{zip_name}\"")))
        .body(buffer)
}
