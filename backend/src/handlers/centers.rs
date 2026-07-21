use actix_web::{web, HttpRequest, HttpResponse};
use crate::branch_scope::{
    append_center_id_filter, ensure_center_allowed, resolve_branch_scope, BranchScope,
};
use crate::db::DbPool;
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;
use serde::{Deserialize, Serialize};

fn actor_scope(conn: &crate::db::Connection, claims: &crate::models::user::JwtClaims) -> BranchScope {
    let org_id = org_id_from_claims(claims);
    let is_sa = crate::tenant::user_is_super_admin(conn, claims.sub, org_id);
    let (permissions, _) = crate::plan_limits::resolve_effective_permissions(
        conn,
        org_id,
        crate::middleware::rbac::load_user_permissions(conn, claims.sub, is_sa),
    );
    resolve_branch_scope(conn, claims.sub, org_id, &permissions, is_sa)
}

#[derive(Debug, Serialize)]
pub struct Center {
    pub id: i64,
    pub name: String,
    pub code: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub country: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub geofence_radius_m: Option<f64>,
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
            latitude: row.get("latitude").unwrap_or(None),
            longitude: row.get("longitude").unwrap_or(None),
            geofence_radius_m: row.get("geofence_radius_m").unwrap_or(None),
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
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub geofence_radius_m: Option<f64>,
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

#[derive(Debug, Deserialize)]
pub struct CenterListQuery {
    /// Dropdowns only need id/name.
    #[serde(default)]
    pub compact: Option<u8>,
}

pub async fn index(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<CenterListQuery>,
) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };

    if query.compact.unwrap_or(0) != 0 {
        let scope = actor_scope(&conn, &claims);
        let mut sql = String::from(
            "SELECT id, name FROM centers
             WHERE organization_id = ?1 AND COALESCE(is_active, 1) != 0",
        );
        let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
        append_center_id_filter(&mut sql, &mut params, &scope, "id");
        sql.push_str(" ORDER BY id DESC");
        let items: Vec<serde_json::Value> = conn.query_map(&sql, &params, |row| {
            Ok(serde_json::json!({
                "id": row.get_idx::<i64>(0)?,
                "name": row.get_idx::<String>(1)?,
            }))
        });
        return HttpResponse::Ok().json(ApiResponse::success(items));
    }

    let scope = actor_scope(&conn, &claims);
    let mut sql = String::from("SELECT * FROM centers WHERE organization_id = ?1");
    let mut params: Vec<crate::db::ParamValue> = vec![crate::db::into_param_value(org_id)];
    append_center_id_filter(&mut sql, &mut params, &scope, "id");
    sql.push_str(" ORDER BY COALESCE(created_at, '') DESC, id DESC");
    let items: Vec<Center> = conn.query_map(&sql, &params, Center::from_row);
    HttpResponse::Ok().json(ApiResponse::success(items))
}

pub async fn store(pool: web::Data<DbPool>, req: HttpRequest, body: web::Json<CreateCenterRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    if !actor_scope(&conn, &claims).is_all() {
        return HttpResponse::Forbidden().json(ApiError::new(
            "Only organization admins with access to all branches can create branches",
        ));
    }
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "INSERT INTO centers (name,code,address,city,state,country,latitude,longitude,geofence_radius_m,is_active,organization_id,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1,?10,?11,?12)",
        crate::params![
            body.name, body.code, body.resolved_address(), body.city, body.state, body.country,
            body.latitude, body.longitude, body.geofence_radius_m,
            org_id, &now, &now
        ]
    ) {
        Ok(_)=>HttpResponse::Created().json(ApiResponse::success(serde_json::json!({"id": conn.last_insert_rowid()}))),
        Err(e)=>HttpResponse::BadRequest().json(ApiError::new(&format!("{}",e)))
    }
}

pub async fn update(pool: web::Data<DbPool>, req: HttpRequest, path: web::Path<i64>, body: web::Json<CreateCenterRequest>) -> HttpResponse {
    let claims = match get_claims_from_request(&req) { Ok(c)=>c, Err(e)=>return HttpResponse::Unauthorized().json(ApiError::new(&e.to_string())) };
    let org_id = org_id_from_claims(&claims);
    let conn = match pool.get() { Ok(c)=>c, Err(_)=>return HttpResponse::InternalServerError().json(ApiError::new("DB error")) };
    let center_id = path.into_inner();
    if let Err(resp) = ensure_center_allowed(&actor_scope(&conn, &claims), Some(center_id)) {
        return resp;
    }
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    match conn.execute(
        "UPDATE centers SET name=?1,code=?2,address=?3,city=?4,state=?5,country=?6,
         latitude=?7,longitude=?8,geofence_radius_m=?9,updated_at=?10
         WHERE id=?11 AND organization_id=?12",
        crate::params![
            body.name, body.code, body.resolved_address(), body.city, body.state, body.country,
            body.latitude, body.longitude, body.geofence_radius_m,
            &now, center_id, org_id
        ]
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
    if let Err(resp) = ensure_center_allowed(&actor_scope(&conn, &claims), Some(center_id)) {
        return resp;
    }

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
