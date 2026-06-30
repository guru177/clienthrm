use std::path::{Path, PathBuf};

const MAX_PHOTO_BYTES: usize = 2 * 1024 * 1024;
const MAX_ANNOUNCEMENT_BANNER_BYTES: usize = 5 * 1024 * 1024;

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
    let full = storage_root().join(&relative);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&full, data).map_err(|e| e.to_string())?;
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
    if relative.is_empty() || relative.contains("..") {
        return;
    }
    let full = storage_root().join(relative);
    let _ = std::fs::remove_file(full);
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
    let full = storage_root().join(&relative);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&full, data).map_err(|e| e.to_string())?;
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
    let full = storage_root().join(&relative);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&full, data).map_err(|e| e.to_string())?;
    Ok(relative)
}
