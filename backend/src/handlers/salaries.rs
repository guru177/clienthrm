use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::models::salary::SalaryComponent;
use serde::Deserialize;

/// List salary components filtered by type (earning/deduction)
pub async fn components_list(pool: web::Data<DbPool>, req: HttpRequest, query: web::Query<ComponentQuery>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    let sql = if let Some(ref ctype) = query.r#type {
        format!("SELECT * FROM salary_components WHERE component_type='{}' ORDER BY name", ctype)
    } else {
        "SELECT * FROM salary_components ORDER BY name".to_string()
    };

    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return HttpResponse::Ok().json(ApiResponse::success(Vec::<SalaryComponent>::new()))
    };
    let items: Vec<SalaryComponent> = stmt.query_map([], SalaryComponent::from_row).unwrap().filter_map(|r| r.ok()).collect();
    HttpResponse::Ok().json(ApiResponse::success(items))
}

#[derive(Debug, Deserialize)]
pub struct ComponentQuery {
    pub r#type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateComponentRequest {
    pub name: String,
    pub component_type: String,
    pub calculation_type: Option<String>,
    pub default_value: Option<f64>,
    pub is_taxable: Option<bool>,
}

pub async fn components_store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<CreateComponentRequest>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let slug = body.name.to_lowercase().replace(' ', "_");
    match conn.execute(
        "INSERT INTO salary_components (name,slug,component_type,calculation_type,default_value,is_taxable,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        rusqlite::params![body.name, slug, body.component_type, body.calculation_type, body.default_value, body.is_taxable.unwrap_or(false), &now, &now]
    ) {
        Ok(_) => HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"id": conn.last_insert_rowid()}))),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e)))
    }
}

pub async fn components_update(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<CreateComponentRequest>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = conn.execute(
        "UPDATE salary_components SET name=?1,component_type=?2,calculation_type=?3,default_value=?4,is_taxable=?5,updated_at=?6 WHERE id=?7",
        rusqlite::params![body.name, body.component_type, body.calculation_type, body.default_value, body.is_taxable, &now, path.into_inner()]
    );
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"})))
}

pub async fn components_destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let _ = conn.execute("DELETE FROM salary_components WHERE id=?1", [path.into_inner()]);
    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"})))
}

/// List employees with salary structures — returns paginated format
pub async fn employees_list(pool: web::Data<DbPool>, req: HttpRequest, query: web::Query<EmployeeListQuery>) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    let per_page = query.per_page.unwrap_or(15).min(100) as i64;
    let page = query.page.unwrap_or(1).max(1) as i64;
    let offset = (page - 1) * per_page;

    // Build WHERE clause
    let mut conditions = Vec::new();
    let status = query.status.as_deref().unwrap_or("active");
    if status != "all" {
        conditions.push(format!("u.status = '{}'", status.replace('\'', "''")));
    }
    if let Some(ref search) = query.search {
        if !search.is_empty() {
            let s = search.replace('\'', "''");
            conditions.push(format!("(u.name LIKE '%{}%' OR u.email LIKE '%{}%' OR u.employee_id LIKE '%{}%')", s, s, s));
        }
    }
    if let Some(ref dept) = query.department_id {
        if dept != "all" {
            conditions.push(format!("u.department_id = {}", dept));
        }
    }
    if let Some(ref desig) = query.designation_id {
        if desig != "all" {
            conditions.push(format!("u.designation_id = {}", desig));
        }
    }
    let where_clause = if conditions.is_empty() { String::new() } else { format!("WHERE {}", conditions.join(" AND ")) };

    // Count total
    let count_sql = format!("SELECT COUNT(*) FROM users u {}", where_clause);
    let total: i64 = conn.query_row(&count_sql, [], |r| r.get(0)).unwrap_or(0);
    let last_page = ((total as f64) / (per_page as f64)).ceil().max(1.0) as i64;
    let from = if total > 0 { offset + 1 } else { 0 };
    let to = (offset + per_page).min(total);

    // Fetch employees
    let sql = format!(
        "SELECT u.id, u.name, u.email, u.employee_id, u.status FROM users u {} ORDER BY u.name LIMIT {} OFFSET {}",
        where_clause, per_page, offset
    );
    let mut stmt = conn.prepare(&sql).unwrap();
    let items: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "name": row.get::<_, String>(1)?,
            "email": row.get::<_, Option<String>>(2)?,
            "employee_id": row.get::<_, Option<String>>(3)?,
            "status": row.get::<_, Option<String>>(4)?,
            "salary": serde_json::Value::Null,
            "avatar": serde_json::Value::Null,
            "photo": serde_json::Value::Null,
            "department": serde_json::Value::Null,
            "designation": serde_json::Value::Null,
            "last_payslip_date": serde_json::Value::Null,
        }))
    }).unwrap().filter_map(|r| r.ok()).collect();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "data": items,
        "total": total,
        "last_page": last_page,
        "current_page": page,
        "per_page": per_page,
        "from": from,
        "to": to,
    })))
}

#[derive(Debug, Deserialize)]
pub struct EmployeeListQuery {
    pub page: Option<u32>,
    pub per_page: Option<u32>,
    pub search: Option<String>,
    pub status: Option<String>,
    pub department_id: Option<String>,
    pub designation_id: Option<String>,
}

pub async fn employees_filter_options(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let _c = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    let mut dept_stmt = conn.prepare("SELECT id, name FROM departments ORDER BY name").unwrap();
    let departments: Vec<serde_json::Value> = dept_stmt.query_map([], |row| {
        Ok(serde_json::json!({"id": row.get::<_, i64>(0)?, "name": row.get::<_, String>(1)?}))
    }).unwrap().filter_map(|r| r.ok()).collect();

    let mut desig_stmt = conn.prepare("SELECT id, name FROM designations ORDER BY name").unwrap();
    let designations: Vec<serde_json::Value> = desig_stmt.query_map([], |row| {
        Ok(serde_json::json!({"id": row.get::<_, i64>(0)?, "name": row.get::<_, String>(1)?}))
    }).unwrap().filter_map(|r| r.ok()).collect();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "departments": departments,
        "designations": designations,
        "statuses": ["active", "inactive", "on_leave"]
    })))
}
