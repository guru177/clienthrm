use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct Center {
    pub id: i64,
    pub name: String,
    pub code: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub country: Option<String>,
    pub is_active: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

impl Center {
    fn is_active_from_row(row: &crate::db::Row) -> bool {
        row.get::<Option<i64>>("is_active")
            .ok()
            .flatten()
            .or_else(|| {
                row.get::<Option<bool>>("is_active")
                    .ok()
                    .flatten()
                    .map(|b| if b { 1 } else { 0 })
            })
            .unwrap_or(1)
            != 0
    }

    pub fn from_row(row: &crate::db::Row) -> crate::db::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            code: row.get("code")?,
            address: row.get("address")?,
            city: row.get("city")?,
            state: row.get("state")?,
            country: row.get("country")?,
            is_active: Self::is_active_from_row(row),
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateCenterRequest {
    pub name: String,
    pub code: Option<String>,
    pub address: Option<String>,
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub place: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub country: Option<String>,
    pub pincode: Option<String>,
}

impl CreateCenterRequest {
    fn resolved_address(&self) -> Option<String> {
        if let Some(ref a) = self.address {
            if !a.is_empty() {
                return Some(a.clone());
            }
        }
        let parts: Vec<String> = [
            self.address_line1.clone(),
            self.address_line2.clone(),
            self.place.clone(),
            self.pincode.clone(),
        ]
        .into_iter()
        .flatten()
        .filter(|s| !s.is_empty())
        .collect();
        if parts.is_empty() {
            None
        } else {
            Some(parts.join(", "))
        }
    }
}

pub async fn index(pool: web::Data<DbPool>, req: HttpRequest) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let stmt = match conn.prepare("SELECT * FROM centers WHERE organization_id = ?1 ORDER BY name") {
        Ok(s) => s,
        Err(_) => return HttpResponse::Ok().json(ApiResponse::success(Vec::<Center>::new()))
    };
    let items: Vec<Center> = stmt.query_map([org_id], Center::from_row);
    HttpResponse::Ok().json(ApiResponse::success(items))
}

pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<CreateCenterRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "INSERT INTO centers (name,code,address,city,state,country,is_active,organization_id,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,1,?7,?8,?9)",
        crate::params![body.name, body.code, body.resolved_address(), body.city, body.state, body.country, org_id, &now, &now]
    ) {
        Ok(_)=>HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"id": conn.last_insert_rowid()}))),
        Err(e)=>HttpResponse::BadRequest().json(ApiError::new(&format!("{}",e)))
    }
}

pub async fn update(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<CreateCenterRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "UPDATE centers SET name=?1,code=?2,address=?3,city=?4,state=?5,country=?6,updated_at=?7 WHERE id=?8 AND organization_id=?9",
        crate::params![body.name, body.code, body.resolved_address(), body.city, body.state, body.country, &now, path.into_inner(), org_id]
    ) {
        Ok(n) if n > 0 => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Updated"}))),
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Center not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}

pub async fn destroy(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let center_id = path.into_inner();

    let dept_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM departments WHERE center_id = ?1 AND organization_id = ?2",
            crate::params![center_id, org_id],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);
    if dept_count > 0 {
        return HttpResponse::BadRequest().json(ApiError::new(&format!(
            "Cannot delete branch: {dept_count} department(s) are assigned to it"
        )));
    }

    match conn.execute(
        "DELETE FROM centers WHERE id=?1 AND organization_id=?2",
        crate::params![center_id, org_id],
    ) {
        Ok(n) if n > 0 => HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({"message": "Deleted"}))),
        Ok(_) => HttpResponse::NotFound().json(ApiError::new("Center not found")),
        Err(e) => HttpResponse::BadRequest().json(ApiError::new(&format!("{}", e))),
    }
}
