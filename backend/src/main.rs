mod config;
mod db;
mod handlers;
mod middleware;
mod models;
mod routes;

use actix_cors::Cors;
use actix_web::{web, App, HttpServer, middleware as actix_middleware};
use std::sync::Arc;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv::dotenv().ok();
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    let cfg = config::AppConfig::from_env();
    let pool = db::init_pool(&cfg.database_path);

    // Run migrations on startup
    db::migrations::run_migrations(&pool);

    let jwt_secret = Arc::new(cfg.jwt_secret.clone());
    let pool_data = web::Data::new(pool);
    let jwt_data = web::Data::new(jwt_secret);

    log::info!("🚀 HRM Backend starting on http://{}:{}", cfg.host, cfg.port);

    HttpServer::new(move || {
        let cors = Cors::default()
            .allowed_origin("http://localhost:5173")
            .allowed_origin("http://127.0.0.1:5173")
            .allowed_origin("http://localhost:5174")
            .allowed_origin("http://127.0.0.1:5174")
            .allowed_origin("http://localhost:3000")
            .allowed_methods(vec!["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
            .allowed_headers(vec![
                actix_web::http::header::AUTHORIZATION,
                actix_web::http::header::CONTENT_TYPE,
                actix_web::http::header::ACCEPT,
            ])
            .supports_credentials()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .wrap(actix_middleware::Logger::default())
            .app_data(pool_data.clone())
            .app_data(jwt_data.clone())
            .configure(routes::configure)
    })
    .bind(format!("{}:{}", cfg.host, cfg.port))?
    .run()
    .await
}
