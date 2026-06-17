use crate::db::Connection;
use crate::params;

/// Seed platform admin and subscription plans on PostgreSQL after schema import.
pub fn run_postgres_seeds(conn: &Connection) {
    seed_platform_admin(conn);
    seed_subscription_plans_if_empty(conn);
}

fn seed_platform_admin(conn: &Connection) {
    let email = std::env::var("PLATFORM_ADMIN_EMAIL")
        .unwrap_or_else(|_| "platform@hrm.local".to_string());
    if conn
        .query_row(
            "SELECT 1 FROM platform_admins WHERE email = ?1",
            params![email.clone()],
            |row| row.get_idx::<i32>(0),
        )
        .is_ok()
    {
        return;
    }

    let password = match std::env::var("PLATFORM_ADMIN_PASSWORD") {
        Ok(p) if p.len() >= 12 => p,
        Ok(_) => {
            log::warn!("PLATFORM_ADMIN_PASSWORD must be at least 12 characters — platform admin not seeded");
            return;
        }
        Err(_) => {
            log::warn!(
                "Platform admin not seeded — set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD (min 12 chars)"
            );
            return;
        }
    };
    let name = std::env::var("PLATFORM_ADMIN_NAME").unwrap_or_else(|_| "Platform Admin".to_string());

    let Ok(hashed) = bcrypt::hash(&password, 12) else {
        log::warn!("Could not hash platform admin password");
        return;
    };

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if conn
        .execute(
            "INSERT INTO platform_admins (name, email, password, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)",
            params![name, email, hashed, now],
        )
        .is_ok()
    {
        log::info!("Platform admin seeded for PostgreSQL");
    }
}

fn seed_subscription_plans_if_empty(conn: &Connection) {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM subscription_plans", params![], |row| {
            row.get_idx::<i64>(0)
        })
        .unwrap_or(0);
    if count > 0 {
        return;
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let seeds: [(&str, &str, &str, &str, i64, &str, &str, i64); 4] = [
        (
            "Trial",
            "trial",
            "Free",
            "14 days",
            10,
            r#"["dashboard","users","settings","departments","designations","attendance","leave","holidays"]"#,
            r#"["Up to 10 users","Core HRM modules","Email support"]"#,
            1,
        ),
        (
            "Starter",
            "starter",
            "₹2,999",
            "month",
            50,
            r#"["dashboard","users","settings","centers","departments","designations","attendance","shifts","biometric","leave","holidays"]"#,
            r#"["Up to 50 users","Attendance & leave","Biometric sync"]"#,
            2,
        ),
        (
            "Professional",
            "professional",
            "₹7,999",
            "month",
            200,
            r#"["dashboard","users","settings","centers","departments","designations","attendance","shifts","biometric","leave","holidays","payroll","payslips","projects","tasks","workflows","analytics","careers"]"#,
            r#"["Up to 200 users","Payroll & projects","Workflow automation"]"#,
            3,
        ),
        (
            "Enterprise",
            "enterprise",
            "Custom",
            "year",
            9999,
            r#"["dashboard","users","settings","centers","departments","designations","attendance","shifts","biometric","leave","holidays","payroll","payslips","projects","tasks","workflows","analytics","careers","chat"]"#,
            r#"["Unlimited users","All modules","Priority support"]"#,
            4,
        ),
    ];

    for (name, slug, price, period, max_users, modules, features, sort_order) in seeds {
        let _ = conn.execute(
            "INSERT INTO subscription_plans
             (name, slug, price_label, billing_period, max_users, modules, features, is_active, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9, ?9)",
            params![name, slug, price, period, max_users, modules, features, sort_order, &now],
        );
    }
    log::info!("Default subscription plans seeded (PostgreSQL)");
}
