mod bio_park_tcp;
mod biometric_device_logic;
mod biometric_events;
mod career_logic;
mod chat_events;
mod chat_department_channels;
mod role_defaults;
mod config;
mod db;
mod handlers;
mod middleware;
mod models;
mod routes;
mod shift_logic;
mod salary_split;
mod statutory_logic;
mod salary_logic;
mod leave_type_logic;
mod payroll_logic;
mod payroll_month_context;
mod overtime_logic;
mod arrears_logic;
mod tds_logic;
mod payroll_extras;
mod attendance_logic;
mod workflow_logic;
mod storage;
mod desktop_update_feed;
mod tenant;
mod plan_limits;
mod presence;
mod subscription_period;
mod payslip_render;
mod payslip_pdf;
mod payslip_email;
mod smtp_config;
mod rate_limit;
mod otp_hash;
mod signup_otp;
mod signup_otp_email;
mod password_reset;
mod password_reset_email;
mod password_reset_otp;
mod password_reset_otp_email;
mod totp_logic;
mod validation;
mod jobs;
pub mod asset_email;

#[cfg(test)]
#[path = "integration_tests.rs"]
mod integration_tests;

#[cfg(test)]
#[path = "shift_attendance_salary_tests.rs"]
mod shift_attendance_salary_tests;

#[cfg(test)]
#[path = "db_health_tests.rs"]
mod db_health_tests;

use actix_cors::Cors;
use actix_web::{web, App, HttpServer, middleware as actix_middleware};
use std::sync::Arc;

use crate::config::AppConfig;

async fn run_biometric_server(
    host: &str,
    port: u16,
    pool: web::Data<db::DbPool>,
    events: web::Data<biometric_events::BiometricEvents>,
) -> std::io::Result<()> {
    log::info!("📡 Biometric device HTTP listener on http://{}:{}", host, port);
    HttpServer::new(move || {
        App::new()
            .wrap(actix_middleware::Logger::default())
            .app_data(pool.clone())
            .app_data(events.clone())
            // M-CARD / BIO-PARK ADMS endpoints
            .configure(routes::configure_adms)
            // Also support classic iClock endpoints
            .configure(routes::configure_iclock)
    })
    .bind(format!("{host}:{port}"))?
    .run()
    .await
}

async fn run_api_server(
    host: &str,
    port: u16,
    pool: web::Data<db::DbPool>,
    jwt_secret: web::Data<Arc<String>>,
    app_config: web::Data<Arc<AppConfig>>,
    events: web::Data<biometric_events::BiometricEvents>,
    chat_events: web::Data<chat_events::ChatEvents>,
) -> std::io::Result<()> {
    log::info!("🚀 HRM API http://{}:{}", host, port);
    let cors_origins = app_config.cors_origins.clone();
    HttpServer::new(move || {
        let allowed = cors_origins.clone();
        let cors = Cors::default()
            .allowed_methods(vec!["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
            .allowed_headers(vec![
                actix_web::http::header::AUTHORIZATION,
                actix_web::http::header::CONTENT_TYPE,
                actix_web::http::header::ACCEPT,
            ])
            .supports_credentials()
            .max_age(3600)
            .allowed_origin_fn(move |origin, _req_head| {
                if let Ok(s) = origin.to_str() {
                    if s == "null" || s.starts_with("hrm://") {
                        return true;
                    }
                    return allowed.iter().any(|o| s == o.as_str());
                }
                false
            });

        App::new()
            .app_data(web::PayloadConfig::new(10 * 1024 * 1024))
            .wrap(actix_web::middleware::from_fn(
                crate::middleware::security::security_headers_middleware,
            ))
            .wrap(actix_web::middleware::from_fn(
                crate::middleware::security::global_rate_limit_middleware,
            ))
            .wrap(actix_middleware::Logger::default())
            .wrap(actix_web::middleware::from_fn(
                crate::middleware::platform_guard::platform_guard_middleware,
            ))
            .wrap(actix_web::middleware::from_fn(
                crate::middleware::rbac::rbac_middleware,
            ))
            // Outermost: handle CORS preflight before auth middleware (Electron desktop).
            .wrap(cors)
            .app_data(pool.clone())
            .app_data(jwt_secret.clone())
            .app_data(app_config.clone())
            .app_data(events.clone())
            .app_data(chat_events.clone())
            .configure(routes::configure)
    })
    .bind(format!("{host}:{port}"))?
    .run()
    .await
}

#[actix_web::main(flavor = "multi_thread")]
async fn main() -> std::io::Result<()> {
    config::load_dotenv();
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    let cfg = config::AppConfig::from_env();
    if std::env::var("SMTP_HOST")
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
    {
        log::info!("Signup email OTP: SMTP_HOST is configured");
    } else {
        log::warn!("Signup email OTP: SMTP_HOST is not set");
    }
    if std::env::var("MSG91_AUTH_KEY")
        .or_else(|_| std::env::var("MSG91_AUTHKEY"))
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
    {
        log::info!("Signup WhatsApp OTP: MSG91 is configured");
    } else {
        log::warn!("Signup WhatsApp OTP: MSG91_AUTH_KEY / MSG91_AUTHKEY is not set");
    }
    cfg.validate_security();

    let database_url = cfg.database_url.clone();
    let pool = tokio::task::spawn_blocking(move || {
        let pool = db::init_pool(&database_url);
        db::init_read_pool();
        db::run_migrations(&pool);

        if !db::postgres_bootstrap::schema_ready(&pool) {
            panic!(
                "PostgreSQL schema is not ready (users table missing). \
                 Run scripts/setup-local-postgres.ps1 or scripts/migrate-sqlite-to-postgres.py first."
            );
        }

        if let Ok(conn) = pool.get() {
            crate::plan_limits::seed_all_permissions(&conn);
            crate::role_defaults::sync_role_defaults(&conn);
            crate::shift_logic::backfill_general_shift_assignments(&conn);
        }

        pool
    })
    .await
    .expect("database initialization panicked");

    let _ = std::fs::create_dir_all(crate::storage::storage_root());
    let _ = std::fs::create_dir_all(crate::storage::storage_root().join("desktop-updates"));

    jobs::spawn_all(pool.clone());

    let host = cfg.host.clone();
    let api_port = cfg.port;
    let biometric_port = cfg.biometric_port;
    let tcp_port = cfg.bio_park_tcp_port;

    let jwt_secret = Arc::new(cfg.jwt_secret.clone());
    let app_config = web::Data::new(Arc::new(cfg));
    let pool_data = web::Data::new(pool.clone());
    let jwt_data = web::Data::new(jwt_secret);

    let events_inner = biometric_events::BiometricEvents::new();
    let events = web::Data::new(events_inner.clone());
    let chat_events = web::Data::new(chat_events::ChatEvents::new());
    let pool_bio = pool_data.clone();
    let pool_api = pool_data.clone();
    let events_bio = events.clone();
    let events_api = events.clone();
    let chat_events_api = chat_events.clone();

    let host_bio = host.clone();
    let host_api = host.clone();
    let host_tcp = host;
    let pool_tcp = Arc::new(pool);
    let events_tcp = Arc::new(events_inner);

    tokio::spawn(async move {
        if let Err(e) = bio_park_tcp::run(&host_tcp, tcp_port, pool_tcp, events_tcp).await {
            log::error!("BIO-PARK TCP server error: {}", e);
        }
    });

    tokio::try_join!(
        run_api_server(
            &host_api,
            api_port,
            pool_api,
            jwt_data,
            app_config,
            events_api,
            chat_events_api,
        ),
        run_biometric_server(&host_bio, biometric_port, pool_bio, events_bio),
    )?;

    Ok(())
}
