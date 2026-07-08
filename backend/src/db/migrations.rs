use crate::db::DbPool;

fn column_exists(conn: &rusqlite::Connection, table: &str, column: &str) -> bool {
    let sql = format!("PRAGMA table_info({table})");
    conn.prepare(&sql)
        .and_then(|mut stmt| {
            let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
            for name in rows.filter_map(|r| r.ok()) {
                if name == column {
                    return Ok(true);
                }
            }
            Ok(false)
        })
        .unwrap_or(false)
}

fn table_exists(conn: &rusqlite::Connection, table: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1",
        [table],
        |_| Ok(()),
    )
    .is_ok()
}

fn add_organization_id_column(conn: &rusqlite::Connection, table: &str) {
    if !table_exists(conn, table) {
        return;
    }
    if column_exists(conn, table, "organization_id") {
        return;
    }
    let sql = format!(
        "ALTER TABLE {table} ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1"
    );
    if let Err(e) = conn.execute(&sql, []) {
        log::warn!("Could not add organization_id to {table}: {e}");
    } else {
        log::info!("Added organization_id to {table}");
    }
}

fn migrate_payslip_generated_status(conn: &rusqlite::Connection) {
    if !table_exists(conn, "payslips") {
        return;
    }
    let sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='payslips'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();
    if sql.contains("'generated'") {
        return;
    }
    log::info!("Migrating payslips.status CHECK to allow 'generated'");
    let _ = conn.execute_batch(
        "
        PRAGMA foreign_keys=OFF;
        CREATE TABLE payslips_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            working_days INTEGER NOT NULL DEFAULT 0,
            present_days INTEGER NOT NULL DEFAULT 0,
            leave_days INTEGER NOT NULL DEFAULT 0,
            holiday_days INTEGER NOT NULL DEFAULT 0,
            basic_salary NUMERIC NOT NULL DEFAULT 0,
            hra NUMERIC NOT NULL DEFAULT 0,
            transport_allowance NUMERIC NOT NULL DEFAULT 0,
            other_allowances NUMERIC NOT NULL DEFAULT 0,
            gross_salary NUMERIC NOT NULL DEFAULT 0,
            lop_deduction NUMERIC NOT NULL DEFAULT 0,
            pf_deduction NUMERIC NOT NULL DEFAULT 0,
            esi_deduction NUMERIC NOT NULL DEFAULT 0,
            tds NUMERIC NOT NULL DEFAULT 0,
            total_deductions NUMERIC NOT NULL DEFAULT 0,
            net_salary NUMERIC NOT NULL DEFAULT 0,
            status VARCHAR CHECK (status IN ('draft', 'generated', 'approved', 'paid')) NOT NULL DEFAULT 'draft',
            generated_at DATETIME,
            created_at DATETIME,
            updated_at DATETIME,
            adjustments TEXT,
            download_token VARCHAR,
            token_expires_at DATETIME,
            shift_penalty REAL DEFAULT 0,
            lop_basic REAL DEFAULT 0,
            lop_hra REAL DEFAULT 0,
            lop_transport REAL DEFAULT 0,
            lop_other REAL DEFAULT 0,
            prof_tax REAL DEFAULT 0,
            advance_deduction REAL DEFAULT 0,
            lw_employee REAL DEFAULT 0,
            payroll_detail TEXT,
            organization_id INTEGER NOT NULL DEFAULT 1
        );
        INSERT INTO payslips_new SELECT * FROM payslips;
        DROP TABLE payslips;
        ALTER TABLE payslips_new RENAME TO payslips;
        CREATE UNIQUE INDEX IF NOT EXISTS payslips_user_id_month_year_unique ON payslips(user_id, month, year);
        CREATE UNIQUE INDEX IF NOT EXISTS payslips_download_token_unique ON payslips(download_token);
        PRAGMA foreign_keys=ON;
        ",
    );
}

fn migrate_app_settings_org_scope(conn: &rusqlite::Connection) {
    if !table_exists(conn, "app_settings") {
        return;
    }
    if column_exists(conn, "app_settings", "organization_id") {
        return;
    }
    let _ = conn.execute_batch(
        "
        PRAGMA foreign_keys=OFF;
        CREATE TABLE app_settings_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL DEFAULT 1 REFERENCES organizations(id),
            key TEXT NOT NULL,
            value TEXT,
            type TEXT NOT NULL DEFAULT 'text',
            description TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(organization_id, key)
        );
        INSERT INTO app_settings_new (id, organization_id, key, value, type, description, created_at, updated_at)
        SELECT id, 1, key, value, type, description, created_at, updated_at FROM app_settings;
        DROP TABLE app_settings;
        ALTER TABLE app_settings_new RENAME TO app_settings;
        CREATE INDEX IF NOT EXISTS idx_app_settings_org ON app_settings(organization_id);
        PRAGMA foreign_keys=ON;
        ",
    );
    log::info!("Migrated app_settings to organization-scoped keys");
}

fn add_integer_column_if_missing(conn: &rusqlite::Connection, table: &str, column: &str, default: i64) {
    if !table_exists(conn, table) || column_exists(conn, table, column) {
        return;
    }
    let sql = format!(
        "ALTER TABLE {table} ADD COLUMN {column} INTEGER NOT NULL DEFAULT {default}"
    );
    if let Err(e) = conn.execute(&sql, []) {
        log::warn!("Could not add {column} to {table}: {e}");
    } else {
        log::info!("Added {column} to {table}");
    }
}

fn migrate_department_status_columns(conn: &rusqlite::Connection) {
    add_integer_column_if_missing(conn, "departments", "is_active", 1);
    add_integer_column_if_missing(conn, "designations", "is_active", 1);
}

/// Link departments to branches (centers) and backfill existing rows.
pub fn migrate_department_center_links(conn: &crate::db::Connection) {
    use crate::db::connection::OptionalExt;
    if conn.backend() == crate::db::dialect::Backend::Sqlite {
        let sqlite = conn.sqlite_conn();
        if !table_exists(sqlite, "departments") || !table_exists(sqlite, "centers") {
            return;
        }
        if !column_exists(sqlite, "departments", "center_id") {
            let _ = sqlite.execute(
                "ALTER TABLE departments ADD COLUMN center_id INTEGER REFERENCES centers(id)",
                [],
            );
            log::info!("Added center_id to departments");
        }
    } else if conn
        .query_row(
            "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'departments' AND column_name = 'center_id' LIMIT 1",
            crate::params![],
            |_| Ok(()),
        )
        .is_err()
    {
        let _ = conn.execute(
            "ALTER TABLE departments ADD COLUMN center_id INTEGER REFERENCES centers(id)",
            crate::params![],
        );
        log::info!("Added center_id to departments (PostgreSQL)");
    }

    let _ = conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_departments_center ON departments(organization_id, center_id)",
    );

  let org_ids: Vec<i64> = conn
        .query_map(
            "SELECT DISTINCT organization_id FROM departments WHERE center_id IS NULL",
            crate::params![],
            |row| row.get_idx::<i64>(0),
        );

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    for org_id in org_ids {
        let center_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM centers WHERE organization_id = ?1 ORDER BY id LIMIT 1",
                crate::params![org_id],
                |row| row.get_idx::<i64>(0),
            )
            .optional()
            .ok()
            .flatten();

        let center_id = match center_id {
            Some(id) => id,
            None => {
                let _ = conn.execute(
                    "INSERT INTO centers (name, is_active, organization_id, created_at, updated_at) VALUES (?1, 1, ?2, ?3, ?4)",
                    crate::params!["Head Office", org_id, &now, &now],
                );
                conn.last_insert_rowid()
            }
        };

        let _ = conn.execute(
            "UPDATE departments SET center_id = ?1 WHERE organization_id = ?2 AND center_id IS NULL",
            crate::params![center_id, org_id],
        );
    }

    let _ = conn.execute_batch(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_org_center_slug ON departments(organization_id, center_id, slug)",
    );

    log::info!("Department center_id migration applied");
}

fn add_text_column_if_missing(conn: &rusqlite::Connection, table: &str, column: &str) {
    if !table_exists(conn, table) || column_exists(conn, table, column) {
        return;
    }
    let sql = format!("ALTER TABLE {table} ADD COLUMN {column} TEXT");
    if let Err(e) = conn.execute(&sql, []) {
        log::warn!("Could not add {column} to {table}: {e}");
    }
}

fn migrate_organization_profile_columns(conn: &rusqlite::Connection) {
    for col in ["company_email", "company_phone", "country", "timezone"] {
        add_text_column_if_missing(conn, "organizations", col);
    }
}

fn migrate_org_subscription_period(conn: &rusqlite::Connection) {
    for col in ["plan_started_at", "plan_expires_at"] {
        add_text_column_if_missing(conn, "organizations", col);
    }
}

fn migrate_subscription_plans(conn: &rusqlite::Connection) {
    let _ = conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS subscription_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            price_label TEXT NOT NULL DEFAULT 'Free',
            billing_period TEXT NOT NULL DEFAULT 'month',
            max_users INTEGER NOT NULL DEFAULT 10,
            modules TEXT NOT NULL DEFAULT '[]',
            features TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        ",
    );

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM subscription_plans", [], |r| r.get::<_, i64>(0))
        .unwrap_or(0);
    if count > 0 {
        return;
    }

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let all_modules_json = serde_json::to_string(&crate::plan_limits::catalog_module_keys())
        .unwrap_or_else(|_| "[]".to_string());
    let seeds: [(&str, &str, &str, &str, i64, &str, &str, i64); 4] = [
        (
            "Trial",
            "trial",
            "Free",
            "14 days",
            10,
            r#"["dashboard","users","departments","designations","attendance","leave","leave_manage","holidays","settings","subscription","support"]"#,
            r#"["Up to 10 users","Core HRM modules","Email support"]"#,
            1,
        ),
        (
            "Starter",
            "starter",
            "₹2,999",
            "month",
            50,
            r#"["dashboard","users","settings","centers","departments","designations","attendance","shifts","biometric","leave","leave_manage","holidays","subscription","support"]"#,
            r#"["Up to 50 users","Attendance & leave","Biometric sync"]"#,
            2,
        ),
        (
            "Professional",
            "professional",
            "₹7,999",
            "month",
            200,
            r#"["dashboard","users","settings","centers","departments","designations","careers","job_applications","chat","attendance","shifts","biometric","leave","leave_manage","holidays","payroll","my_payslips","workflows","tasks","projects","reports","subscription","notifications","support"]"#,
            r#"["Up to 200 users","Payroll & workflows","Priority support"]"#,
            3,
        ),
        (
            "Enterprise",
            "enterprise",
            "Custom",
            "custom",
            0,
            &all_modules_json,
            r#"["Unlimited users","Custom integrations","Dedicated success manager"]"#,
            4,
        ),
    ];

    for (name, slug, price, period, max_users, modules, features, sort_order) in seeds {
        let _ = conn.execute(
            "INSERT INTO subscription_plans
             (name, slug, price_label, billing_period, max_users, modules, features, is_active, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9, ?9)",
            rusqlite::params![name, slug, price, period, max_users, modules, features, sort_order, &now],
        );
    }
    log::info!("Default subscription plans seeded");
}

fn run_saas_migrations(conn: &rusqlite::Connection) {
    let _ = conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS organizations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'active',
            plan TEXT NOT NULL DEFAULT 'trial',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS platform_admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        ",
    );

    let _ = conn.execute(
        "INSERT OR IGNORE INTO organizations (id, name, slug, status, plan, created_at, updated_at)
         VALUES (1, 'Default Organization', 'default', 'active', 'enterprise', datetime('now'), datetime('now'))",
        [],
    );

    migrate_app_settings_org_scope(conn);

    for table in [
        "users",
        "departments",
        "designations",
        "roles",
        "centers",
        "shift_templates",
        "user_shift_assignments",
        "shift_daily_roster",
        "biometric_devices",
        "biometric_punches",
        "salary_templates",
        "employee_salary_profiles",
        "employee_advances",
        "leave_types",
        "attendance",
        "leave_requests",
        "holidays",
        "projects",
        "tasks",
        "payslips",
        "payroll_runs",
        "salary_components",
        "workflows",
        "careers",
        "job_applications",
        "workflow_instances",
        "biometric_user_map",
    ] {
        add_organization_id_column(conn, table);
    }

    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_users_org_email ON users(organization_id, email)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_departments_org ON departments(organization_id)",
        [],
    );

    migrate_organization_profile_columns(conn);
    migrate_org_subscription_period(conn);
    migrate_subscription_plans(conn);

    log::info!("SaaS tenant migrations applied");

    seed_platform_admin(conn);
}

fn seed_platform_admin(conn: &rusqlite::Connection) {
    let email = std::env::var("PLATFORM_ADMIN_EMAIL")
        .unwrap_or_else(|_| "platform@hrm.local".to_string());
    if conn
        .query_row(
            "SELECT 1 FROM platform_admins WHERE email = ?1",
            [&email],
            |_| Ok(()),
        )
        .is_ok()
    {
        return;
    }

    let password = match std::env::var("PLATFORM_ADMIN_PASSWORD") {
        Ok(p) if p.len() >= 12 => p,
        Ok(_) => {
            log::warn!(
                "PLATFORM_ADMIN_PASSWORD must be at least 12 characters — platform admin not seeded"
            );
            return;
        }
        Err(_) => {
            log::warn!(
                "Platform admin not seeded — set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD (min 12 chars)"
            );
            return;
        }
    };
    let name = std::env::var("PLATFORM_ADMIN_NAME")
        .unwrap_or_else(|_| "Platform Admin".to_string());

    let Ok(hashed) = bcrypt::hash(&password, 12) else {
        log::warn!("Could not hash platform admin password");
        return;
    };

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if conn
        .execute(
            "INSERT INTO platform_admins (name, email, password, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)",
            rusqlite::params![name, email, hashed, &now],
        )
        .is_ok()
    {
        log::info!(
            "Platform admin seeded (email: {}). Set PLATFORM_ADMIN_EMAIL/PASSWORD in production.",
            email
        );
    }
}

fn expand_salary_component_calculation_types(conn: &rusqlite::Connection) {
    let ddl: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE name='salary_components'",
            [],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_default();
    if ddl.contains("percentage_of_gross") {
        return;
    }
    let _ = conn.execute_batch(
        "
        PRAGMA foreign_keys=OFF;
        CREATE TABLE salary_components_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            name VARCHAR NOT NULL,
            type VARCHAR CHECK (type IN ('earning', 'deduction', 'reimbursement')) NOT NULL,
            description VARCHAR,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME,
            updated_at DATETIME,
            earning_type VARCHAR,
            name_in_payslip VARCHAR,
            calculation_type VARCHAR CHECK (calculation_type IN ('flat_amount', 'percentage_of_basic', 'percentage_of_ctc', 'percentage_of_gross')),
            amount NUMERIC,
            deduction_type VARCHAR,
            deduction_frequency VARCHAR CHECK (deduction_frequency IN ('recurring', 'one_time')),
            is_pre_tax TINYINT(1) NOT NULL DEFAULT 0,
            reimbursement_type VARCHAR,
            max_amount_per_month NUMERIC,
            slug TEXT,
            component_type TEXT,
            default_value REAL,
            is_taxable INTEGER
        );
        INSERT INTO salary_components_new SELECT * FROM salary_components;
        DROP TABLE salary_components;
        ALTER TABLE salary_components_new RENAME TO salary_components;
        PRAGMA foreign_keys=ON;
        ",
    );
    log::info!("Expanded salary_components.calculation_type (ctc + gross percentages)");
}

/// Legacy SQLite migrations (no longer used — PostgreSQL schema via postgres_bootstrap).
#[allow(dead_code)]
pub fn run_sqlite_migrations(_pool: &DbPool) {}

/// Phase 1: platform admin team / 2FA / sessions / audit log / notes / announcements / feature flags / releases.
fn migrate_platform_admin_extras(conn: &rusqlite::Connection) {
    for col in ["role", "is_active", "last_login_at", "totp_secret", "totp_enabled"] {
        if !column_exists(conn, "platform_admins", col) {
            let ddl = match col {
                "is_active" => "ALTER TABLE platform_admins ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1",
                "totp_enabled" => "ALTER TABLE platform_admins ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0",
                "role" => "ALTER TABLE platform_admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'",
                _ => continue,
            };
            let _ = conn.execute(ddl, []);
        }
    }
    for col in ["last_login_at", "totp_secret"] {
        add_text_column_if_missing(conn, "platform_admins", col);
    }

    let _ = conn.execute(
        "UPDATE platform_admins SET role = 'owner' WHERE id = (SELECT MIN(id) FROM platform_admins) AND (role IS NULL OR role = '' OR role = 'admin')",
        [],
    );

    let _ = conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS platform_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_admin_id INTEGER REFERENCES platform_admins(id) ON DELETE SET NULL,
            actor_email TEXT,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id INTEGER,
            target_label TEXT,
            organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
            meta_json TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_platform_audit_actor ON platform_audit_log(actor_admin_id);
        CREATE INDEX IF NOT EXISTS idx_platform_audit_action ON platform_audit_log(action);
        CREATE INDEX IF NOT EXISTS idx_platform_audit_org ON platform_audit_log(organization_id);
        CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_log(created_at);

        CREATE TABLE IF NOT EXISTS platform_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
            jti TEXT NOT NULL UNIQUE,
            ip_address TEXT,
            user_agent TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT,
            revoked INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_platform_sessions_admin ON platform_sessions(admin_id);
        CREATE INDEX IF NOT EXISTS idx_platform_sessions_jti ON platform_sessions(jti);

        CREATE TABLE IF NOT EXISTS platform_org_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            author_admin_id INTEGER REFERENCES platform_admins(id) ON DELETE SET NULL,
            author_email TEXT,
            body TEXT NOT NULL,
            pinned INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_platform_org_notes_org ON platform_org_notes(organization_id);

        CREATE TABLE IF NOT EXISTS platform_announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            severity TEXT NOT NULL DEFAULT 'info',
            audience TEXT NOT NULL DEFAULT 'all',
            published INTEGER NOT NULL DEFAULT 1,
            starts_at TEXT,
            ends_at TEXT,
            created_by_admin_id INTEGER REFERENCES platform_admins(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_platform_announcements_org ON platform_announcements(organization_id);
        CREATE INDEX IF NOT EXISTS idx_platform_announcements_pub ON platform_announcements(published, starts_at, ends_at);

        CREATE TABLE IF NOT EXISTS tenant_feature_overrides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            module_slug TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            reason TEXT,
            created_by_admin_id INTEGER REFERENCES platform_admins(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(organization_id, module_slug)
        );

        CREATE TABLE IF NOT EXISTS platform_releases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            audience TEXT NOT NULL DEFAULT 'all',
            severity TEXT NOT NULL DEFAULT 'info',
            status TEXT NOT NULL DEFAULT 'draft',
            published_at TEXT,
            created_by_admin_id INTEGER REFERENCES platform_admins(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_platform_releases_status ON platform_releases(status, published_at);
        ",
    );

    log::info!("Platform admin extras migration applied");
}

fn migrate_platform_billing(conn: &rusqlite::Connection) {
    let _ = conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS platform_invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            plan_slug TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'INR',
            status TEXT NOT NULL DEFAULT 'pending',
            period_start TEXT,
            period_end TEXT,
            note TEXT,
            created_by_admin_id INTEGER REFERENCES platform_admins(id) ON DELETE SET NULL,
            paid_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_platform_invoices_org ON platform_invoices(organization_id);
        CREATE INDEX IF NOT EXISTS idx_platform_invoices_status ON platform_invoices(status, created_at);

        CREATE TABLE IF NOT EXISTS platform_coupons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            percent_off REAL NOT NULL DEFAULT 0,
            amount_off REAL NOT NULL DEFAULT 0,
            valid_until TEXT,
            max_redemptions INTEGER,
            redemption_count INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            note TEXT,
            created_by_admin_id INTEGER REFERENCES platform_admins(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_platform_coupons_code ON platform_coupons(code);

        CREATE TABLE IF NOT EXISTS platform_plan_change_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            requested_plan TEXT NOT NULL,
            current_plan TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            note TEXT,
            requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            requested_by_email TEXT,
            reviewed_by_admin_id INTEGER REFERENCES platform_admins(id) ON DELETE SET NULL,
            review_note TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_platform_plan_requests_org ON platform_plan_change_requests(organization_id);
        CREATE INDEX IF NOT EXISTS idx_platform_plan_requests_status ON platform_plan_change_requests(status, created_at);
        ",
    );
    log::info!("Platform billing migration applied");
}

fn migrate_platform_support(conn: &rusqlite::Connection) {
    let _ = conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS platform_kb_articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            audience TEXT NOT NULL DEFAULT 'all',
            status TEXT NOT NULL DEFAULT 'draft',
            published_at TEXT,
            created_by_admin_id INTEGER REFERENCES platform_admins(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_platform_kb_status ON platform_kb_articles(status, published_at);

        CREATE TABLE IF NOT EXISTS platform_support_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            user_email TEXT,
            user_name TEXT,
            subject TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open',
            priority TEXT NOT NULL DEFAULT 'normal',
            replies_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_platform_support_org ON platform_support_tickets(organization_id);
        CREATE INDEX IF NOT EXISTS idx_platform_support_status ON platform_support_tickets(status, created_at);
        ",
    );
    log::info!("Platform support migration applied");
}

fn migrate_org_notifications(conn: &rusqlite::Connection) {
    let _ = conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS org_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'info',
            audience TEXT NOT NULL CHECK(audience IN ('all', 'department', 'designation')),
            target_id INTEGER,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            image_url TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_org_notifications_org ON org_notifications(organization_id, created_at);

        CREATE TABLE IF NOT EXISTS org_notification_reads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            notification_id INTEGER NOT NULL REFERENCES org_notifications(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            read_at TEXT,
            dismissed_at TEXT,
            UNIQUE(notification_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_org_notification_reads_user ON org_notification_reads(user_id);
        ",
    );
    log::info!("Org notifications migration applied");
}

fn migrate_org_notification_extras(conn: &rusqlite::Connection) {
    if !column_exists(conn, "org_notifications", "image_url") {
        let _ = conn.execute(
            "ALTER TABLE org_notifications ADD COLUMN image_url TEXT",
            [],
        );
        log::info!("Added org_notifications.image_url column");
    }
}

/// Ensure plans include new catalog modules and preserve access after module splits.
fn migrate_subscription_plan_module_catalog(conn: &rusqlite::Connection) {
    let catalog = crate::plan_limits::catalog_module_keys();
    if catalog.is_empty() {
        return;
    }

    let Ok(mut stmt) = conn.prepare("SELECT slug, modules FROM subscription_plans") else {
        return;
    };
    let rows: Vec<(String, String)> = match stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(_) => return,
    };

    for (slug, raw) in rows {
        let mut modules: Vec<String> = serde_json::from_str(&raw).unwrap_or_default();
        let before = modules.clone();

        if slug == "enterprise" {
            modules = catalog.clone();
        } else if slug == "professional" {
            for key in &catalog {
                if !modules.iter().any(|m| m == key) {
                    modules.push(key.clone());
                }
            }
        } else {
            expand_legacy_plan_modules(&mut modules);
        }

        modules.sort_by_key(|key| crate::plan_limits::module_sort_index(key));
        modules.dedup();

        if modules == before {
            continue;
        }
        let Ok(json) = serde_json::to_string(&modules) else {
            continue;
        };
        let _ = conn.execute(
            "UPDATE subscription_plans SET modules = ?1, updated_at = datetime('now') WHERE slug = ?2",
            rusqlite::params![json, slug],
        );
    }

    migrate_role_permissions_for_split_modules(conn);
}

fn expand_legacy_plan_modules(modules: &mut Vec<String>) {
    if modules.iter().any(|m| m == "settings") {
        for key in ["subscription", "notifications"] {
            if !modules.iter().any(|m| m == key) {
                modules.push(key.to_string());
            }
        }
    }
    if modules.iter().any(|m| m == "leave") && !modules.iter().any(|m| m == "leave_manage") {
        modules.push("leave_manage".to_string());
    }
    if modules.iter().any(|m| m == "payroll") && !modules.iter().any(|m| m == "my_payslips") {
        modules.push("my_payslips".to_string());
    }
    if !modules.iter().any(|m| m == "support") {
        modules.push("support".to_string());
    }
}

fn migrate_role_permissions_for_split_modules(conn: &rusqlite::Connection) {
    let pairs = [
        ("manage-settings", "manage-subscription"),
        ("manage-settings", "manage-org-notifications"),
        ("view-payroll", "view-my-payslips"),
    ];
    for (from_slug, to_slug) in pairs {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO permission_role (permission_id, role_id, created_at, updated_at)
             SELECT p_new.id, pr.role_id, datetime('now'), datetime('now')
             FROM permission_role pr
             INNER JOIN permissions p_old ON p_old.id = pr.permission_id AND p_old.slug = ?1
             INNER JOIN permissions p_new ON p_new.slug = ?2",
            rusqlite::params![from_slug, to_slug],
        );
    }
}

fn migrate_platform_announcement_extras(conn: &rusqlite::Connection) {
    if !column_exists(conn, "platform_announcements", "image_url") {
        let _ = conn.execute(
            "ALTER TABLE platform_announcements ADD COLUMN image_url TEXT",
            [],
        );
        log::info!("Added platform_announcements.image_url column");
    }
}

fn migrate_chat_module(conn: &rusqlite::Connection) {
    let _ = conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS chat_spaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            kind TEXT NOT NULL CHECK(kind IN ('channel', 'dm')),
            name TEXT,
            slug TEXT,
            description TEXT,
            topic TEXT,
            is_private INTEGER NOT NULL DEFAULT 0,
            dm_hash TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_chat_spaces_org ON chat_spaces(organization_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_spaces_org_slug ON chat_spaces(organization_id, slug) WHERE slug IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_spaces_dm_hash ON chat_spaces(organization_id, dm_hash) WHERE dm_hash IS NOT NULL;

        CREATE TABLE IF NOT EXISTS chat_space_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            space_id INTEGER NOT NULL REFERENCES chat_spaces(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL DEFAULT 'member',
            last_read_at TEXT,
            is_muted INTEGER NOT NULL DEFAULT 0,
            joined_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(space_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            space_id INTEGER NOT NULL REFERENCES chat_spaces(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            parent_id INTEGER REFERENCES chat_messages(id) ON DELETE CASCADE,
            content TEXT NOT NULL DEFAULT '',
            mentions_json TEXT NOT NULL DEFAULT '[]',
            is_edited INTEGER NOT NULL DEFAULT 0,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_chat_messages_space ON chat_messages(space_id, id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_parent ON chat_messages(parent_id);

        CREATE TABLE IF NOT EXISTS chat_message_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            emoji TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(message_id, user_id, emoji)
        );

        CREATE TABLE IF NOT EXISTS chat_message_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER REFERENCES chat_messages(id) ON DELETE CASCADE,
            uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            file_name TEXT NOT NULL,
            file_url TEXT NOT NULL,
            file_size INTEGER NOT NULL DEFAULT 0,
            mime_type TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS chat_pinned_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            space_id INTEGER NOT NULL REFERENCES chat_spaces(id) ON DELETE CASCADE,
            message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
            pinned_by INTEGER NOT NULL REFERENCES users(id),
            pinned_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(space_id, message_id)
        );

        CREATE TABLE IF NOT EXISTS chat_starred_messages (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, message_id)
        );
        ",
    );

    let _ = conn.execute(
        "INSERT OR IGNORE INTO permissions (name, slug, description, \"group\", created_at, updated_at)
         VALUES ('View Team Chat', 'view-chat', 'Access internal team messaging', 'Communication', datetime('now'), datetime('now'))",
        [],
    );

    log::info!("Team chat module migration completed");

    let _ = conn.execute(
        "ALTER TABLE chat_spaces ADD COLUMN department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE",
        [],
    );
    let _ = conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_spaces_org_department ON chat_spaces(organization_id, department_id) WHERE department_id IS NOT NULL",
        [],
    );

    for (name, slug, description, group) in [
        (
            "View Job Postings",
            "view-jobs",
            "View job postings and careers",
            "Careers",
        ),
        (
            "Create Job Postings",
            "create-jobs",
            "Create job postings",
            "Careers",
        ),
        (
            "Edit Job Postings",
            "edit-jobs",
            "Edit job postings",
            "Careers",
        ),
        (
            "Delete Job Postings",
            "delete-jobs",
            "Delete job postings",
            "Careers",
        ),
    ] {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO permissions (name, slug, description, \"group\", created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))",
            rusqlite::params![name, slug, description, group],
        );
    }

    if let Ok(mut stmt) = conn.prepare("SELECT id, modules FROM subscription_plans") {
        let rows: Vec<(i64, String)> = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        for (id, modules_raw) in rows {
            let mut modules: Vec<String> = serde_json::from_str(&modules_raw).unwrap_or_default();
            if !modules.iter().any(|m| m == "settings") {
                modules.push("settings".to_string());
                if let Ok(updated) = serde_json::to_string(&modules) {
                    let _ = conn.execute(
                        "UPDATE subscription_plans SET modules = ?1 WHERE id = ?2",
                        rusqlite::params![updated, id],
                    );
                }
            }
        }
    }

    let _ = conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS workflow_executions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'pending',
            trigger_type TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow
            ON workflow_executions(workflow_id);
        ",
    );

    let leave_types_sql: Option<String> = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'leave_types'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok();
    if leave_types_sql
        .as_deref()
        .is_some_and(|sql| sql.contains("slug TEXT NOT NULL UNIQUE") && !sql.contains("UNIQUE(organization_id, slug)"))
    {
        let _ = conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS leave_types_v2 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT NOT NULL,
                name TEXT NOT NULL,
                payment_type TEXT NOT NULL DEFAULT 'paid' CHECK (payment_type IN ('paid', 'unpaid', 'half_day')),
                counts_toward_quota INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1,
                organization_id INTEGER NOT NULL DEFAULT 1 REFERENCES organizations(id),
                created_at TEXT,
                updated_at TEXT,
                UNIQUE(organization_id, slug)
            );
            INSERT OR IGNORE INTO leave_types_v2
                (id, slug, name, payment_type, counts_toward_quota, is_active, organization_id, created_at, updated_at)
            SELECT id, slug, name, payment_type, counts_toward_quota, is_active,
                   COALESCE(organization_id, 1), created_at, updated_at
            FROM leave_types;
            DROP TABLE leave_types;
            ALTER TABLE leave_types_v2 RENAME TO leave_types;
            ",
        );
    }

    // Revoke blanket view-chat grants (plan-gated; admin roles retain via role_defaults)
    let _ = conn.execute(
        "DELETE FROM permission_role
         WHERE permission_id = (SELECT id FROM permissions WHERE slug = 'view-chat')
           AND role_id NOT IN (
             SELECT id FROM roles WHERE lower(slug) IN ('admin', 'administrator')
           )",
        [],
    );

    let _ = conn.execute(
        "UPDATE workflows SET trigger_type = 'leave_request_approved', updated_at = datetime('now')
         WHERE trigger_type = 'leave_approved'",
        [],
    );

    if let Ok(mut stmt) = conn.prepare("SELECT id FROM organizations WHERE status != 'deleted'") {
        let org_ids: Vec<i64> = stmt
            .query_map([], |row| row.get::<_, i64>(0))
            .unwrap()
        .into_iter()
        .filter_map(|r| r.ok())
            .collect();
        for org_id in org_ids {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO app_settings (organization_id, key, value, type, description, created_at, updated_at)
                 VALUES (?1, 'shift_penalty_half_day_factor', '0.5', 'number', 'Reference factor for suggested late/early penalty (manual deduction at payroll)', datetime('now'), datetime('now'))",
                [org_id],
            );
            let _ = conn.execute(
                "INSERT OR IGNORE INTO app_settings (organization_id, key, value, type, description, created_at, updated_at)
                 VALUES (?1, 'annual_leave_quota', '12', 'number', 'Annual leave days per employee', datetime('now'), datetime('now'))",
                [org_id],
            );
        }
    }

    for col in ["contact_person"] {
        let sql = format!("ALTER TABLE organizations ADD COLUMN {col} TEXT;");
        let _ = conn.execute(&sql, []);
    }

    let _ = conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS signup_otp_challenges (
            id TEXT PRIMARY KEY,
            channel TEXT NOT NULL,
            destination TEXT NOT NULL,
            otp_hash TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_signup_otp_expires ON signup_otp_challenges(expires_at);
        ",
    );

    let _ = conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS leave_credits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            days INTEGER NOT NULL DEFAULT 1,
            reason TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual',
            work_date TEXT,
            year INTEGER NOT NULL,
            created_by INTEGER REFERENCES users(id),
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_leave_credits_org_user_year
            ON leave_credits(organization_id, user_id, year)
            WHERE deleted_at IS NULL;
        ",
    );

}

/// Replace legacy Laravel `password_reset_tokens` (email/token PK) with Rust self-service schema.
fn migrate_password_reset_tokens(conn: &rusqlite::Connection) {
    if table_exists(conn, "password_reset_tokens")
        && !column_exists(conn, "password_reset_tokens", "user_id")
    {
        log::info!("Replacing legacy password_reset_tokens table for self-service reset");
        let _ = conn.execute("DROP TABLE password_reset_tokens", []);
    }

    let _ = conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            used_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at);

        CREATE TABLE IF NOT EXISTS password_reset_otp_challenges (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            email TEXT NOT NULL,
            otp_hash TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            expires_at TEXT NOT NULL,
            verified_at TEXT,
            reset_expires_at TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_password_reset_otp_user ON password_reset_otp_challenges(user_id);
        CREATE INDEX IF NOT EXISTS idx_password_reset_otp_expires ON password_reset_otp_challenges(expires_at);
        ",
    );
}

/// Advanced payroll: OT, variable pay, reimbursements, runs, TDS, pay groups, bank details.
fn migrate_advanced_payroll(conn: &rusqlite::Connection) {
    for (table, col, ddl) in [
        ("users", "payroll_hold", "ALTER TABLE users ADD COLUMN payroll_hold INTEGER NOT NULL DEFAULT 0"),
        ("users", "payroll_hold_reason", "ALTER TABLE users ADD COLUMN payroll_hold_reason TEXT"),
        ("users", "payroll_hold_until", "ALTER TABLE users ADD COLUMN payroll_hold_until TEXT"),
        ("users", "pay_group_id", "ALTER TABLE users ADD COLUMN pay_group_id INTEGER"),
        ("users", "bank_account", "ALTER TABLE users ADD COLUMN bank_account TEXT"),
        ("users", "bank_ifsc", "ALTER TABLE users ADD COLUMN bank_ifsc TEXT"),
        ("users", "bank_account_holder", "ALTER TABLE users ADD COLUMN bank_account_holder TEXT"),
        ("users", "work_state", "ALTER TABLE users ADD COLUMN work_state TEXT"),
        ("users", "tax_regime", "ALTER TABLE users ADD COLUMN tax_regime TEXT DEFAULT 'new'"),
        ("payslips", "payroll_run_id", "ALTER TABLE payslips ADD COLUMN payroll_run_id INTEGER"),
        ("payslips", "payment_status", "ALTER TABLE payslips ADD COLUMN payment_status TEXT DEFAULT 'pending'"),
        ("payslips", "ot_hours", "ALTER TABLE payslips ADD COLUMN ot_hours REAL DEFAULT 0"),
        ("payslips", "ot_amount", "ALTER TABLE payslips ADD COLUMN ot_amount REAL DEFAULT 0"),
        ("payslips", "variable_pay_amount", "ALTER TABLE payslips ADD COLUMN variable_pay_amount REAL DEFAULT 0"),
        ("payslips", "reimbursement_amount", "ALTER TABLE payslips ADD COLUMN reimbursement_amount REAL DEFAULT 0"),
        ("payslips", "arrears_amount", "ALTER TABLE payslips ADD COLUMN arrears_amount REAL DEFAULT 0"),
        ("payslips", "employer_cost_json", "ALTER TABLE payslips ADD COLUMN employer_cost_json TEXT"),
    ] {
        if table_exists(conn, table) && !column_exists(conn, table, col) {
            let _ = conn.execute(ddl, []);
        }
    }

    let _ = conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS payroll_variable_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            item_type TEXT NOT NULL,
            label TEXT NOT NULL,
            amount REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'approved',
            notes TEXT,
            created_by INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_payroll_var_org_period ON payroll_variable_items(organization_id, year, month);
        CREATE INDEX IF NOT EXISTS idx_payroll_var_user ON payroll_variable_items(user_id, year, month);

        CREATE TABLE IF NOT EXISTS reimbursement_claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            salary_component_id INTEGER,
            claim_month INTEGER NOT NULL,
            claim_year INTEGER NOT NULL,
            title TEXT NOT NULL,
            amount REAL NOT NULL,
            receipt_url TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            reviewed_by INTEGER,
            reviewed_at TEXT,
            review_notes TEXT,
            payroll_month INTEGER,
            payroll_year INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reimb_claim_user ON reimbursement_claims(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_reimb_claim_org ON reimbursement_claims(organization_id, claim_year, claim_month);

        CREATE TABLE IF NOT EXISTS payroll_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            run_type TEXT NOT NULL DEFAULT 'monthly',
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            pay_group_id INTEGER,
            status TEXT NOT NULL DEFAULT 'draft',
            prepared_by INTEGER,
            reviewed_by INTEGER,
            approved_by INTEGER,
            released_by INTEGER,
            prepared_at TEXT,
            reviewed_at TEXT,
            approved_at TEXT,
            released_at TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_payroll_runs_org ON payroll_runs(organization_id, year, month);

        CREATE TABLE IF NOT EXISTS payroll_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            payroll_run_id INTEGER,
            actor_user_id INTEGER,
            action TEXT NOT NULL,
            detail TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS employee_tax_declarations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            financial_year TEXT NOT NULL,
            regime TEXT NOT NULL DEFAULT 'new',
            declarations_json TEXT NOT NULL DEFAULT '{}',
            hra_rent_paid REAL DEFAULT 0,
            hra_metro INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, financial_year)
        );

        CREATE TABLE IF NOT EXISTS pt_slabs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            state_code TEXT NOT NULL,
            state_name TEXT NOT NULL,
            min_gross REAL NOT NULL DEFAULT 0,
            max_gross REAL,
            monthly_tax REAL NOT NULL,
            effective_from TEXT,
            UNIQUE(state_code, min_gross)
        );

        CREATE TABLE IF NOT EXISTS pay_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            frequency TEXT NOT NULL DEFAULT 'monthly',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS employee_exit_settlements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            exit_date TEXT NOT NULL,
            leave_encashment REAL DEFAULT 0,
            gratuity_estimate REAL DEFAULT 0,
            notice_pay REAL DEFAULT 0,
            other_earnings REAL DEFAULT 0,
            recoveries REAL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'draft',
            payroll_run_id INTEGER,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        ",
    );

    // Seed default PT slabs for common Indian states (flat monthly amounts simplified)
    let pt_seed: &[(&str, &str, f64, Option<f64>, f64)] = &[
        ("KA", "Karnataka", 0.0, Some(15000.0), 200.0),
        ("KA", "Karnataka", 15000.0, None, 200.0),
        ("MH", "Maharashtra", 0.0, Some(7500.0), 0.0),
        ("MH", "Maharashtra", 7500.0, Some(10000.0), 175.0),
        ("MH", "Maharashtra", 10000.0, None, 200.0),
        ("TN", "Tamil Nadu", 0.0, Some(21000.0), 0.0),
        ("TN", "Tamil Nadu", 21000.0, None, 200.0),
        ("DL", "Delhi", 0.0, None, 0.0),
    ];
    for (code, name, min_g, max_g, tax) in pt_seed {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO pt_slabs (state_code, state_name, min_gross, max_gross, monthly_tax)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![code, name, min_g, max_g, tax],
        );
    }

    let payroll_perms = [
        ("Approve Payroll", "approve-payroll", "Approve payroll runs before generation", "Payroll"),
    ];
    for (name, slug, desc, perm_group) in payroll_perms {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO permissions (name, slug, description, \"group\", created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))",
            rusqlite::params![name, slug, desc, perm_group],
        );
    }

    let settings = [
        ("ot_rate_multiplier", "1.5", "Overtime rate multiplier on hourly wage"),
        ("ot_holiday_multiplier", "2.0", "Overtime multiplier on holidays"),
        ("ot_basis", "basic", "OT wage basis: basic or gross"),
        ("payroll_require_approval", "0", "Require approval before payroll generate (0/1)"),
        ("payroll_reminder_day", "25", "Day of month to remind HR if payroll not run"),
    ];
    for (key, value, desc) in settings {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO app_settings (organization_id, key, value, description, created_at, updated_at)
             SELECT o.id, ?1, ?2, ?3, datetime('now'), datetime('now') FROM organizations o
             WHERE NOT EXISTS (
               SELECT 1 FROM app_settings a WHERE a.organization_id = o.id AND a.key = ?1
             )",
            rusqlite::params![key, value, desc],
        );
    }

    log::info!("Advanced payroll migration applied");
}

fn migrate_user_totp(conn: &rusqlite::Connection) {
    if !table_exists(conn, "users") {
        return;
    }
    if !column_exists(conn, "users", "totp_secret") {
        let _ = conn.execute("ALTER TABLE users ADD COLUMN totp_secret TEXT", []);
    }
    if !column_exists(conn, "users", "totp_enabled") {
        let _ = conn.execute(
            "ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0",
            [],
        );
    }
    if !column_exists(conn, "users", "totp_recovery_codes") {
        let _ = conn.execute("ALTER TABLE users ADD COLUMN totp_recovery_codes TEXT", []);
    }
}

fn migrate_leave_type_quota_days(conn: &rusqlite::Connection) {
    if !table_exists(conn, "leave_types") {
        return;
    }
    if !column_exists(conn, "leave_types", "quota_days") {
        let _ = conn.execute("ALTER TABLE leave_types ADD COLUMN quota_days INTEGER", []);
        log::info!("Added quota_days to leave_types");
    }
}

fn migrate_platform_release_desktop_installer(conn: &rusqlite::Connection) {
    if !table_exists(conn, "platform_releases") {
        return;
    }
    if !column_exists(conn, "platform_releases", "desktop_installer") {
        let _ = conn.execute(
            "ALTER TABLE platform_releases ADD COLUMN desktop_installer TEXT",
            [],
        );
        log::info!("Added desktop_installer to platform_releases");
    }
}
