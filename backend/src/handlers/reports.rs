use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};

/// Dashboard-style reports with aggregated stats matching frontend Stats interface
pub async fn stats(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    // Leads
    let total_leads: i64 = conn.query_row("SELECT COUNT(*) FROM leads", [], |r| r.get(0)).unwrap_or(0);
    let new_leads_month: i64 = conn.query_row("SELECT COUNT(*) FROM leads WHERE created_at >= date('now','start of month')", [], |r| r.get(0)).unwrap_or(0);
    let converted_leads: i64 = conn.query_row("SELECT COUNT(*) FROM leads WHERE converted_contact_id IS NOT NULL", [], |r| r.get(0)).unwrap_or(0);
    let conversion_rate = if total_leads > 0 { (converted_leads as f64 / total_leads as f64 * 100.0).round() } else { 0.0 };

    // Contacts
    let total_contacts: i64 = conn.query_row("SELECT COUNT(*) FROM contacts", [], |r| r.get(0)).unwrap_or(0);
    let new_contacts_month: i64 = conn.query_row("SELECT COUNT(*) FROM contacts WHERE created_at >= date('now','start of month')", [], |r| r.get(0)).unwrap_or(0);
    let active_contacts: i64 = conn.query_row("SELECT COUNT(*) FROM contacts WHERE status='active'", [], |r| r.get(0)).unwrap_or(0);

    // Companies (distinct from contacts)
    let total_companies: i64 = conn.query_row("SELECT COUNT(DISTINCT company) FROM contacts WHERE company IS NOT NULL AND company != ''", [], |r| r.get(0)).unwrap_or(0);

    // Deals
    let total_deals: i64 = conn.query_row("SELECT COUNT(*) FROM deals", [], |r| r.get(0)).unwrap_or(0);
    let total_deal_value: f64 = conn.query_row("SELECT COALESCE(SUM(value),0) FROM deals", [], |r| r.get(0)).unwrap_or(0.0);
    let won_deals: i64 = conn.query_row("SELECT COUNT(*) FROM deals WHERE stage='won'", [], |r| r.get(0)).unwrap_or(0);
    let won_value: f64 = conn.query_row("SELECT COALESCE(SUM(value),0) FROM deals WHERE stage='won'", [], |r| r.get(0)).unwrap_or(0.0);
    let lost_deals: i64 = conn.query_row("SELECT COUNT(*) FROM deals WHERE stage='lost'", [], |r| r.get(0)).unwrap_or(0);
    let in_progress_deals: i64 = conn.query_row("SELECT COUNT(*) FROM deals WHERE stage NOT IN ('won','lost')", [], |r| r.get(0)).unwrap_or(0);
    let win_rate = if total_deals > 0 { (won_deals as f64 / total_deals as f64 * 100.0).round() } else { 0.0 };

    // Tasks
    let total_tasks: i64 = conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0)).unwrap_or(0);
    let completed_tasks: i64 = conn.query_row("SELECT COUNT(*) FROM tasks WHERE status='completed' OR status='done'", [], |r| r.get(0)).unwrap_or(0);
    let in_progress_tasks: i64 = conn.query_row("SELECT COUNT(*) FROM tasks WHERE status='in_progress' OR status='in-progress'", [], |r| r.get(0)).unwrap_or(0);
    let overdue_tasks: i64 = conn.query_row("SELECT COUNT(*) FROM tasks WHERE due_date < date('now') AND status NOT IN ('completed','done')", [], |r| r.get(0)).unwrap_or(0);

    // Users
    let total_users: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0)).unwrap_or(0);
    let active_users: i64 = conn.query_row("SELECT COUNT(*) FROM users WHERE status='active'", [], |r| r.get(0)).unwrap_or(0);
    let new_users_month: i64 = conn.query_row("SELECT COUNT(*) FROM users WHERE created_at >= date('now','start of month')", [], |r| r.get(0)).unwrap_or(0);

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "leads": {
            "total": total_leads,
            "new_this_month": new_leads_month,
            "converted": converted_leads,
            "conversion_rate": conversion_rate
        },
        "contacts": {
            "total": total_contacts,
            "new_this_month": new_contacts_month,
            "active": active_contacts
        },
        "companies": {
            "total": total_companies,
            "new_this_month": 0,
            "active": total_companies
        },
        "deals": {
            "total": total_deals,
            "total_value": total_deal_value,
            "won": won_deals,
            "won_value": won_value,
            "lost": lost_deals,
            "in_progress": in_progress_deals,
            "win_rate": win_rate
        },
        "invoices": {
            "total": 0,
            "total_amount": 0,
            "paid": 0,
            "paid_amount": 0,
            "pending": 0,
            "pending_amount": 0,
            "overdue": 0,
            "overdue_amount": 0
        },
        "tasks": {
            "total": total_tasks,
            "completed": completed_tasks,
            "in_progress": in_progress_tasks,
            "overdue": overdue_tasks
        },
        "users": {
            "total": total_users,
            "active": active_users,
            "new_this_month": new_users_month
        }
    })))
}

pub async fn pipeline(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    let stages = ["lead", "qualified", "proposal", "negotiation", "won", "lost"];
    let mut pipeline_data = Vec::new();
    for stage in &stages {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM deals WHERE stage=?1", [stage], |r| r.get(0)
        ).unwrap_or(0);
        let value: f64 = conn.query_row(
            "SELECT COALESCE(SUM(value),0) FROM deals WHERE stage=?1", [stage], |r| r.get(0)
        ).unwrap_or(0.0);
        pipeline_data.push(serde_json::json!({
            "stage": stage, "count": count, "total_value": value
        }));
    }

    HttpResponse::Ok().json(ApiResponse::success(pipeline_data))
}

pub async fn lead_sources(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    let mut stmt = conn.prepare(
        "SELECT COALESCE(source,'Unknown') as source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC"
    ).unwrap();
    let items: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "source": row.get::<_, String>(0)?,
            "count": row.get::<_, i64>(1)?
        }))
    }).unwrap().filter_map(|r| r.ok()).collect();

    HttpResponse::Ok().json(ApiResponse::success(items))
}

pub async fn trends(_pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    // Return empty trends data for now
    HttpResponse::Ok().json(ApiResponse::success(Vec::<serde_json::Value>::new()))
}
