use std::path::{Path, PathBuf};

use crate::object_storage;

const MAX_PHOTO_BYTES: usize = 2 * 1024 * 1024;
const MAX_ANNOUNCEMENT_BANNER_BYTES: usize = 5 * 1024 * 1024;

/// Write bytes to local STORAGE_PATH and, when configured, to S3.
fn write_stored_bytes(relative: &str, data: &[u8], content_type: &str) -> Result<(), String> {
    let relative = normalize_relative_path(relative).ok_or_else(|| "Invalid path".to_string())?;
    let full = storage_root().join(&relative);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&full, data).map_err(|e| e.to_string())?;

    if let Err(e) = object_storage::put_object(&relative, data, content_type) {
        let _ = std::fs::remove_file(&full);
        return Err(e);
    }
    Ok(())
}

/// Read bytes from local disk, or from S3 (caching locally) when missing.
pub fn read_stored_bytes(relative: &str) -> Result<Vec<u8>, String> {
    let relative = normalize_relative_path(relative).ok_or_else(|| "Invalid path".to_string())?;

    let full = storage_root().join(&relative);
    if full.is_file() {
        return std::fs::read(&full).map_err(|e| e.to_string());
    }

    match object_storage::get_object(&relative)? {
        Some(bytes) => {
            if let Some(parent) = full.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(&full, &bytes);
            Ok(bytes)
        }
        None => Err("File not found".into()),
    }
}

fn content_type_for_relative(relative: &str) -> &'static str {
    mime_for_path(Path::new(relative))
}

pub fn storage_root() -> PathBuf {
    PathBuf::from(
        std::env::var("STORAGE_PATH").unwrap_or_else(|_| "../storage".to_string()),
    )
}

fn extension_from_mime(mime: Option<&str>) -> &'static str {
    match mime {
        Some("image/png") => "png",
        Some("image/gif") => "gif",
        Some("image/webp") => "webp",
        _ => "jpg",
    }
}

fn extension_from_filename(name: Option<&str>) -> &'static str {
    name.and_then(|n| Path::new(n).extension())
        .and_then(|e| e.to_str())
        .map(|e| match e.to_ascii_lowercase().as_str() {
            "png" => "png",
            "gif" => "gif",
            "webp" => "webp",
            "jpeg" | "jpg" => "jpg",
            _ => "jpg",
        })
        .unwrap_or("jpg")
}

/// Save user profile photo; returns DB path like `users/<uuid>.jpg`.
pub fn save_user_photo(
    data: &[u8],
    content_type: Option<&str>,
    filename: Option<&str>,
) -> Result<String, String> {
    if data.is_empty() {
        return Err("Empty file".into());
    }
    if data.len() > MAX_PHOTO_BYTES {
        return Err("Photo must be less than 2MB".into());
    }

    let ext = if content_type.is_some() {
        extension_from_mime(content_type)
    } else {
        extension_from_filename(filename)
    };

    let relative = format!("users/{}.{}", uuid::Uuid::new_v4(), ext);
    write_stored_bytes(&relative, data, content_type_for_relative(&relative))?;
    Ok(relative)
}

/// Normalize a storage path from DB or URL to a safe relative path.
pub fn normalize_relative_path(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.contains("..") {
        return None;
    }
    let path = trimmed
        .strip_prefix("/storage/")
        .or_else(|| trimmed.strip_prefix("storage/"))
        .unwrap_or(trimmed)
        .trim_start_matches('/');
    if path.is_empty() || path.contains("..") {
        None
    } else {
        Some(path.to_string())
    }
}

/// True when the path refers to a stored user profile photo (`users/<uuid>.ext`).
pub fn is_user_profile_photo(relative: &str) -> bool {
    normalize_relative_path(relative)
        .map(|p| p.starts_with("users/"))
        .unwrap_or(false)
}

const DEFAULT_PROFILE_AVATAR_SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#e2e8f0"/><circle cx="32" cy="24" r="11" fill="#94a3b8"/><ellipse cx="32" cy="56" rx="18" ry="14" fill="#94a3b8"/></svg>"##;

/// Neutral SVG avatar returned when a profile photo path exists in DB but file is missing.
pub fn default_profile_avatar_svg() -> &'static [u8] {
    DEFAULT_PROFILE_AVATAR_SVG.as_bytes()
}

/// Resolve a relative storage path to an absolute file on disk (blocks traversal).
pub fn resolve_storage_file(relative: &str) -> Result<std::path::PathBuf, String> {
    let relative = normalize_relative_path(relative).ok_or_else(|| "Invalid path".to_string())?;
    let root = storage_root()
        .canonicalize()
        .map_err(|e| format!("Storage unavailable: {e}"))?;
    let full = root.join(&relative);
    let canonical = full.canonicalize().map_err(|_| "File not found".to_string())?;
    if !canonical.starts_with(&root) {
        return Err("Invalid path".into());
    }
    Ok(canonical)
}

/// Check whether an authenticated org member may read this file.
pub fn can_access_storage_file(
    conn: &crate::db::Connection,
    org_id: i64,
    user_id: i64,
    relative: &str,
) -> bool {
    let Some(relative) = normalize_relative_path(relative) else {
        return false;
    };
    let legacy = format!("/storage/{relative}");
    let legacy2 = relative.clone();

    if relative.starts_with("chat/") {
        return conn
            .query_row(
                "SELECT 1 FROM chat_message_attachments a
                 INNER JOIN users u ON u.id = a.uploaded_by AND u.organization_id = ?2
                 WHERE (a.file_url = ?1 OR a.file_url = ?3 OR a.file_url = ?4)
                   AND (
                     (a.message_id IS NULL AND a.uploaded_by = ?5)
                     OR EXISTS (
                       SELECT 1 FROM chat_messages m
                       INNER JOIN chat_space_members csm
                         ON csm.space_id = m.space_id AND csm.user_id = ?5
                       WHERE m.id = a.message_id AND m.organization_id = ?2
                     )
                   )
                 LIMIT 1",
                crate::params![&relative, org_id, &legacy, &legacy2, user_id],
                |_| Ok(()),
            )
            .is_ok();
    }

    if relative.starts_with("users/") {
        return conn
            .query_row(
                "SELECT 1 FROM users
                 WHERE organization_id = ?2 AND deleted_at IS NULL
                   AND (photo = ?1 OR photo = ?3 OR avatar = ?1 OR avatar = ?3)
                 LIMIT 1",
                crate::params![&relative, org_id, &legacy],
                |_| Ok(()),
            )
            .is_ok();
    }

    if relative.starts_with("user-docs/") {
        // Identity documents (Aadhaar, PAN, etc.) are private:
        // - The owning employee can always read their own files
        // - HR / admins with view-users or edit-users can read any doc in the org
        // - Super-admins bypass entirely
        // Anyone else gets 403.
        let owner_matches: bool = conn
            .query_row(
                "SELECT 1 FROM users
                 WHERE organization_id = ?2 AND id = ?5 AND deleted_at IS NULL
                   AND (
                     doc_aadhaar = ?1 OR doc_aadhaar = ?3 OR doc_aadhaar = ?4
                     OR doc_pan = ?1 OR doc_pan = ?3 OR doc_pan = ?4
                     OR doc_id_proof = ?1 OR doc_id_proof = ?3 OR doc_id_proof = ?4
                     OR doc_other = ?1 OR doc_other = ?3 OR doc_other = ?4
                   )
                 LIMIT 1",
                crate::params![&relative, org_id, &legacy, &legacy2, user_id],
                |_| Ok(()),
            )
            .is_ok();
        if owner_matches {
            return true;
        }
        let is_super_admin = crate::tenant::user_is_super_admin(conn, user_id, org_id);
        if is_super_admin {
            let doc_belongs_to_org: bool = conn
                .query_row(
                    "SELECT 1 FROM users
                     WHERE organization_id = ?2 AND deleted_at IS NULL
                       AND (
                         doc_aadhaar = ?1 OR doc_aadhaar = ?3 OR doc_aadhaar = ?4
                         OR doc_pan = ?1 OR doc_pan = ?3 OR doc_pan = ?4
                         OR doc_id_proof = ?1 OR doc_id_proof = ?3 OR doc_id_proof = ?4
                         OR doc_other = ?1 OR doc_other = ?3 OR doc_other = ?4
                       )
                     LIMIT 1",
                    crate::params![&relative, org_id, &legacy, &legacy2],
                    |_| Ok(()),
                )
                .is_ok();
            return doc_belongs_to_org;
        }
        let perms = crate::middleware::rbac::load_user_permissions(conn, user_id, false);
        if !crate::middleware::rbac::has_permission(&perms, "view-users")
            && !crate::middleware::rbac::has_permission(&perms, "edit-users")
        {
            return false;
        }
        return conn
            .query_row(
                "SELECT 1 FROM users
                 WHERE organization_id = ?2 AND deleted_at IS NULL
                   AND (
                     doc_aadhaar = ?1 OR doc_aadhaar = ?3 OR doc_aadhaar = ?4
                     OR doc_pan = ?1 OR doc_pan = ?3 OR doc_pan = ?4
                     OR doc_id_proof = ?1 OR doc_id_proof = ?3 OR doc_id_proof = ?4
                     OR doc_other = ?1 OR doc_other = ?3 OR doc_other = ?4
                   )
                 LIMIT 1",
                crate::params![&relative, org_id, &legacy, &legacy2],
                |_| Ok(()),
            )
            .is_ok();
    }

    if relative.starts_with("announcements/") {
        return conn
            .query_row(
                "SELECT 1 FROM platform_announcements
                 WHERE published = 1
                   AND (image_url = ?1 OR image_url = ?3 OR image_url = ?4)
                   AND (organization_id IS NULL OR organization_id = ?2)
                 LIMIT 1",
                crate::params![&relative, org_id, &legacy, &legacy2],
                |_| Ok(()),
            )
            .is_ok();
    }

    if relative.starts_with("org-notifications/") {
        return conn
            .query_row(
                "SELECT 1 FROM org_notifications
                 WHERE organization_id = ?2
                   AND (image_url = ?1 OR image_url = ?3 OR image_url = ?4)
                 LIMIT 1",
                crate::params![&relative, org_id, &legacy, &legacy2],
                |_| Ok(()),
            )
            .is_ok();
    }

    if relative.starts_with("doctor-reports/") {
        // Allow access if the user is the employee subject, the doctor author, or super-admin
        return conn
            .query_row(
                "SELECT 1 FROM doctor_reports
                 WHERE organization_id = ?2
                   AND (prescription_path = ?1 OR prescription_path = ?3 OR prescription_path = ?4)
                   AND (employee_user_id = ?5 OR doctor_user_id = ?5)
                 LIMIT 1",
                crate::params![&relative, org_id, &legacy, &legacy2, user_id],
                |_| Ok(()),
            )
            .is_ok();
    }

    conn.query_row(
        "SELECT 1 FROM app_settings
         WHERE organization_id = ?2 AND value LIKE '%' || ?1 || '%'
         LIMIT 1",
        crate::params![&relative, org_id],
        |_| Ok(()),
    )
    .is_ok()
}

pub fn delete_photo_path(relative: &str) {
    let Some(relative) = normalize_relative_path(relative) else {
        return;
    };
    let full = storage_root().join(&relative);
    let _ = std::fs::remove_file(full);
    let _ = object_storage::delete_object(&relative);
}

pub fn mime_for_path(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()) {
        Some(ref ext) if ext == "png" => "image/png",
        Some(ref ext) if ext == "gif" => "image/gif",
        Some(ref ext) if ext == "webp" => "image/webp",
        Some(ref ext) if ext == "jpg" || ext == "jpeg" => "image/jpeg",
        Some(ref ext) if ext == "pdf" => "application/pdf",
        Some(ref ext) if ext == "txt" => "text/plain",
        Some(ref ext) if ext == "yml" || ext == "yaml" => "text/yaml",
        Some(ref ext) if ext == "svg" => "image/svg+xml",
        Some(ref ext) if ext == "mp4" => "video/mp4",
        Some(ref ext) if ext == "mp3" => "audio/mpeg",
        _ => "application/octet-stream",
    }
}

const MAX_CHAT_FILE_BYTES: usize = 10 * 1024 * 1024;

fn chat_extension(filename: Option<&str>, mime: Option<&str>) -> String {
    if let Some(name) = filename.and_then(|n| Path::new(n).extension()?.to_str()) {
        let ext = name.to_ascii_lowercase();
        if !ext.is_empty() && ext.len() <= 8 {
            return ext;
        }
    }
    match mime {
        Some("image/png") => "png".to_string(),
        Some("image/gif") => "gif".to_string(),
        Some("image/webp") => "webp".to_string(),
        Some("image/jpeg") | Some("image/jpg") => "jpg".to_string(),
        Some("application/pdf") => "pdf".to_string(),
        Some("text/plain") => "txt".to_string(),
        _ => "bin".to_string(),
    }
}

fn is_image_mime(mime: Option<&str>) -> bool {
    matches!(
        mime,
        Some("image/png") | Some("image/jpeg") | Some("image/jpg") | Some("image/gif") | Some("image/webp")
    )
}

fn is_image_filename(name: Option<&str>) -> bool {
    name.and_then(|n| Path::new(n).extension()?.to_str())
        .map(|e| matches!(e.to_ascii_lowercase().as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp"))
        .unwrap_or(false)
}

/// Save announcement banner; returns DB path like `announcements/<uuid>.ext`.
pub fn save_announcement_banner(
    data: &[u8],
    content_type: Option<&str>,
    filename: Option<&str>,
) -> Result<String, String> {
    save_image_banner("announcements", data, content_type, filename)
}

/// Save org notification banner; returns DB path like `org-notifications/<uuid>.ext`.
pub fn save_org_notification_banner(
    data: &[u8],
    content_type: Option<&str>,
    filename: Option<&str>,
) -> Result<String, String> {
    save_image_banner("org-notifications", data, content_type, filename)
}

fn save_image_banner(
    prefix: &str,
    data: &[u8],
    content_type: Option<&str>,
    filename: Option<&str>,
) -> Result<String, String> {
    if data.is_empty() {
        return Err("Empty file".into());
    }
    if data.len() > MAX_ANNOUNCEMENT_BANNER_BYTES {
        return Err("Banner must be less than 5MB".into());
    }
    if !is_image_mime(content_type) && !is_image_filename(filename) {
        return Err("Banner must be PNG, JPG, GIF, or WebP".into());
    }

    let ext = if content_type.is_some() {
        extension_from_mime(content_type)
    } else {
        extension_from_filename(filename)
    };

    let relative = format!("{prefix}/{}.{}", uuid::Uuid::new_v4(), ext);
    write_stored_bytes(&relative, data, content_type_for_relative(&relative))?;
    Ok(relative)
}

pub fn is_announcement_banner(relative: &str) -> bool {
    normalize_relative_path(relative)
        .map(|p| p.starts_with("announcements/"))
        .unwrap_or(false)
}

pub fn is_org_notification_banner(relative: &str) -> bool {
    normalize_relative_path(relative)
        .map(|p| p.starts_with("org-notifications/"))
        .unwrap_or(false)
}

const MAX_DOCTOR_REPORT_FILE_BYTES: usize = 10 * 1024 * 1024;

fn doctor_report_extension(filename: Option<&str>, mime: Option<&str>) -> &'static str {
    if let Some(name) = filename.and_then(|n| std::path::Path::new(n).extension()?.to_str()) {
        match name.to_ascii_lowercase().as_str() {
            "pdf" => return "pdf",
            "png" => return "png",
            "jpg" | "jpeg" => return "jpg",
            _ => {}
        }
    }
    match mime {
        Some("application/pdf") => "pdf",
        Some("image/png") => "png",
        Some("image/jpeg") | Some("image/jpg") => "jpg",
        _ => "pdf",
    }
}

/// Save doctor report prescription file; returns DB path like `doctor-reports/<uuid>.ext`.
pub fn save_doctor_report_file(
    data: &[u8],
    content_type: Option<&str>,
    filename: Option<&str>,
) -> Result<String, String> {
    if data.is_empty() {
        return Err("Empty file".into());
    }
    if data.len() > MAX_DOCTOR_REPORT_FILE_BYTES {
        return Err("File must be less than 10MB".into());
    }
    let ext = doctor_report_extension(filename, content_type);
    let relative = format!("doctor-reports/{}.{}", uuid::Uuid::new_v4(), ext);
    write_stored_bytes(&relative, data, content_type_for_relative(&relative))?;
    Ok(relative)
}

const MAX_USER_DOC_BYTES: usize = 10 * 1024 * 1024;

/// Save an employee identity/HR document; returns `user-docs/<uuid>.ext`.
pub fn save_user_document(
    data: &[u8],
    content_type: Option<&str>,
    filename: Option<&str>,
) -> Result<String, String> {
    if data.is_empty() {
        return Err("Empty file".into());
    }
    if data.len() > MAX_USER_DOC_BYTES {
        return Err("Document must be less than 10MB".into());
    }
    let ext = doctor_report_extension(filename, content_type);
    let relative = format!("user-docs/{}.{}", uuid::Uuid::new_v4(), ext);
    write_stored_bytes(&relative, data, content_type_for_relative(&relative))?;
    Ok(relative)
}

/// Save chat attachment; returns DB path like `chat/<uuid>.ext`.
pub fn save_chat_file(
    data: &[u8],
    content_type: Option<&str>,
    filename: Option<&str>,
) -> Result<String, String> {
    if data.is_empty() {
        return Err("Empty file".into());
    }
    if data.len() > MAX_CHAT_FILE_BYTES {
        return Err("File must be less than 10MB".into());
    }

    let ext = chat_extension(filename, content_type);
    let relative = format!("chat/{}.{}", uuid::Uuid::new_v4(), ext);
    write_stored_bytes(&relative, data, content_type_for_relative(&relative))?;
    Ok(relative)
}

#[cfg(test)]
mod path_authz_tests {
    use super::*;

    #[test]
    fn normalize_rejects_traversal() {
        assert!(normalize_relative_path("../etc/passwd").is_none());
        assert!(normalize_relative_path("users/../secret").is_none());
        assert!(normalize_relative_path("").is_none());
        assert!(normalize_relative_path("   ").is_none());
    }

    #[test]
    fn normalize_accepts_safe_paths() {
        assert_eq!(
            normalize_relative_path("users/abc.jpg").as_deref(),
            Some("users/abc.jpg")
        );
        assert_eq!(
            normalize_relative_path("/storage/chat/file.pdf").as_deref(),
            Some("chat/file.pdf")
        );
        assert_eq!(
            normalize_relative_path("storage/announcements/b.png").as_deref(),
            Some("announcements/b.png")
        );
    }

    #[test]
    fn profile_and_banner_path_helpers() {
        assert!(is_user_profile_photo("users/photo.jpg"));
        assert!(!is_user_profile_photo("chat/photo.jpg"));
        assert!(is_org_notification_banner("org-notifications/a.png"));
    }

    #[test]
    fn mime_for_common_extensions() {
        assert_eq!(mime_for_path(Path::new("a.png")), "image/png");
        assert_eq!(mime_for_path(Path::new("a.pdf")), "application/pdf");
        assert_eq!(mime_for_path(Path::new("a.unknown")), "application/octet-stream");
    }
}
