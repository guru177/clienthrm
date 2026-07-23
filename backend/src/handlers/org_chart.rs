//! Organization chart — reporting forest with designation + RBAC role metadata.

use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

use crate::db::{DbPool, ParamValue};
use crate::middleware::auth::get_claims_from_request;
use crate::models::{ApiError, ApiResponse};
use crate::tenant::org_id_from_claims;

#[derive(Debug, Deserialize)]
pub struct OrgChartQuery {
    pub center_id: Option<i64>,
    pub role_id: Option<i64>,
    pub designation_id: Option<i64>,
    pub search: Option<String>,
}

#[derive(Clone)]
struct FlatNode {
    id: i64,
    name: String,
    email: Option<String>,
    employee_id: Option<String>,
    avatar: Option<String>,
    photo: Option<String>,
    status: Option<String>,
    parent_id: Option<i64>,
    designation_id: Option<i64>,
    designation_name: Option<String>,
    designation_level: Option<String>,
    department_id: Option<i64>,
    department_name: Option<String>,
    role_id: Option<i64>,
    role_name: Option<String>,
}

const NODE_SELECT: &str = "SELECT u.id, u.name, u.email, u.employee_id, u.avatar, u.photo, u.status,
                COALESCE(u.reporting_manager_id, u.manager_id) AS parent_id,
                u.designation_id, des.name AS designation_name, des.level AS designation_level,
                u.department_id, d.name AS department_name,
                r.id AS role_id, r.name AS role_name
         FROM users u
         LEFT JOIN designations des ON des.id = u.designation_id AND des.organization_id = u.organization_id
         LEFT JOIN departments d ON d.id = u.department_id AND d.organization_id = u.organization_id
         LEFT JOIN role_user ru ON ru.user_id = u.id
         LEFT JOIN roles r ON r.id = ru.role_id AND r.organization_id = u.organization_id";

const ORG_BASE_WHERE: &str = " WHERE u.deleted_at IS NULL
           AND u.organization_id = ?1
           AND (u.is_super_admin IS NULL OR u.is_super_admin = 0)
           AND (u.is_external IS NULL OR u.is_external = 0)";

fn map_flat_node(row: &crate::db::Row<'_>) -> crate::db::Result<FlatNode> {
    Ok(FlatNode {
        id: row.get_idx::<i64>(0)?,
        name: row.get_idx::<String>(1)?,
        email: row.get_idx::<Option<String>>(2)?,
        employee_id: row.get_idx::<Option<String>>(3)?,
        avatar: row.get_idx::<Option<String>>(4)?,
        photo: row.get_idx::<Option<String>>(5)?,
        status: row.get_idx::<Option<String>>(6)?,
        parent_id: row.get_idx::<Option<i64>>(7)?,
        designation_id: row.get_idx::<Option<i64>>(8)?,
        designation_name: row.get_idx::<Option<String>>(9)?,
        designation_level: row.get_idx::<Option<String>>(10)?,
        department_id: row.get_idx::<Option<i64>>(11)?,
        department_name: row.get_idx::<Option<String>>(12)?,
        role_id: row.get_idx::<Option<i64>>(13)?,
        role_name: row.get_idx::<Option<String>>(14)?,
    })
}

fn append_optional_filters(
    sql: &mut String,
    params: &mut Vec<ParamValue>,
    query: &OrgChartQuery,
) {
    if let Some(rid) = query.role_id {
        let idx = params.len() + 1;
        sql.push_str(&format!(" AND r.id = ?{idx}"));
        params.push(crate::db::into_param_value(rid));
    }
    if let Some(did) = query.designation_id {
        let idx = params.len() + 1;
        sql.push_str(&format!(" AND u.designation_id = ?{idx}"));
        params.push(crate::db::into_param_value(did));
    }
    if let Some(ref search) = query.search {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            let idx = params.len() + 1;
            sql.push_str(&format!(
                " AND (u.name LIKE ?{idx} OR u.email LIKE ?{} OR COALESCE(u.employee_id, '') LIKE ?{})",
                idx + 1,
                idx + 2
            ));
            let like = format!("%{trimmed}%");
            params.push(crate::db::into_param_value(like.clone()));
            params.push(crate::db::into_param_value(like.clone()));
            params.push(crate::db::into_param_value(like));
        }
    }
}

fn load_nodes(conn: &crate::db::Connection, sql: &str, params: &[ParamValue]) -> Vec<FlatNode> {
    conn.query_map(sql, params, map_flat_node)
}

fn merge_nodes(by_id: &mut HashMap<i64, FlatNode>, nodes: Vec<FlatNode>) {
    for n in nodes {
        by_id.entry(n.id).or_insert(n);
    }
}

/// HQ / branchless staff: no work location, no user_centers, no department tied to a center.
fn load_branchless_hq(
    conn: &crate::db::Connection,
    org_id: i64,
    query: &OrgChartQuery,
) -> Vec<FlatNode> {
    let mut sql = format!(
        "{NODE_SELECT}
         {ORG_BASE_WHERE}
           AND TRIM(COALESCE(u.work_location, '')) = ''
           AND NOT EXISTS (
             SELECT 1 FROM user_centers uc
             WHERE uc.user_id = u.id AND uc.organization_id = u.organization_id
           )
           AND (
             u.department_id IS NULL
             OR NOT EXISTS (
               SELECT 1 FROM departments dd
               WHERE dd.id = u.department_id
                 AND dd.organization_id = u.organization_id
                 AND dd.center_id IS NOT NULL
             )
           )"
    );
    let mut params: Vec<ParamValue> = vec![crate::db::into_param_value(org_id)];
    append_optional_filters(&mut sql, &mut params, query);
    sql.push_str(" ORDER BY COALESCE(des.level, '99'), u.name");
    load_nodes(conn, &sql, &params)
}

fn load_user_by_id(conn: &crate::db::Connection, org_id: i64, user_id: i64) -> Option<FlatNode> {
    let sql = format!(
        "{NODE_SELECT}
         {ORG_BASE_WHERE}
           AND u.id = ?2"
    );
    load_nodes(
        conn,
        &sql,
        &[
            crate::db::into_param_value(org_id),
            crate::db::into_param_value(user_id),
        ],
    )
    .into_iter()
    .next()
}

/// Walk reporting chain upward so out-of-branch managers (e.g. HQ Admin) still appear.
fn merge_reporting_ancestors(
    conn: &crate::db::Connection,
    org_id: i64,
    by_id: &mut HashMap<i64, FlatNode>,
) {
    let seed: Vec<i64> = by_id.keys().copied().collect();
    for start in seed {
        let mut current = by_id.get(&start).and_then(|n| n.parent_id);
        let mut guard = 0;
        while let Some(pid) = current {
            guard += 1;
            if guard > 64 {
                break;
            }
            if by_id.contains_key(&pid) {
                current = by_id.get(&pid).and_then(|n| n.parent_id.filter(|p| *p != pid));
                continue;
            }
            let Some(ancestor) = load_user_by_id(conn, org_id, pid) else {
                break;
            };
            let next = ancestor.parent_id.filter(|p| *p != ancestor.id);
            by_id.insert(ancestor.id, ancestor);
            current = next;
        }
    }
}

fn node_json(n: &FlatNode, children: Vec<serde_json::Value>) -> serde_json::Value {
    serde_json::json!({
        "id": n.id,
        "name": n.name,
        "email": n.email,
        "employee_id": n.employee_id,
        "avatar": n.avatar,
        "photo": n.photo,
        "status": n.status,
        "parent_id": n.parent_id,
        "designation": n.designation_id.map(|id| serde_json::json!({
            "id": id,
            "name": n.designation_name.clone().unwrap_or_default(),
            "level": n.designation_level,
        })),
        "department": n.department_id.map(|id| serde_json::json!({
            "id": id,
            "name": n.department_name.clone().unwrap_or_default(),
        })),
        "roles": n.role_id.map(|id| vec![serde_json::json!({
            "id": id,
            "name": n.role_name.clone().unwrap_or_default(),
        })]).unwrap_or_default(),
        "children": children,
    })
}

fn build_subtree(
    id: i64,
    by_id: &HashMap<i64, FlatNode>,
    children_of: &HashMap<i64, Vec<i64>>,
    path: &mut HashSet<i64>,
    cycle_broken: &mut HashSet<i64>,
) -> Option<serde_json::Value> {
    if path.contains(&id) {
        cycle_broken.insert(id);
        return None;
    }
    let node = by_id.get(&id)?;
    path.insert(id);
    let mut kids = Vec::new();
    if let Some(child_ids) = children_of.get(&id) {
        for &cid in child_ids {
            if let Some(child) = build_subtree(cid, by_id, children_of, path, cycle_broken) {
                kids.push(child);
            }
        }
    }
    path.remove(&id);
    Some(node_json(node, kids))
}

/// GET /api/admin/org-chart
pub async fn index(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    query: web::Query<OrgChartQuery>,
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

    let scope = crate::branch_scope::actor_branch_scope_from_claims(&conn, &claims);
    if let Some(cid) = query.center_id {
        if !crate::tenant::center_in_organization(&conn, cid, org_id) {
            return HttpResponse::BadRequest().json(ApiError::new("Branch not found"));
        }
        if let Err(resp) = crate::branch_scope::ensure_center_allowed(&scope, Some(cid)) {
            return resp;
        }
    }

    let mut sql = format!("{NODE_SELECT}{ORG_BASE_WHERE}");
    let mut params: Vec<ParamValue> = vec![crate::db::into_param_value(org_id)];
    crate::branch_scope::append_users_branch_filter(&mut sql, &mut params, &scope, "u");

    if let Some(cid) = query.center_id {
        let wl_idx = params.len() + 1;
        let dept_idx = wl_idx + 1;
        let uc_idx = wl_idx + 2;
        sql.push_str(&format!(
            " AND (
                TRIM(COALESCE(u.work_location, '')) = ?{wl_idx}
                OR u.department_id IN (
                  SELECT dd.id FROM departments dd
                  WHERE dd.organization_id = u.organization_id AND dd.center_id = ?{dept_idx}
                )
                OR EXISTS (
                  SELECT 1 FROM user_centers uc
                  WHERE uc.user_id = u.id
                    AND uc.organization_id = u.organization_id
                    AND uc.center_id = ?{uc_idx}
                )
              )"
        ));
        params.push(crate::db::into_param_value(cid.to_string()));
        params.push(crate::db::into_param_value(cid));
        params.push(crate::db::into_param_value(cid));
    }

    append_optional_filters(&mut sql, &mut params, &query);
    sql.push_str(" ORDER BY COALESCE(des.level, '99'), u.name");

    let mut by_id: HashMap<i64, FlatNode> = HashMap::new();
    merge_nodes(&mut by_id, load_nodes(&conn, &sql, &params));

    // HQ admins with no branch assignment still appear as chart roots / parents.
    merge_nodes(&mut by_id, load_branchless_hq(&conn, org_id, &query));

    // Pull reporting ancestors even when they sit outside the branch filter.
    merge_reporting_ancestors(&conn, org_id, &mut by_id);

    let ids: HashSet<i64> = by_id.keys().copied().collect();
    let mut children_of: HashMap<i64, Vec<i64>> = HashMap::new();
    let mut roots: Vec<i64> = Vec::new();
    let mut missing_manager = 0i64;

    for (id, node) in &by_id {
        let mut parent = node.parent_id.filter(|p| *p != *id);
        if let Some(pid) = parent {
            if !ids.contains(&pid) {
                parent = None;
            }
        }
        match parent {
            Some(pid) => children_of.entry(pid).or_default().push(*id),
            None => {
                roots.push(*id);
                if node.parent_id.is_none() {
                    missing_manager += 1;
                }
            }
        }
    }

    for kids in children_of.values_mut() {
        kids.sort_by(|a, b| {
            let na = by_id.get(a).map(|n| n.name.as_str()).unwrap_or("");
            let nb = by_id.get(b).map(|n| n.name.as_str()).unwrap_or("");
            na.cmp(nb)
        });
    }
    roots.sort_by(|a, b| {
        let na = by_id.get(a).map(|n| n.name.as_str()).unwrap_or("");
        let nb = by_id.get(b).map(|n| n.name.as_str()).unwrap_or("");
        na.cmp(nb)
    });

    let mut cycle_broken: HashSet<i64> = HashSet::new();
    let mut forest = Vec::new();
    let mut path = HashSet::new();
    for rid in &roots {
        if let Some(tree) = build_subtree(*rid, &by_id, &children_of, &mut path, &mut cycle_broken) {
            forest.push(tree);
        }
    }

    let mut seen_in_forest: HashSet<i64> = HashSet::new();
    fn collect_ids(v: &serde_json::Value, into: &mut HashSet<i64>) {
        if let Some(id) = v.get("id").and_then(|x| x.as_i64()) {
            into.insert(id);
        }
        if let Some(arr) = v.get("children").and_then(|c| c.as_array()) {
            for c in arr {
                collect_ids(c, into);
            }
        }
    }
    for t in &forest {
        collect_ids(t, &mut seen_in_forest);
    }

    let mut needs_reporting_line: Vec<serde_json::Value> = Vec::new();
    for id in &cycle_broken {
        if let Some(n) = by_id.get(id) {
            if !seen_in_forest.contains(id) {
                needs_reporting_line.push(node_json(n, vec![]));
            }
        }
    }
    for id in &ids {
        if !seen_in_forest.contains(id) && !cycle_broken.contains(id) {
            if let Some(n) = by_id.get(id) {
                needs_reporting_line.push(node_json(n, vec![]));
            }
        }
    }
    needs_reporting_line.sort_by(|a, b| {
        let na = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let nb = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
        na.cmp(nb)
    });

    let roles_filter: Vec<serde_json::Value> = conn
        .prepare("SELECT id, name FROM roles WHERE organization_id = ?1 ORDER BY name")
        .map(|s| {
            s.query_map([org_id], |row| {
                Ok(serde_json::json!({
                    "id": row.get_idx::<i64>(0)?,
                    "name": row.get_idx::<String>(1)?,
                }))
            })
        })
        .unwrap_or_default();

    let designations_filter: Vec<serde_json::Value> = conn
        .prepare(
            "SELECT id, name, level FROM designations WHERE organization_id = ?1 ORDER BY name",
        )
        .map(|s| {
            s.query_map([org_id], |row| {
                Ok(serde_json::json!({
                    "id": row.get_idx::<i64>(0)?,
                    "name": row.get_idx::<String>(1)?,
                    "level": row.get_idx::<Option<String>>(2)?,
                }))
            })
        })
        .unwrap_or_default();

    HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "forest": forest,
        "needs_reporting_line": needs_reporting_line,
        "stats": {
            "total": by_id.len(),
            "roots": forest.len(),
            "missing_manager": missing_manager,
            "needs_reporting_line": needs_reporting_line.len(),
        },
        "filters": {
            "roles": roles_filter,
            "designations": designations_filter,
        },
    })))
}
