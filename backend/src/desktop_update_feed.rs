//! Publish Raintech HRM desktop installers for electron-updater (generic provider).

use sha2::{Digest, Sha512};
use std::fs;
use std::path::{Path, PathBuf};

const PRODUCT_NAME: &str = "Raintech HRM";
const MAX_INSTALLER_BYTES: usize = 512 * 1024 * 1024;

pub fn desktop_updates_dir() -> PathBuf {
    crate::storage::storage_root().join("desktop-updates")
}

pub fn installer_filename(version: &str) -> String {
    format!("{PRODUCT_NAME}-Setup-{version}.exe")
}

fn sha512_base64(data: &[u8]) -> String {
    let digest = Sha512::digest(data);
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(digest)
}

fn write_latest_yml(installer_name: &str, version: &str, sha512: &str, size: u64) -> Result<(), String> {
    let release_date = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S.000Z");
    let yml = format!(
        "version: {version}\nfiles:\n  - url: {installer_name}\n    sha512: {sha512}\n    size: {size}\npath: {installer_name}\nsha512: {sha512}\nreleaseDate: '{release_date}'\n"
    );
    let path = desktop_updates_dir().join("latest.yml");
    fs::write(&path, yml).map_err(|e| format!("Could not write latest.yml: {e}"))
}

/// Save installer bytes to storage/desktop-updates/ (does not activate feed).
pub fn save_desktop_installer(
    version: &str,
    data: &[u8],
    original_name: Option<&str>,
) -> Result<String, String> {
    let version = version.trim();
    if version.is_empty() {
        return Err("Version is required".into());
    }
    if data.is_empty() {
        return Err("Installer file is empty".into());
    }
    if data.len() > MAX_INSTALLER_BYTES {
        return Err("Installer exceeds 512 MB limit".into());
    }

    let ext = original_name
        .and_then(|n| Path::new(n).extension())
        .and_then(|e| e.to_str())
        .unwrap_or("exe")
        .to_ascii_lowercase();
    if ext != "exe" {
        return Err("Desktop installer must be a .exe file".into());
    }

    fs::create_dir_all(desktop_updates_dir())
        .map_err(|e| format!("Could not create desktop-updates folder: {e}"))?;

    let installer_name = installer_filename(version);
    let installer_path = desktop_updates_dir().join(&installer_name);
    fs::write(&installer_path, data).map_err(|e| format!("Could not save installer: {e}"))?;

    Ok(installer_name)
}

/// Rebuild latest.yml from an existing installer on disk (e.g. after publish without re-upload).
pub fn refresh_latest_yml_from_installer(version: &str, installer_name: &str) -> Result<(), String> {
    let path = desktop_updates_dir().join(installer_name);
    if !path.is_file() {
        return Err(format!("Installer not found: {installer_name}"));
    }
    let data = fs::read(&path).map_err(|e| format!("Could not read installer: {e}"))?;
    let hash = sha512_base64(&data);
    write_latest_yml(installer_name, version, &hash, data.len() as u64)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct LiveDesktopFeed {
    pub version: Option<String>,
    pub installer: Option<String>,
    pub release_date: Option<String>,
}

/// Parse storage/desktop-updates/latest.yml for the version Electron apps receive today.
pub fn read_live_desktop_feed() -> LiveDesktopFeed {
    let path = desktop_updates_dir().join("latest.yml");
    let Ok(raw) = fs::read_to_string(&path) else {
        return LiveDesktopFeed {
            version: None,
            installer: None,
            release_date: None,
        };
    };
    let mut version = None;
    let mut installer = None;
    let mut release_date = None;
    for line in raw.lines() {
        let line = line.trim();
        if let Some(v) = line.strip_prefix("version:") {
            version = Some(v.trim().to_string());
        } else if let Some(v) = line.strip_prefix("path:") {
            installer = Some(v.trim().to_string());
        } else if let Some(v) = line.strip_prefix("releaseDate:") {
            release_date = Some(v.trim().trim_matches('\'').to_string());
        }
    }
    LiveDesktopFeed {
        version,
        installer,
        release_date,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installer_name_matches_electron_builder() {
        assert_eq!(
            installer_filename("1.2.0"),
            "Raintech HRM-Setup-1.2.0.exe"
        );
    }
}
