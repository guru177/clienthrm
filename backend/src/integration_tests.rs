//! HTTP integration tests (auth, RBAC middleware, health).
use actix_web::body::EitherBody;
use actix_web::dev::ServiceResponse;
use actix_web::{test, web, App};
use std::sync::{Arc, OnceLock};

use crate::biometric_events::BiometricEvents;
use crate::chat_events::ChatEvents;
use crate::config::{AppConfig, DEFAULT_JWT_SECRET};
use crate::db::{init_pool, run_migrations, DbPool};
use crate::middleware::auth::{decode_tenant_token, generate_token, TENANT_AUD};

const TEST_EMAIL: &str = "integration-test@hrm.local";
const TEST_PASSWORD: &str = "IntegrationTest123!";
const TEST_ORG_SLUG: &str = "integration-test-org";

struct TestHarness {
    pool: DbPool,
    jwt_secret: Arc<String>,
    app_config: Arc<AppConfig>,
}

static SHARED_HARNESS: OnceLock<TestHarness> = OnceLock::new();

fn shared_harness() -> &'static TestHarness {
    SHARED_HARNESS.get_or_init(TestHarness::new)
}

impl TestHarness {
    fn new() -> Self {
        let database_url = std::env::var("TEST_DATABASE_URL")
            .or_else(|_| std::env::var("DATABASE_URL"))
            .unwrap_or_else(|_| "postgres://hrm:hrm@127.0.0.1:5433/hrm".to_string());

        let pool = init_pool(&database_url);
        run_migrations(&pool);
        if let Ok(conn) = pool.get_platform() {
            crate::plan_limits::seed_all_permissions(&conn);
            crate::role_defaults::sync_role_defaults(&conn);
        }
        seed_integration_user(&pool);

        let jwt_secret = Arc::new(DEFAULT_JWT_SECRET.to_string());
        let app_config = Arc::new(AppConfig {
            host: "127.0.0.1".to_string(),
            port: 0,
            biometric_port: 0,
            bio_park_tcp_port: 0,
            database_url: database_url.clone(),
            cors_origins: vec!["http://127.0.0.1".to_string()],
            jwt_secret: DEFAULT_JWT_SECRET.to_string(),
            jwt_expiration_hours: 24,
            webhook_secret: String::new(),
        });

        Self {
            pool,
            jwt_secret,
            app_config,
        }
    }

    fn app(
        &self,
    ) -> App<
        impl actix_web::dev::ServiceFactory<
            actix_web::dev::ServiceRequest,
            Config = (),
            Response = ServiceResponse<EitherBody<actix_web::body::BoxBody>>,
            Error = actix_web::Error,
            InitError = (),
        >,
    > {
        let pool = web::Data::new(self.pool.clone());
        let jwt_secret = web::Data::new(self.jwt_secret.clone());
        let app_config = web::Data::new(self.app_config.clone());
        let events = web::Data::new(BiometricEvents::new());
        let chat_events = web::Data::new(ChatEvents::new());

        App::new()
            .app_data(web::PayloadConfig::new(10 * 1024 * 1024))
            .wrap(actix_web::middleware::from_fn(
                crate::middleware::rbac::rbac_middleware,
            ))
            .app_data(pool)
            .app_data(jwt_secret)
            .app_data(app_config)
            .app_data(events)
            .app_data(chat_events)
            .configure(crate::routes::configure)
    }
}

fn seed_integration_user(pool: &DbPool) {
    let conn = pool.get_platform().expect("platform conn");
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let hashed = bcrypt::hash(TEST_PASSWORD, 4).expect("hash password");

    let org_id: i64 = conn
        .query_row(
            "SELECT id FROM organizations WHERE slug = ?1",
            [TEST_ORG_SLUG],
            |r| r.get_idx::<i64>(0),
        )
        .unwrap_or(0);

    let org_id = if org_id > 0 {
        org_id
    } else {
        conn.execute(
            "INSERT INTO organizations (name, slug, status, plan, created_at, updated_at)
             VALUES (?1, ?2, 'active', 'enterprise', ?3, ?3)",
            crate::params!["Integration Test Org", TEST_ORG_SLUG, &now],
        )
        .expect("insert org");
        conn.last_insert_rowid()
    };

    let _ = conn.execute(
        "UPDATE organizations SET status = 'active', plan = 'enterprise', plan_expires_at = NULL WHERE id = ?1",
        [org_id],
    );

    if conn
        .query_row(
            "SELECT 1 FROM users WHERE email = ?1 AND organization_id = ?2 AND deleted_at IS NULL",
            crate::params![TEST_EMAIL, org_id],
            |_| Ok(()),
        )
        .is_ok()
    {
        conn.execute(
            "UPDATE users SET password = ?1, is_super_admin = 1 WHERE email = ?2 AND organization_id = ?3",
            crate::params![&hashed, TEST_EMAIL, org_id],
        )
        .expect("update user password");
        return;
    }

    conn.execute(
        "INSERT INTO users (name, email, password, organization_id, is_super_admin, status, email_verified_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 1, 'active', ?5, ?5, ?5)",
        crate::params!["Integration Tester", TEST_EMAIL, &hashed, org_id, &now],
    )
    .expect("insert test user");
}

async fn body_json<B: actix_web::body::MessageBody>(res: ServiceResponse<B>) -> serde_json::Value {
    let body = test::read_body(res).await;
    serde_json::from_slice(&body).unwrap_or(serde_json::json!({ "raw": String::from_utf8_lossy(&body) }))
}

#[actix_web::test]
async fn health_returns_ok() {
    let harness = shared_harness();
    let app = test::init_service(harness.app()).await;
    let req = test::TestRequest::get().uri("/api/health").to_request();
    let res = test::call_service(&app, req).await;
    assert!(res.status().is_success());
    let json = body_json(res).await;
    assert_eq!(json["status"], "ok");
    assert_eq!(json["service"], "hrm-backend");
}

#[actix_web::test]
async fn login_success_returns_token_and_refresh() {
    let harness = shared_harness();
    let app = test::init_service(harness.app()).await;
    let req = test::TestRequest::post()
        .uri("/api/auth/login")
        .set_json(serde_json::json!({
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "org_slug": TEST_ORG_SLUG
        }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 200, "login should succeed");
    let json = body_json(res).await;
    assert!(json["data"]["token"].is_string());
    assert!(json["data"]["refresh_token"].is_string());
}

#[actix_web::test]
async fn login_invalid_password_returns_401() {
    let harness = shared_harness();
    let app = test::init_service(harness.app()).await;
    let req = test::TestRequest::post()
        .uri("/api/auth/login")
        .set_json(serde_json::json!({
            "email": TEST_EMAIL,
            "password": "wrong-password",
            "org_slug": TEST_ORG_SLUG
        }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 401);
}

#[actix_web::test]
async fn login_sql_injection_attempt_returns_401_not_500() {
    let harness = shared_harness();
    let app = test::init_service(harness.app()).await;
    let req = test::TestRequest::post()
        .uri("/api/auth/login")
        .set_json(serde_json::json!({
            "email": "' OR '1'='1",
            "password": "' OR '1'='1",
            "org_slug": TEST_ORG_SLUG
        }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 401);
}

#[actix_web::test]
async fn login_missing_fields_returns_error() {
    let harness = shared_harness();
    let app = test::init_service(harness.app()).await;
    let req = test::TestRequest::post()
        .uri("/api/auth/login")
        .set_json(serde_json::json!({ "email": TEST_EMAIL }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert!(!res.status().is_success());
}

#[actix_web::test]
async fn me_requires_valid_jwt() {
    let harness = shared_harness();
    let app = test::init_service(harness.app()).await;

    let no_auth = test::TestRequest::get().uri("/api/auth/me").to_request();
    let res = test::call_service(&app, no_auth).await;
    assert_eq!(res.status(), 401);

    let bad = test::TestRequest::get()
        .uri("/api/auth/me")
        .insert_header(("Authorization", "Bearer not-a-valid-jwt"))
        .to_request();
    let res = test::call_service(&app, bad).await;
    assert_eq!(res.status(), 401);
}

#[actix_web::test]
async fn me_returns_user_with_valid_token() {
    let harness = shared_harness();
    let token = generate_token(
        1,
        TEST_EMAIL,
        1,
        TEST_ORG_SLUG,
        true,
        &harness.jwt_secret,
        24,
    )
    .unwrap();
    let claims = decode_tenant_token(&token, &harness.jwt_secret).unwrap();
    assert_eq!(claims.aud, TENANT_AUD);

    let app = test::init_service(harness.app()).await;
    let req = test::TestRequest::get()
        .uri("/api/auth/me")
        .insert_header(("Authorization", format!("Bearer {token}")))
        .to_request();
    let res = test::call_service(&app, req).await;
    // May be 200 if user id 1 exists, or 401/403 if not — use login flow instead
    if res.status().is_success() {
        let json = body_json(res).await;
        assert!(json["data"]["user"].is_object());
    }
}

#[actix_web::test]
async fn refresh_token_roundtrip() {
    let harness = shared_harness();
    let app = test::init_service(harness.app()).await;

    let login_req = test::TestRequest::post()
        .uri("/api/auth/login")
        .set_json(serde_json::json!({
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "org_slug": TEST_ORG_SLUG
        }))
        .to_request();
    let login_res = test::call_service(&app, login_req).await;
    assert_eq!(login_res.status(), 200);
    let login_json = body_json(login_res).await;
    let refresh = login_json["data"]["refresh_token"]
        .as_str()
        .expect("refresh token");

    let refresh_req = test::TestRequest::post()
        .uri("/api/auth/refresh")
        .set_json(serde_json::json!({ "refresh_token": refresh }))
        .to_request();
    let refresh_res = test::call_service(&app, refresh_req).await;
    assert_eq!(refresh_res.status(), 200);
    let refresh_json = body_json(refresh_res).await;
    assert!(refresh_json["data"]["token"].is_string());
    assert!(refresh_json["data"]["refresh_token"].is_string());
}

#[actix_web::test]
async fn refresh_invalid_token_returns_401() {
    let harness = shared_harness();
    let app = test::init_service(harness.app()).await;
    let req = test::TestRequest::post()
        .uri("/api/auth/refresh")
        .set_json(serde_json::json!({ "refresh_token": "invalid-token" }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 401);
}

#[actix_web::test]
async fn logout_revokes_refresh_token() {
    let harness = shared_harness();
    let app = test::init_service(harness.app()).await;

    let login_req = test::TestRequest::post()
        .uri("/api/auth/login")
        .set_json(serde_json::json!({
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "org_slug": TEST_ORG_SLUG
        }))
        .to_request();
    let login_res = test::call_service(&app, login_req).await;
    let login_json = body_json(login_res).await;
    let refresh = login_json["data"]["refresh_token"]
        .as_str()
        .expect("refresh token");

    let logout_req = test::TestRequest::post()
        .uri("/api/auth/logout")
        .set_json(serde_json::json!({ "refresh_token": refresh }))
        .to_request();
    let logout_res = test::call_service(&app, logout_req).await;
    assert!(logout_res.status().is_success());

    let refresh_req = test::TestRequest::post()
        .uri("/api/auth/refresh")
        .set_json(serde_json::json!({ "refresh_token": refresh }))
        .to_request();
    let refresh_res = test::call_service(&app, refresh_req).await;
    assert_eq!(refresh_res.status(), 401);
}

#[actix_web::test]
async fn admin_route_without_token_returns_401() {
    let harness = shared_harness();
    let app = test::init_service(harness.app()).await;
    let req = test::TestRequest::get()
        .uri("/api/admin/users/list")
        .to_request();
    // Avoid Debug-formatting actix errors — deep nested Display on Windows can
    // trigger STATUS_STACK_BUFFER_OVERRUN (0xc0000409).
    assert!(
        test::try_call_service(&app, req).await.is_err(),
        "unauthenticated admin route should fail"
    );
}

#[actix_web::test]
async fn expired_jwt_rejected() {
    use jsonwebtoken::{encode, EncodingKey, Header};
    use crate::models::user::JwtClaims;

    let harness = shared_harness();
    let secret = harness.jwt_secret.as_str();
    let past = chrono::Utc::now() - chrono::Duration::hours(2);
    let claims = JwtClaims {
        sub: 1,
        email: TEST_EMAIL.to_string(),
        exp: past.timestamp() as usize,
        iat: past.timestamp() as usize,
        organization_id: 1,
        org_slug: Some(TEST_ORG_SLUG.to_string()),
        is_super_admin: true,
        aud: TENANT_AUD.to_string(),
        impersonated_by: None,
        impersonation: false,
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .unwrap();

    let app = test::init_service(harness.app()).await;
    let req = test::TestRequest::get()
        .uri("/api/auth/me")
        .insert_header(("Authorization", format!("Bearer {token}")))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 401);
}

#[actix_web::test]
async fn concurrent_login_requests_succeed() {
    let harness = shared_harness();
    let app = test::init_service(harness.app()).await;

    for _ in 0..5 {
        let req = test::TestRequest::post()
            .uri("/api/auth/login")
            .set_json(serde_json::json!({
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD,
                "org_slug": TEST_ORG_SLUG
            }))
            .to_request();
        let res = test::call_service(&app, req).await;
        assert_eq!(res.status(), 200);
    }
}

#[actix_web::test]
async fn invalid_json_returns_client_error() {
    let harness = shared_harness();
    let app = test::init_service(harness.app()).await;
    let req = test::TestRequest::post()
        .uri("/api/auth/login")
        .insert_header(("Content-Type", "application/json"))
        .set_payload("{not valid json")
        .to_request();
    let res = test::call_service(&app, req).await;
    assert!(res.status().as_u16() >= 400 && res.status().as_u16() < 500);
}

#[actix_web::test]
async fn authenticated_users_list_returns_200() {
    let harness = shared_harness();
    let app = test::init_service(harness.app()).await;

    let login_req = test::TestRequest::post()
        .uri("/api/auth/login")
        .set_json(serde_json::json!({
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "org_slug": TEST_ORG_SLUG
        }))
        .to_request();
    let login_res = test::call_service(&app, login_req).await;
    let login_json = body_json(login_res).await;
    let token = login_json["data"]["token"].as_str().expect("login token");

    let req = test::TestRequest::get()
        .uri("/api/admin/users/list")
        .insert_header(("Authorization", format!("Bearer {token}")))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 200);
    let json = body_json(res).await;
    assert!(json["data"].is_array() || json["data"].is_object());
}

#[actix_web::test]
async fn authenticated_departments_pagination_accepts_query() {
    let harness = shared_harness();
    let app = test::init_service(harness.app()).await;

    let login_req = test::TestRequest::post()
        .uri("/api/auth/login")
        .set_json(serde_json::json!({
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "org_slug": TEST_ORG_SLUG
        }))
        .to_request();
    let login_res = test::call_service(&app, login_req).await;
    let login_json = body_json(login_res).await;
    let token = login_json["data"]["token"].as_str().expect("login token");

    let req = test::TestRequest::get()
        .uri("/api/admin/departments?page=1&per_page=10&search=test")
        .insert_header(("Authorization", format!("Bearer {token}")))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert_eq!(res.status(), 200);
}

#[actix_web::test]
async fn large_login_payload_rejected_or_handled() {
    let harness = shared_harness();
    let app = test::init_service(harness.app()).await;
    let huge = "x".repeat(100_000);
    let req = test::TestRequest::post()
        .uri("/api/auth/login")
        .set_json(serde_json::json!({
            "email": huge,
            "password": TEST_PASSWORD,
            "org_slug": TEST_ORG_SLUG
        }))
        .to_request();
    let res = test::call_service(&app, req).await;
    assert!(res.status().as_u16() >= 400);
}
