use actix_web::HttpRequest;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

struct Bucket {
    count: u32,
    window_start: Instant,
}

static BUCKETS: Mutex<Option<HashMap<String, Bucket>>> = Mutex::new(None);

fn buckets() -> std::sync::MutexGuard<'static, Option<HashMap<String, Bucket>>> {
    let mut guard = BUCKETS.lock().unwrap();
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
    guard
}

/// Returns client IP, honoring X-Forwarded-For from reverse proxies.
pub fn client_ip(req: &HttpRequest) -> String {
    req.headers()
        .get("X-Forwarded-For")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| req.peer_addr().map(|a| a.ip().to_string()))
        .unwrap_or_else(|| "unknown".to_string())
}

/// Sliding-window rate limit. Returns `Err(message)` when limit exceeded.
pub fn check_rate_limit(key: &str, max_attempts: u32, window_secs: u64) -> Result<(), String> {
    let window = Duration::from_secs(window_secs);
    let now = Instant::now();

    let mut guard = buckets();
    let map = guard.as_mut().unwrap();

    let bucket = map.entry(key.to_string()).or_insert(Bucket {
        count: 0,
        window_start: now,
    });

    if now.duration_since(bucket.window_start) >= window {
        bucket.count = 0;
        bucket.window_start = now;
    }

    bucket.count += 1;
    if bucket.count > max_attempts {
        return Err(format!(
            "Too many attempts. Try again in {} seconds.",
            window_secs
        ));
    }
    Ok(())
}

pub fn limit_auth_login(req: &HttpRequest, email: &str) -> Result<(), String> {
    let ip = client_ip(req);
    let key = format!("login:{ip}:{}", email.trim().to_lowercase());
    check_rate_limit(&key, 20, 900)
}

pub fn limit_auth_refresh(req: &HttpRequest) -> Result<(), String> {
    let ip = client_ip(req);
    check_rate_limit(&format!("refresh:{ip}"), 30, 900)
}

pub fn limit_public_signup(req: &HttpRequest) -> Result<(), String> {
    let ip = client_ip(req);
    check_rate_limit(&format!("signup:{ip}"), 5, 3600)
}

pub fn limit_signup_otp_send(req: &HttpRequest, destination: &str) -> Result<(), String> {
    let ip = client_ip(req);
    let dest = destination.trim().to_lowercase();
    check_rate_limit(&format!("signup-otp:{ip}:{dest}"), 5, 900)
}

pub fn limit_platform_login(req: &HttpRequest, email: &str) -> Result<(), String> {
    let ip = client_ip(req);
    let key = format!("platform-login:{ip}:{}", email.trim().to_lowercase());
    check_rate_limit(&key, 10, 900)
}
