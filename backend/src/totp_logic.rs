//! Shared TOTP helpers for platform and tenant 2FA.

use totp_rs::{Algorithm, Secret, TOTP};

pub const TOTP_ISSUER: &str = "Raintech HRM";

pub fn build_totp(secret_bytes: Vec<u8>, issuer: &str, account: &str) -> Result<TOTP, String> {
    TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        secret_bytes,
        Some(issuer.to_string()),
        account.to_string(),
    )
    .map_err(|e| format!("totp init failed: {e}"))
}

pub fn verify_totp_code(secret_b32: &str, code: &str, issuer: &str, account: &str) -> bool {
    let secret = match Secret::Encoded(secret_b32.to_string()).to_bytes() {
        Ok(b) => b,
        Err(_) => return false,
    };
    let totp = match build_totp(secret, issuer, account) {
        Ok(t) => t,
        Err(_) => return false,
    };
    totp.check_current(code).unwrap_or(false)
}

pub fn new_totp_secret() -> Result<String, String> {
    let secret = Secret::default();
    match secret.to_encoded() {
        Secret::Encoded(s) => Ok(s),
        _ => Err("Failed to encode TOTP secret".into()),
    }
}

pub fn otpauth_url(secret_b32: &str, account: &str) -> Result<String, String> {
    let bytes = Secret::Encoded(secret_b32.to_string())
        .to_bytes()
        .map_err(|e| e.to_string())?;
    let totp = build_totp(bytes, TOTP_ISSUER, account)?;
    Ok(totp.get_url())
}

pub fn qr_svg_for_url(url: &str) -> Result<String, String> {
    use qrcode::render::svg;
    use qrcode::QrCode;
    let code = QrCode::new(url.as_bytes()).map_err(|e| format!("qr encode: {e}"))?;
    Ok(code
        .render()
        .min_dimensions(200, 200)
        .dark_color(svg::Color("#000000"))
        .light_color(svg::Color("#ffffff"))
        .build())
}
