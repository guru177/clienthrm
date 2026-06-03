/// Application configuration loaded from environment variables.
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub database_path: String,
    pub jwt_secret: String,
    pub jwt_expiration_hours: u64,
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            host: std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string()),
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "8000".to_string())
                .parse()
                .expect("PORT must be a number"),
            database_path: std::env::var("DATABASE_PATH")
                .unwrap_or_else(|_| "../database/database.sqlite".to_string()),
            jwt_secret: std::env::var("JWT_SECRET")
                .unwrap_or_else(|_| "hrm-super-secret-key-change-in-production-2026".to_string()),
            jwt_expiration_hours: std::env::var("JWT_EXPIRATION_HOURS")
                .unwrap_or_else(|_| "24".to_string())
                .parse()
                .expect("JWT_EXPIRATION_HOURS must be a number"),
        }
    }
}
