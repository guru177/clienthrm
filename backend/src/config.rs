/// Default JWT secret — must not be used in production.
pub const DEFAULT_JWT_SECRET: &str = "hrm-super-secret-key-change-in-production-2026";

/// Application configuration loaded from environment variables.
#[derive(Clone)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    /// Dedicated port for BIO-PARK / ZKTeco iClock devices (default 7788).
    pub biometric_port: u16,
    /// Raw TCP port for BIO-PARK binary protocol (default 5010).
    pub bio_park_tcp_port: u16,
    /// PostgreSQL connection URL (required for local dev and production).
    pub database_url: String,
    /// Comma-separated allowed CORS origins (e.g. https://app.example.com,https://platform.example.com).
    pub cors_origins: Vec<String>,
    pub jwt_secret: String,
    pub jwt_expiration_hours: u64,
    /// Shared secret for inbound webhooks (e.g. resume ingestion). Empty = webhook disabled.
    pub webhook_secret: String,
}

/// Load `backend/.env` whether the process cwd is the repo root or `target/release/`.
pub fn load_dotenv() {
    if load_dotenv_from_exe_dir() {
        return;
    }

    if dotenv::dotenv().is_ok() {
        return;
    }

    if let Ok(cwd) = std::env::current_dir() {
        for candidate in [cwd.join("backend").join(".env"), cwd.join(".env")] {
            if candidate.is_file() {
                let _ = dotenv::from_path(&candidate);
                return;
            }
        }
    }
}

fn load_dotenv_from_exe_dir() -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let Some(backend_dir) = exe
        .parent()
        .and_then(|d| d.parent())
        .and_then(|d| d.parent())
    else {
        return false;
    };
    let env_path = backend_dir.join(".env");
    if !env_path.is_file() {
        return false;
    }
    match dotenv::from_path(&env_path) {
        Ok(()) => true,
        Err(e) => {
            eprintln!("Warning: failed to parse {}: {e}", env_path.display());
            false
        }
    }
}

impl AppConfig {
    /// Public tenant signup enabled (default: debug builds only).
    pub fn public_signup_enabled() -> bool {
        std::env::var("ALLOW_PUBLIC_SIGNUP")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(cfg!(debug_assertions))
    }

    /// When true, ATTLOG from IPs that do not match registered device IP is rejected.
    pub fn biometric_strict_ip() -> bool {
        std::env::var("BIOMETRIC_STRICT_IP")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
    }
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            // 0.0.0.0 required so BIO-PARK / iClock devices on the LAN can reach /iclock/*
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "3001".to_string())
                .parse()
                .expect("PORT must be a number"),
            biometric_port: std::env::var("BIOMETRIC_PORT")
                .unwrap_or_else(|_| "7788".to_string())
                .parse()
                .expect("BIOMETRIC_PORT must be a number"),
            bio_park_tcp_port: std::env::var("BIO_PARK_TCP_PORT")
                .unwrap_or_else(|_| "5010".to_string())
                .parse()
                .expect("BIO_PARK_TCP_PORT must be a number"),
            database_url: std::env::var("DATABASE_URL")
                .expect("DATABASE_URL must be set (postgres://user:pass@host:5432/dbname)"),
            cors_origins: std::env::var("CORS_ORIGINS")
                .unwrap_or_else(|_| {
                    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175,http://localhost:3000".into()
                })
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            jwt_secret: std::env::var("JWT_SECRET")
                .unwrap_or_else(|_| DEFAULT_JWT_SECRET.to_string()),
            jwt_expiration_hours: std::env::var("JWT_EXPIRATION_HOURS")
                .unwrap_or_else(|_| "24".to_string())
                .parse()
                .expect("JWT_EXPIRATION_HOURS must be a number"),
            webhook_secret: std::env::var("WEBHOOK_SECRET").unwrap_or_default(),
        }
    }

    /// Refuse weak/default secrets in release builds unless explicitly allowed.
    pub fn validate_security(&self) {
        let url = self.database_url.trim();
        if !(url.starts_with("postgres://") || url.starts_with("postgresql://")) {
            panic!(
                "DATABASE_URL must be a PostgreSQL URL (postgres://...). SQLite is no longer supported."
            );
        }
        let allow_insecure = std::env::var("ALLOW_INSECURE_SECRETS")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(cfg!(debug_assertions));

        if self.jwt_secret == DEFAULT_JWT_SECRET && !allow_insecure {
            panic!(
                "JWT_SECRET is unset or uses the default value. Set a strong JWT_SECRET \
                 or ALLOW_INSECURE_SECRETS=1 for local development only."
            );
        }
        if self.jwt_secret.len() < 32 && !allow_insecure {
            panic!(
                "JWT_SECRET must be at least 32 characters. Set a strong secret \
                 or ALLOW_INSECURE_SECRETS=1 for local development only."
            );
        }
        let razorpay_key = std::env::var("RAZORPAY_KEY_ID").unwrap_or_default();
        let razorpay_secret = std::env::var("RAZORPAY_WEBHOOK_SECRET").unwrap_or_default();
        if !razorpay_key.trim().is_empty() && razorpay_secret.trim().is_empty() && !allow_insecure {
            panic!(
                "RAZORPAY_KEY_ID is set but RAZORPAY_WEBHOOK_SECRET is missing. \
                 Configure the webhook secret or unset Razorpay keys in this environment."
            );
        }
    }
}
