use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;

use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::middleware::rbac::{has_permission, load_user_permissions};
use crate::models::asset::{
    AllocateAssetRequest, Asset, AssetAllocation, AssetExpense, CreateAssetExpenseRequest,
    CreateAssetRequest, ReturnAssetRequest, ReviewAssetExpenseRequest, UpdateAssetRequest,
};
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;
use lettre::{Message, message::MultiPart};

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub status: Option<String>,
}

// ==========================================
// ASSETS (Inventory)
// ==========================================

/// GET /api/admin/assets
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
    if !has_permission(&perms, "view-assets") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: view-assets"));
    }

    let mut sql = String::from("SELECT * FROM assets WHERE organization_id = ?1");
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];

    if let Some(ref status) = query.status {
        sql.push_str(" AND status = ?");
        params.push(crate::db::into_param_value(status.clone()));
    }

    sql.push_str(" ORDER BY name ASC");

    let items: Vec<Asset> = conn
        .prepare(&sql)
        .map(|stmt| stmt.query_map(&params[..], Asset::from_row))
        .unwrap_or_default();

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/admin/assets
pub async fn store(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<CreateAssetRequest>,
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
    if !has_permission(&perms, "manage-assets") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: manage-assets"));
    }

    let now = chrono::Utc::now().naive_utc();
    let status = body.status.clone().unwrap_or_else(|| "available".to_string());

    log::info!("Inserting asset: org={}, name={}, type={}, id={:?}, status={}, date={:?}, cost={:?}, notes={:?}", org_id, body.name, body.asset_type, body.identifier, status, body.purchase_date, body.purchase_cost, body.notes);
    match conn.execute(
        "INSERT INTO assets (organization_id, name, asset_type, identifier, status, purchase_date, purchase_cost, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        crate::params![
            org_id,
            body.name,
            body.asset_type,
            body.identifier,
            status,
            body.purchase_date,
            body.purchase_cost,
            body.notes,
            now,
            now
        ],
    ) {
        Ok(_) => HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
            "id": conn.last_insert_rowid(),
            "message": "Asset created successfully"
        }))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}

/// PUT /api/admin/assets/{id}
pub async fn update(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<UpdateAssetRequest>,
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
    if !has_permission(&perms, "manage-assets") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: manage-assets"));
    }

    let id = path.into_inner();
    let now = chrono::Utc::now().naive_utc();

    let mut set_parts = vec!["updated_at = ?".to_string()];
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(now)];

    if let Some(ref name) = body.name {
        set_parts.push("name = ?".to_string());
        params.push(crate::db::into_param_value(name.clone()));
    }
    if let Some(ref asset_type) = body.asset_type {
        set_parts.push("asset_type = ?".to_string());
        params.push(crate::db::into_param_value(asset_type.clone()));
    }
    if let Some(ref identifier) = body.identifier {
        set_parts.push("identifier = ?".to_string());
        params.push(crate::db::into_param_value(identifier.clone()));
    }
    if let Some(ref status) = body.status {
        set_parts.push("status = ?".to_string());
        params.push(crate::db::into_param_value(status.clone()));
    }
    if let Some(ref purchase_date) = body.purchase_date {
        set_parts.push("purchase_date = ?".to_string());
        params.push(crate::db::into_param_value(purchase_date.clone()));
    }
    if let Some(cost) = body.purchase_cost {
        set_parts.push("purchase_cost = ?".to_string());
        params.push(crate::db::into_param_value(cost));
    }
    if let Some(ref notes) = body.notes {
        set_parts.push("notes = ?".to_string());
        params.push(crate::db::into_param_value(notes.clone()));
    }

    params.push(crate::db::into_param_value(id));
    params.push(crate::db::into_param_value(org_id));

    let sql = format!(
        "UPDATE assets SET {} WHERE id = ? AND organization_id = ?",
        set_parts.join(", ")
    );

    match conn.execute(&sql, &params[..]) {
        Ok(n) if n > 0 => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Asset updated"}))),
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Asset not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}

/// DELETE /api/admin/assets/{id}
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

    let is_super = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    let perms = load_user_permissions(&conn, claims.sub, is_super);
    if !has_permission(&perms, "manage-assets") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: manage-assets"));
    }

    let id = path.into_inner();
    
    // Check if asset is allocated
    let status: String = match conn.query_row(
        "SELECT status FROM assets WHERE id = ?1 AND organization_id = ?2",
        crate::params![id, org_id],
        |row| row.get("status")
    ) {
        Ok(s) => s,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Asset not found")),
    };

    if status == "allocated" {
        return HttpResponse::BadRequest().json(ApiError::new("Cannot delete an allocated asset. Return it first."));
    }

    match conn.execute(
        "DELETE FROM assets WHERE id = ?1 AND organization_id = ?2",
        crate::params![id, org_id],
    ) {
        Ok(n) if n > 0 => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Asset deleted successfully"}))),
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Asset not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}

// ==========================================
// ASSET ALLOCATIONS
// ==========================================

/// GET /api/admin/asset-allocations
pub async fn allocations_index(
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
    if !has_permission(&perms, "view-assets") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: view-assets"));
    }

    let mut sql = String::from(
        "SELECT aa.*, a.name AS asset_name, u.name AS user_name
         FROM asset_allocations aa
         LEFT JOIN assets a ON a.id = aa.asset_id
         LEFT JOIN users u ON u.id = aa.user_id
         WHERE aa.organization_id = ?1",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];

    if let Some(ref status) = query.status {
        sql.push_str(" AND aa.status = ?");
        params.push(crate::db::into_param_value(status.clone()));
    }

    sql.push_str(" ORDER BY aa.created_at DESC");

    let items: Vec<AssetAllocation> = conn
        .prepare(&sql)
        .map(|stmt| stmt.query_map(&params[..], AssetAllocation::from_row))
        .unwrap_or_default();

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/admin/asset-allocations
pub async fn allocate(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<AllocateAssetRequest>,
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
    if !has_permission(&perms, "manage-assets") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: manage-assets"));
    }

    let now = chrono::Utc::now().naive_utc();
    
    // Begin transaction to insert allocation and update asset status
    let tx = match conn.unchecked_transaction() {
        Ok(t) => t,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("Tx error: {e}"))),
    };

    // Check if asset is available
    let status: String = match tx.query_row(
        "SELECT status FROM assets WHERE id = ?1 AND organization_id = ?2",
        crate::params![body.asset_id, org_id],
        |row| row.get("status")
    ) {
        Ok(s) => s,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Asset not found")),
    };

    if status != "available" {
        return HttpResponse::BadRequest().json(ApiError::new(&format!("Asset is currently {status}, cannot allocate.")));
    }

    match tx.execute(
        "INSERT INTO asset_allocations (organization_id, asset_id, user_id, allocated_date, allocation_condition, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?7)",
        crate::params![
            org_id,
            body.asset_id,
            body.user_id,
            body.allocated_date,
            body.allocation_condition,
            now,
            now
        ],
    ) {
        Ok(_) => {
            let _ = tx.execute(
                "UPDATE assets SET status = 'allocated', updated_at = ?1 WHERE id = ?2 AND organization_id = ?3",
                crate::params![now, body.asset_id, org_id]
            );
            
            // Fetch info for email
            let user_email = tx.query_row("SELECT email FROM users WHERE id = ?1", crate::params![body.user_id], |row| row.get_idx::<String>(0)).unwrap_or_default();
            let asset_name = tx.query_row("SELECT name FROM assets WHERE id = ?1", crate::params![body.asset_id], |row| row.get_idx::<String>(0)).unwrap_or_default();
            
            let _ = tx.commit();
            
            // SEND EMAIL
            if !user_email.is_empty() && !asset_name.is_empty() {
                if let Some(smtp) = crate::smtp_config::resolve(&conn, org_id) {
                    if let Ok(from) = smtp.from_mailbox() {
                        let (text, html) = crate::asset_email::render_allocation_email(&asset_name, &body.allocated_date);
                        let multipart = MultiPart::alternative_plain_html(text, html);
                        if let Ok(msg) = Message::builder()
                            .from(from)
                            .to(user_email.parse().unwrap_or_else(|_| "user@example.com".parse().unwrap()))
                            .subject(format!("New Asset Allocated: {}", asset_name))
                            .multipart(multipart)
                        {
                            actix_web::rt::spawn(async move {
                                let _ = actix_web::web::block(move || smtp.send(&msg)).await;
                            });
                        }
                    }
                }
            }
            
            HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"message": "Asset allocated successfully"})))
        },
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}

/// POST /api/admin/asset-allocations/{id}/return
pub async fn process_return(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<ReturnAssetRequest>,
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
    if !has_permission(&perms, "manage-assets") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: manage-assets"));
    }

    let alloc_id = path.into_inner();
    let now = chrono::Utc::now().naive_utc();

    let tx = match conn.unchecked_transaction() {
        Ok(t) => t,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("Tx error: {e}"))),
    };

    let asset_id: i64 = match tx.query_row(
        "SELECT asset_id FROM asset_allocations WHERE id = ?1 AND organization_id = ?2 AND status = 'active'",
        crate::params![alloc_id, org_id],
        |row| row.get("asset_id")
    ) {
        Ok(id) => id,
        Err(_) => return HttpResponse::NotFound().json(ApiError::new("Active allocation not found")),
    };

    match tx.execute(
        "UPDATE asset_allocations SET status = 'returned', return_date = ?1, return_condition = ?2, updated_at = ?3 WHERE id = ?4",
        crate::params![body.return_date, body.return_condition, now, alloc_id],
    ) {
        Ok(n) if n > 0 => {
            let _ = tx.execute(
                "UPDATE assets SET status = 'available', updated_at = ?1 WHERE id = ?2 AND organization_id = ?3",
                crate::params![now, asset_id, org_id]
            );
            let _ = tx.commit();
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Asset returned successfully"})))
        },
        _ => HttpResponse::BadRequest().json(ApiError::new("Failed to process return")),
    }
}

// ==========================================
// ASSET EXPENSES (Admin + Employee)
// ==========================================

/// GET /api/admin/asset-expenses (Admin views all)
pub async fn expenses_index(
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
    if !has_permission(&perms, "view-assets") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: view-assets"));
    }

    let mut sql = String::from(
        "SELECT ae.*, a.name AS asset_name, u.name AS user_name, r.name AS reviewer_name
         FROM asset_expenses ae
         LEFT JOIN assets a ON a.id = ae.asset_id
         LEFT JOIN users u ON u.id = ae.user_id
         LEFT JOIN users r ON r.id = ae.reviewed_by
         WHERE ae.organization_id = ?1",
    );
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];

    if let Some(ref status) = query.status {
        sql.push_str(" AND ae.status = ?");
        params.push(crate::db::into_param_value(status.clone()));
    }

    sql.push_str(" ORDER BY ae.created_at DESC");

    let items: Vec<AssetExpense> = conn
        .prepare(&sql)
        .map(|stmt| stmt.query_map(&params[..], AssetExpense::from_row))
        .unwrap_or_default();

    HttpResponse::Ok().json(ApiResponse::success(items))
}

/// POST /api/admin/asset-expenses/{id}/review
pub async fn expenses_review(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<ReviewAssetExpenseRequest>,
) -> HttpResponse {
    use lettre::{Message, Transport};
    use lettre::message::MultiPart;

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
    if !has_permission(&perms, "manage-assets") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: manage-assets"));
    }

    let now = chrono::Utc::now().naive_utc();
    let expense_id = path.into_inner();
    let reviewer_id = claims.sub;

    if body.status != "approved" && body.status != "rejected" {
        return HttpResponse::BadRequest().json(ApiError::new("Status must be 'approved' or 'rejected'"));
    }

    let tx = match conn.unchecked_transaction() {
        Ok(t) => t,
        Err(e) => return HttpResponse::InternalServerError().json(ApiError::new(&format!("Tx error: {e}"))),
    };

    match tx.execute(
        "UPDATE asset_expenses SET status = ?1, reviewed_by = ?2, updated_at = ?3 WHERE id = ?4 AND organization_id = ?5",
        crate::params![body.status, reviewer_id, now, expense_id, org_id]
    ) {
        Ok(rows) if rows > 0 => {
            // Fetch info for email
            let (employee_email, asset_id, amount) = tx.query_row(
                "SELECT u.email, ae.asset_id, ae.amount FROM asset_expenses ae JOIN users u ON ae.user_id = u.id WHERE ae.id = ?1",
                crate::params![expense_id],
                |row| Ok((row.get_idx::<String>(0)?, row.get_idx::<i64>(1)?, row.get_idx::<f64>(2)?))
            ).unwrap_or((String::new(), 0, 0.0));
            
            let asset_name = tx.query_row("SELECT name FROM assets WHERE id = ?1", crate::params![asset_id], |row| row.get_idx::<String>(0)).unwrap_or_default();
            
            let _ = tx.commit();
            
            // SEND EMAIL TO EMPLOYEE
            if !employee_email.is_empty() {
                if let Some(smtp) = crate::smtp_config::resolve(&conn, org_id) {
                    if let Ok(from) = smtp.from_mailbox() {
                        let subject = format!("Expense Log {}: {}", body.status.to_uppercase(), asset_name);
                        let text = format!("Your expense log of Rs. {} for asset '{}' has been {}.", amount, asset_name, body.status);
                        let html = format!("<p>Your expense log of <strong>Rs. {}</strong> for asset <strong>'{}'</strong> has been <strong>{}</strong>.</p>", amount, asset_name, body.status);
                        let multipart = MultiPart::alternative_plain_html(text, html);
                        if let Ok(msg) = Message::builder()
                            .from(from)
                            .to(employee_email.parse().unwrap_or_else(|_| "user@example.com".parse().unwrap()))
                            .subject(subject)
                            .multipart(multipart)
                        {
                            actix_web::rt::spawn(async move {
                                let _ = actix_web::web::block(move || smtp.send(&msg)).await;
                            });
                        }
                    }
                }
            }
            
            HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Expense reviewed successfully"})))
        },
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Expense not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}

// ==========================================
// MY ASSETS (Employee Self-Service)
// ==========================================

/// GET /api/admin/my-assets
pub async fn my_assets(
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

    let is_super = crate::middleware::rbac::effective_super_admin(&conn, &claims, org_id);
    let perms = load_user_permissions(&conn, claims.sub, is_super);
    if !has_permission(&perms, "view-my-assets") && !has_permission(&perms, "view-assets") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: view-my-assets"));
    }

    // Get active allocations
    let allocations: Vec<AssetAllocation> = conn
        .prepare(
            "SELECT aa.*, a.name AS asset_name, u.name AS user_name
             FROM asset_allocations aa
             LEFT JOIN assets a ON a.id = aa.asset_id
             LEFT JOIN users u ON u.id = aa.user_id
             WHERE aa.organization_id = ?1 AND aa.user_id = ?2 AND aa.status = 'active'",
        )
        .map(|stmt| stmt.query_map(&[crate::db::into_param_value(org_id), crate::db::into_param_value(claims.sub)][..], AssetAllocation::from_row))
        .unwrap_or_default();

    // Get expenses submitted by this user
    let expenses: Vec<AssetExpense> = conn
        .prepare(
            "SELECT ae.*, a.name AS asset_name, u.name AS user_name, r.name AS reviewer_name
             FROM asset_expenses ae
             LEFT JOIN assets a ON a.id = ae.asset_id
             LEFT JOIN users u ON u.id = ae.user_id
             LEFT JOIN users r ON r.id = ae.reviewed_by
             WHERE ae.organization_id = ?1 AND ae.user_id = ?2
             ORDER BY ae.created_at DESC",
        )
        .map(|stmt| stmt.query_map(&[crate::db::into_param_value(org_id), crate::db::into_param_value(claims.sub)][..], AssetExpense::from_row))
        .unwrap_or_default();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "allocations": allocations,
        "expenses": expenses,
    })))
}

/// POST /api/admin/my-assets/expenses
pub async fn my_assets_store_expense(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Json<CreateAssetExpenseRequest>,
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
    if !has_permission(&perms, "view-my-assets") && !has_permission(&perms, "view-assets") {
        return HttpResponse::Forbidden().json(ApiError::new("Missing permission: view-my-assets"));
    }

    if body.amount <= 0.0 {
        return HttpResponse::BadRequest().json(ApiError::new("Amount must be positive"));
    }

    // Verify the asset is currently allocated to the user
    let is_allocated: bool = conn.query_row(
        "SELECT 1 FROM asset_allocations WHERE asset_id = ?1 AND user_id = ?2 AND organization_id = ?3 AND status = 'active'",
        crate::params![body.asset_id, claims.sub, org_id],
        |_| Ok(true)
    ).unwrap_or(false);

    if !is_allocated {
        return HttpResponse::Forbidden().json(ApiError::new("Asset is not currently allocated to you"));
    }

    let now = chrono::Utc::now().naive_utc();

    match conn.execute(
        "INSERT INTO asset_expenses (organization_id, asset_id, user_id, expense_type, amount, expense_date, description, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?9)",
        crate::params![
            org_id,
            body.asset_id,
            claims.sub,
            body.expense_type,
            body.amount,
            body.expense_date,
            body.description,
            now,
            now
        ],
    ) {
        Ok(_) => {
            let expense_id = conn.last_insert_rowid();
            // Fetch info for email
            let asset_name = conn.query_row("SELECT name FROM assets WHERE id = ?1", crate::params![body.asset_id], |row| row.get_idx::<String>(0)).unwrap_or_default();
            let mut admin_emails = Vec::new();
            if let Ok(stmt) = conn.prepare(
                "SELECT DISTINCT u.email FROM users u 
                 JOIN role_user ru ON u.id = ru.user_id 
                 JOIN permission_role pr ON ru.role_id = pr.role_id 
                 JOIN permissions p ON p.id = pr.permission_id 
                 WHERE u.organization_id = ?1 AND p.name = 'manage-assets' AND u.status = 'active'"
            ) {
                let emails = stmt.query_map(crate::params![org_id], |row| row.get_idx::<String>(0));
                admin_emails.extend(emails);
            }
            
            // SEND EMAIL TO ADMINS
            if !admin_emails.is_empty() {
                if let Some(smtp) = crate::smtp_config::resolve(&conn, org_id) {
                    if let Ok(from) = smtp.from_mailbox() {
                        let logged_by_name = conn.query_row(
                            "SELECT name FROM users WHERE id = ?1",
                            crate::params![claims.sub],
                            |row| row.get_idx::<String>(0)
                        ).unwrap_or_else(|_| "An Employee".to_string());
                        
                        let (text, html) = crate::asset_email::render_expense_email(&asset_name, body.amount, &logged_by_name);
                        
                        actix_web::rt::spawn(async move {
                            for admin_email in admin_emails {
                                let multipart = lettre::message::MultiPart::alternative_plain_html(text.clone(), html.clone());
                                if let Ok(msg) = lettre::Message::builder()
                                    .from(from.clone())
                                    .to(admin_email.parse().unwrap_or_else(|_| "admin@example.com".parse().unwrap()))
                                    .subject(format!("New Expense Logged: {}", asset_name))
                                    .multipart(multipart)
                                {
                                    let _ = actix_web::web::block({
                                        let smtp = smtp.clone();
                                        move || smtp.send(&msg)
                                    }).await;
                                }
                            }
                        });
                    }
                }
            }
            
            HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
                "id": expense_id,
                "message": "Expense submitted successfully for review"
            })))
        },
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{e}"))),
    }
}
