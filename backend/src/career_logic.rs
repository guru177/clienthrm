//! Careers / job postings — legacy Laravel schema (slug, job_type, etc.).

use crate::db::{Connection, Row};
use serde_json::Value;

use crate::tenant;

pub fn json_list_to_db(value: &Option<Value>) -> Option<String> {
    match value {
        None => None,
        Some(Value::Array(arr)) if arr.is_empty() => None,
        Some(Value::Array(_)) | Some(Value::Object(_)) => serde_json::to_string(value).ok(),
        Some(Value::String(s)) if s.trim().is_empty() => None,
        Some(Value::String(s)) => Some(s.clone()),
        Some(other) => serde_json::to_string(other).ok(),
    }
}

pub fn db_to_json_list(raw: Option<String>) -> Option<Value> {
    let s = raw?;
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with('[') || trimmed.starts_with('{') {
        return serde_json::from_str(trimmed).ok();
    }
    Some(Value::String(s))
}

pub fn unique_career_slug(
    conn: &Connection,
    title: &str,
    org_id: i64,
    exclude_id: Option<i64>,
) -> String {
    let base = tenant::normalize_org_slug(title);
    let base = if base.is_empty() {
        "job".to_string()
    } else {
        base
    };
    let mut slug = base.clone();
    let mut n = 0u32;
    loop {
        let taken: bool = conn
            .query_row(
                "SELECT 1 FROM careers WHERE organization_id = ?1 AND slug = ?2
                 AND (?3 IS NULL OR id != ?3)",
                crate::params![org_id, slug, exclude_id],
                |_| Ok(()),
            )
            .is_ok();
        if !taken {
            return slug;
        }
        n += 1;
        slug = format!("{base}-{n}");
    }
}

pub fn career_from_row(row: &Row) -> crate::db::Result<serde_json::Value> {
    let requirements_raw: Option<String> = row.get("requirements").ok();
    let responsibilities_raw: Option<String> = row.get("responsibilities").ok();
    let is_active: bool = row
        .get::<Option<i64>>("is_active")
        .ok()
        .flatten()
        .map(|v| v != 0)
        .or_else(|| row.get::<Option<bool>>("is_active").ok().flatten())
        .unwrap_or(true);

    Ok(serde_json::json!({
        "id": row.get::<i64>("id")?,
        "title": row.get::<String>("title")?,
        "slug": row.get::<String>("slug").unwrap_or_default(),
        "location": row.get::<Option<String>>("location")?,
        "job_type": row.get::<Option<String>>("job_type")?.unwrap_or_else(|| "full-time".to_string()),
        "employment_type": row.get::<Option<String>>("job_type")?.unwrap_or_else(|| "full-time".to_string()),
        "experience_required": row.get::<Option<String>>("experience_required")?,
        "description": row.get::<Option<String>>("description")?,
        "requirements": db_to_json_list(requirements_raw),
        "responsibilities": db_to_json_list(responsibilities_raw),
        "salary_range": row.get::<Option<String>>("salary_range")?,
        "is_active": is_active,
        "posted_at": row.get::<Option<String>>("posted_at")?,
        "created_at": row.get::<Option<String>>("created_at")?,
        "updated_at": row.get::<Option<String>>("updated_at")?,
    }))
}

pub const CAREER_COLUMNS: &str = "id, title, slug, location, job_type, experience_required, description, requirements, responsibilities, salary_range, is_active, posted_at, created_at, updated_at";
