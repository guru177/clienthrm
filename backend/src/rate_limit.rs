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

fn trust_proxy() -> bool {
    std::env::var("TRUST_PROXY")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

/// Returns client IP. Honors X-Forwarded-For only when TRUST_PROXY=1 (behind Caddy/nginx).
pub fn client_ip(req: &HttpRequest) -> String {
    if trust_proxy() {
        if let Some(ip) = req
            .headers()
            .get("X-Forwarded-For")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.split(',').next())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
        {
            return ip;
        }
    }
    req.peer_addr()
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Sliding-window rate limit. Uses Redis when `REDIS_URL` is set (multi-replica safe).
pub fn check_rate_limit(key: &str, max_attempts: u32, window_secs: u64) -> Result<(), String> {
    if let Some(url) = std::env::var("REDIS_URL").ok().filter(|s| !s.trim().is_empty()) {
        if let Err(e) = check_rate_limit_redis(&url, key, max_attempts, window_secs) {
            log::warn!("Redis rate limit fallback to memory: {e}");
        } else {
            return Ok(());
        }
    }
    check_rate_limit_memory(key, max_attempts, window_secs)
}

fn check_rate_limit_redis(
    url: &str,
    key: &str,
    max_attempts: u32,
    window_secs: u64,
) -> Result<(), String> {
    let client = redis::Client::open(url).map_err(|e| e.to_string())?;
    let mut conn = client
        .get_connection()
        .map_err(|e| e.to_string())?;
    let redis_key = format!("hrm:rl:{key}");
    let count: u32 = redis::cmd("INCR")
        .arg(&redis_key)
        .query(&mut conn)
        .map_err(|e| e.to_string())?;
    if count == 1 {
        let _: () = redis::cmd("EXPIRE")
            .arg(&redis_key)
            .arg(window_secs)
            .query(&mut conn)
            .map_err(|e| e.to_string())?;
    }
    if count > max_attempts {
        return Err(format!(
            "Too many attempts. Try again in {} seconds.",
            window_secs
        ));
    }
    Ok(())
}

fn check_rate_limit_memory(key: &str, max_attempts: u32, window_secs: u64) -> Result<(), String> {
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

fn auth_login_max_attempts() -> u32 {
    std::env::var("HRM_AUTH_LOGIN_MAX")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(if cfg!(debug_assertions) { 200 } else { 20 })
}

pub fn limit_auth_login(req: &HttpRequest, email: &str) -> Result<(), String> {
    let ip = client_ip(req);
    let key = format!("login:{ip}:{}", email.trim().to_lowercase());
    check_rate_limit(&key, auth_login_max_attempts(), 900)
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
    let max = if cfg!(debug_assertions) { 100 } else { 10 };
    check_rate_limit(&key, max, 900)
}

pub fn limit_password_reset(req: &HttpRequest, email: &str) -> Result<(), String> {
    let ip = client_ip(req);
    let key = format!("password-reset:{ip}:{}", email.trim().to_lowercase());
    check_rate_limit(&key, 5, 900)
}
