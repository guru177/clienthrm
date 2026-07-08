//! HMAC-SHA256 hashing for OTPs and reset tokens (replaces legacy 64-bit FNV).

use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

fn pepper() -> String {
    std::env::var("JWT_SECRET").unwrap_or_else(|_| "hrm-otp-pepper".into())
}

/// HMAC-SHA256 hex digest of `value` keyed with JWT_SECRET pepper.
pub fn hash_secret(value: &str) -> String {
    let mut mac =
        HmacSha256::new_from_slice(pepper().as_bytes()).expect("HMAC accepts any key length");
    mac.update(value.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// Cryptographically secure 6-digit OTP.
pub fn generate_otp() -> String {
    let mut bytes = [0u8; 4];
    if getrandom::getrandom(&mut bytes).is_err() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u32)
            .unwrap_or(0);
        bytes = now.to_be_bytes();
    }
    let n = u32::from_be_bytes(bytes) % 1_000_000;
    format!("{n:06}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_is_deterministic_and_hex() {
        let h1 = hash_secret("123456");
        let h2 = hash_secret("123456");
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 64);
        assert!(h1.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn otp_is_six_digits() {
        let otp = generate_otp();
        assert_eq!(otp.len(), 6);
        assert!(otp.chars().all(|c| c.is_ascii_digit()));
    }
}
