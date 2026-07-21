//! Organization-wide vs branch-scoped RBAC.
//!
//! - Users with `access-all-centers` (or super-admin) see the whole org.
//! - Everyone else is limited to centers in `user_centers`, falling back to
//!   `users.work_location` when that table has no rows for them.
//! - Employee membership for filtering is `work_location` and/or
//!   `departments.center_id`.

use crate::db::{Connection, ParamValue};
use crate::middleware::rbac::has_permission;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BranchScope {
    /// Org-wide — no center filter.
    All,
    /// Restricted to these center ids (may be empty → no admin visibility).
    Centers(Vec<i64>),
}

impl BranchScope {
    pub fn is_all(&self) -> bool {
        matches!(self, Self::All)
    }

    pub fn center_ids(&self) -> &[i64] {
        match self {
            Self::All => &[],
            Self::Centers(ids) => ids,
        }
    }

    pub fn allows_center(&self, center_id: i64) -> bool {
        match self {
            Self::All => true,
            Self::Centers(ids) => ids.contains(&center_id),
        }
    }

    pub fn to_json(&self) -> serde_json::Value {
        match self {
            Self::All => serde_json::json!({
                "all_centers": true,
                "center_ids": []
            }),
            Self::Centers(ids) => serde_json::json!({
                "all_centers": false,
                "center_ids": ids
            }),
        }
    }
}

/// Resolve which centers the actor may administer.
pub fn resolve_branch_scope(
    conn: &Connection,
    user_id: i64,
    org_id: i64,
    permissions: &[String],
    is_super_admin: bool,
) -> BranchScope {
    if is_super_admin || has_permission(permissions, "access-all-centers") || has_permission(permissions, "*")
    {
        return BranchScope::All;
    }

    let mut ids = load_user_center_ids(conn, user_id, org_id);
    if ids.is_empty() {
        if let Some(wl) = load_work_location_center_id(conn, user_id, org_id) {
            ids.push(wl);
        }
    }
    ids.sort_unstable();
    ids.dedup();
    BranchScope::Centers(ids)
}

pub fn load_user_center_ids(conn: &Connection, user_id: i64, org_id: i64) -> Vec<i64> {
    conn.prepare(
        "SELECT center_id FROM user_centers
         WHERE user_id = ?1 AND organization_id = ?2
         ORDER BY center_id",
    )
    .map(|stmt| {
        stmt.query_map(crate::params![user_id, org_id], |row| row.get_idx::<i64>(0))
    })
    .unwrap_or_default()
}

fn load_work_location_center_id(conn: &Connection, user_id: i64, org_id: i64) -> Option<i64> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT work_location FROM users
             WHERE id = ?1 AND organization_id = ?2 AND deleted_at IS NULL",
            crate::params![user_id, org_id],
            |r| r.get_idx::<Option<String>>(0),
        )
        .ok()
        .flatten();
    parse_center_id(raw.as_deref())
}

pub fn parse_center_id(raw: Option<&str>) -> Option<i64> {
    let s = raw?.trim();
    if s.is_empty() {
        return None;
    }
    s.parse::<i64>().ok().filter(|&id| id > 0)
}

/// Replace managed centers for a user (org-scoped). Invalid ids are skipped.
pub fn replace_user_centers(
    conn: &Connection,
    user_id: i64,
    org_id: i64,
    center_ids: &[i64],
) -> Result<(), String> {
    let _ = conn.execute(
        "DELETE FROM user_centers WHERE user_id = ?1 AND organization_id = ?2",
        crate::params![user_id, org_id],
    );
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    for &cid in center_ids {
        if cid <= 0 || !crate::tenant::center_in_organization(conn, cid, org_id) {
            continue;
        }
        conn.execute(
            "INSERT INTO user_centers (user_id, center_id, organization_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)
             ON CONFLICT(user_id, center_id) DO NOTHING",
            crate::params![user_id, cid, org_id, &now],
        )
        .map_err(|e| format!("Failed to assign branch: {e}"))?;
    }
    Ok(())
}

fn push_id_placeholders(ids: &[i64], params: &mut Vec<ParamValue>) -> String {
    let start = params.len() + 1;
    let ph = ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", start + i))
        .collect::<Vec<_>>()
        .join(", ");
    for id in ids {
        params.push(crate::db::into_param_value(*id));
    }
    ph
}

fn push_work_location_placeholders(ids: &[i64], params: &mut Vec<ParamValue>) -> String {
    let start = params.len() + 1;
    let ph = ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", start + i))
        .collect::<Vec<_>>()
        .join(", ");
    for id in ids {
        params.push(crate::db::into_param_value(id.to_string()));
    }
    ph
}

/// True if target employee belongs to a center in the actor's scope.
pub fn user_in_branch_scope(
    conn: &Connection,
    target_user_id: i64,
    org_id: i64,
    scope: &BranchScope,
) -> bool {
    match scope {
        BranchScope::All => true,
        BranchScope::Centers(ids) if ids.is_empty() => false,
        BranchScope::Centers(ids) => {
            let mut params: Vec<ParamValue> = vec![
                crate::db::into_param_value(target_user_id),
                crate::db::into_param_value(org_id),
            ];
            let wl_ph = push_work_location_placeholders(ids, &mut params);
            let dept_ph = push_id_placeholders(ids, &mut params);
            let uc_ph = push_id_placeholders(ids, &mut params);
            let sql = format!(
                "SELECT 1 FROM users u
                 LEFT JOIN departments d ON d.id = u.department_id AND d.organization_id = u.organization_id
                 WHERE u.id = ?1 AND u.organization_id = ?2 AND u.deleted_at IS NULL
                   AND (
                     TRIM(COALESCE(u.work_location, '')) IN ({wl_ph})
                     OR d.center_id IN ({dept_ph})
                     OR EXISTS (
                       SELECT 1 FROM user_centers uc
                       WHERE uc.user_id = u.id AND uc.organization_id = u.organization_id
                         AND uc.center_id IN ({uc_ph})
                     )
                   )
                 LIMIT 1"
            );
            conn.query_row(&sql, &params, |_| Ok(())).is_ok()
        }
    }
}

/// Append `AND (...)` so `users u` rows are limited to the branch scope.
pub fn append_users_branch_filter(
    sql: &mut String,
    params: &mut Vec<ParamValue>,
    scope: &BranchScope,
    user_alias: &str,
) {
    let BranchScope::Centers(ids) = scope else {
        return;
    };
    if ids.is_empty() {
        sql.push_str(" AND 1 = 0");
        return;
    }
    let wl_ph = push_work_location_placeholders(ids, params);
    let dept_ph = push_id_placeholders(ids, params);
    let uc_ph = push_id_placeholders(ids, params);
    sql.push_str(&format!(
        " AND (
            TRIM(COALESCE({user_alias}.work_location, '')) IN ({wl_ph})
            OR {user_alias}.department_id IN (
              SELECT d.id FROM departments d
              WHERE d.organization_id = {user_alias}.organization_id
                AND d.center_id IN ({dept_ph})
            )
            OR EXISTS (
              SELECT 1 FROM user_centers uc
              WHERE uc.user_id = {user_alias}.id
                AND uc.organization_id = {user_alias}.organization_id
                AND uc.center_id IN ({uc_ph})
            )
          )"
    ));
}

/// Filter centers / departments by id IN (...). Empty scope → `AND 1=0`.
pub fn append_center_id_filter(
    sql: &mut String,
    params: &mut Vec<ParamValue>,
    scope: &BranchScope,
    column: &str,
) {
    let BranchScope::Centers(ids) = scope else {
        return;
    };
    if ids.is_empty() {
        sql.push_str(" AND 1 = 0");
        return;
    }
    let start = params.len() + 1;
    let placeholders = ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", start + i))
        .collect::<Vec<_>>()
        .join(", ");
    for id in ids {
        params.push(crate::db::into_param_value(*id));
    }
    sql.push_str(&format!(" AND {column} IN ({placeholders})"));
}

/// Same as `append_users_branch_filter` but using positional `?` placeholders
/// (for handlers that build SQL with unnumbered binds).
pub fn push_users_branch_condition_qmark(
    conditions: &mut Vec<String>,
    params: &mut Vec<ParamValue>,
    scope: &BranchScope,
    user_alias: &str,
) {
    let BranchScope::Centers(ids) = scope else {
        return;
    };
    if ids.is_empty() {
        conditions.push("1 = 0".to_string());
        return;
    }
    let wl_ph = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let id_ph = wl_ph.clone();
    for id in ids {
        params.push(crate::db::into_param_value(id.to_string()));
    }
    for id in ids {
        params.push(crate::db::into_param_value(*id));
    }
    for id in ids {
        params.push(crate::db::into_param_value(*id));
    }
    conditions.push(format!(
        "(
            TRIM(COALESCE({user_alias}.work_location, '')) IN ({wl_ph})
            OR {user_alias}.department_id IN (
              SELECT d.id FROM departments d
              WHERE d.organization_id = {user_alias}.organization_id
                AND d.center_id IN ({id_ph})
            )
            OR EXISTS (
              SELECT 1 FROM user_centers uc
              WHERE uc.user_id = {user_alias}.id
                AND uc.organization_id = {user_alias}.organization_id
                AND uc.center_id IN ({id_ph})
            )
          )"
    ));
}

/// Resolve branch scope for the authenticated JWT subject.
pub fn actor_branch_scope_from_claims(
    conn: &Connection,
    claims: &crate::models::user::JwtClaims,
) -> BranchScope {
    let org_id = crate::tenant::org_id_from_claims(claims);
    let is_sa = crate::tenant::user_is_super_admin(conn, claims.sub, org_id);
    let (permissions, _) = crate::plan_limits::resolve_effective_permissions(
        conn,
        org_id,
        crate::middleware::rbac::load_user_permissions(conn, claims.sub, is_sa),
    );
    resolve_branch_scope(conn, claims.sub, org_id, &permissions, is_sa)
}

pub fn forbidden_outside_branch() -> actix_web::HttpResponse {
    actix_web::HttpResponse::Forbidden().json(crate::models::ApiError::new(
        "This record is outside your assigned branch scope",
    ))
}

/// True if target is in scope; otherwise returns the standard 403 response.
pub fn require_user_in_scope(
    conn: &Connection,
    target_user_id: i64,
    org_id: i64,
    scope: &BranchScope,
) -> Result<(), actix_web::HttpResponse> {
    if user_in_branch_scope(conn, target_user_id, org_id, scope) {
        Ok(())
    } else {
        Err(forbidden_outside_branch())
    }
}

/// Ensure requested center is writable under the actor's scope.
pub fn ensure_center_allowed(scope: &BranchScope, center_id: Option<i64>) -> Result<(), actix_web::HttpResponse> {
    match center_id {
        None => Ok(()),
        Some(cid) if scope.allows_center(cid) => Ok(()),
        Some(_) => Err(forbidden_outside_branch()),
    }
}
