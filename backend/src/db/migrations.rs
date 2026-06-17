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

/// Run all SQLite migrations. The existing SQLite database from Laravel is used directly,
/// so we only need to ensure our extra tables (e.g. jwt_refresh_tokens) exist.
pub fn run_sqlite_migrations(pool: &DbPool) {
    let sqlite_pool = match pool {
        DbPool::Sqlite(p) => p,
        DbPool::Postgres(_) => return,
    };
    let pooled = sqlite_pool.get().expect("Failed to get connection for migrations");
    let db = crate::db::Connection::sqlite(pooled);
    let conn = db.sqlite_conn();

    // The existing Laravel database already has all tables.
    // We only add tables that Rust-specific features need.
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS jwt_refresh_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            revoked INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_jwt_refresh_tokens_user_id ON jwt_refresh_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_jwt_refresh_tokens_token ON jwt_refresh_tokens(token);

        -- Centers (settings)
        CREATE TABLE IF NOT EXISTS centers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT,
            address TEXT,
            city TEXT,
            state TEXT,
            country TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        -- App Settings (key-value config)
        CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL UNIQUE,
            value TEXT,
            type TEXT NOT NULL DEFAULT 'text',
            description TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Shift templates (Phase 1)
        CREATE TABLE IF NOT EXISTS shift_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            start_time TEXT NOT NULL DEFAULT '09:00:00',
            end_time TEXT NOT NULL DEFAULT '18:00:00',
            grace_in_minutes INTEGER NOT NULL DEFAULT 0,
            grace_out_minutes INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        -- User-level shift assignment (Phase 1)
        CREATE TABLE IF NOT EXISTS user_shift_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            shift_template_id INTEGER NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
            effective_from TEXT NOT NULL,
            effective_to TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_user_shift_user_date
            ON user_shift_assignments(user_id, effective_from, effective_to);
        ",
    )
    .expect("Failed to run migrations");

    // Add new ATS columns to job_applications (ignore errors if they already exist)
    let extra_columns = [
        "ALTER TABLE job_applications ADD COLUMN applied_position TEXT;",
        "ALTER TABLE job_applications ADD COLUMN experience_years INTEGER;",
        "ALTER TABLE job_applications ADD COLUMN expected_salary TEXT;",
        "ALTER TABLE job_applications ADD COLUMN dob TEXT;",
        "ALTER TABLE job_applications ADD COLUMN ats_score INTEGER;",
        "ALTER TABLE job_applications ADD COLUMN ats_feedback TEXT;",
    ];

    for col_sql in extra_columns.iter() {
        let _ = conn.execute(col_sql, []);
    }

    // ── Biometric Integration Tables ──
    conn.execute_batch(
        "
        -- Registered biometric devices
        CREATE TABLE IF NOT EXISTS biometric_devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            serial_number TEXT NOT NULL UNIQUE,
            name TEXT DEFAULT 'BIO-PARK D01',
            model TEXT DEFAULT 'D01',
            ip_address TEXT,
            location TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            last_heartbeat TEXT,
            firmware_version TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Raw punch logs from biometric device (immutable audit trail)
        CREATE TABLE IF NOT EXISTS biometric_punches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_serial TEXT NOT NULL,
            device_pin TEXT NOT NULL,
            punch_time TEXT NOT NULL,
            punch_type INTEGER NOT NULL DEFAULT 0,
            verify_method INTEGER DEFAULT 0,
            user_id INTEGER REFERENCES users(id),
            is_processed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_bio_punches_device ON biometric_punches(device_serial);
        CREATE INDEX IF NOT EXISTS idx_bio_punches_time ON biometric_punches(punch_time);
        CREATE INDEX IF NOT EXISTS idx_bio_punches_user ON biometric_punches(user_id);

        -- Mapping: device PIN → HRM user
        CREATE TABLE IF NOT EXISTS biometric_user_map (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_serial TEXT NOT NULL,
            device_pin TEXT NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id),
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(device_serial, device_pin)
        );

        -- Command queue for sending instructions to devices
        CREATE TABLE IF NOT EXISTS biometric_commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_serial TEXT NOT NULL,
            command TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            result TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            executed_at TEXT
        );
        ",
    )
    .expect("Failed to run biometric migrations");

    // Add source column to attendance table (ignore if already exists)
    let _ = conn.execute("ALTER TABLE attendance ADD COLUMN source TEXT DEFAULT 'manual'", []);

    // Empty employee_id strings violate UNIQUE when multiple users have no ID
    let _ = conn.execute("UPDATE users SET employee_id = NULL WHERE employee_id = ''", []);

    // Default shift flag (auto-assign unassigned employees to this template)
    let _ = conn.execute(
        "ALTER TABLE shift_templates ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let default_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM shift_templates WHERE is_default = 1",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0);
    if default_count == 0 {
        let _ = conn.execute(
            "UPDATE shift_templates SET is_default = 1
             WHERE id = (
                 SELECT id FROM shift_templates
                 WHERE LOWER(name) = 'general'
                 ORDER BY id ASC
                 LIMIT 1
             )",
            [],
        );
    }

    // Merge duplicate general/General templates, then assign unassigned employees
    crate::shift_logic::consolidate_duplicate_general_shifts(&db);
    crate::shift_logic::backfill_general_shift_assignments(&db);

    let _ = conn.execute(
        "ALTER TABLE shift_templates ADD COLUMN working_days_mask INTEGER NOT NULL DEFAULT 31",
        [],
    );

    let _ = conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS shift_daily_roster (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            roster_date TEXT NOT NULL,
            shift_template_id INTEGER REFERENCES shift_templates(id) ON DELETE SET NULL,
            is_day_off INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, roster_date)
        );
        CREATE INDEX IF NOT EXISTS idx_shift_daily_roster_date
            ON shift_daily_roster(roster_date);
        CREATE INDEX IF NOT EXISTS idx_shift_daily_roster_user_date
            ON shift_daily_roster(user_id, roster_date);
        ",
    );

    let payslip_cols = [
        "ALTER TABLE payslips ADD COLUMN adjustments TEXT;",
        "ALTER TABLE payslips ADD COLUMN generated_at TEXT;",
        "ALTER TABLE payslips ADD COLUMN shift_penalty REAL DEFAULT 0;",
    ];
    for sql in payslip_cols {
        let _ = conn.execute(sql, []);
    }

    let _ = conn.execute(
        "INSERT OR IGNORE INTO app_settings (key, value, type, description, created_at, updated_at)
         VALUES ('annual_leave_quota', '12', 'number', 'Annual leave days per employee', datetime('now'), datetime('now'))",
        [],
    );

    let _ = conn.execute(
        "INSERT OR IGNORE INTO app_settings (key, value, type, description, created_at, updated_at)
         VALUES ('msg91_whatsapp_sender', '', 'text', 'MSG91 WhatsApp integrated number/sender ID', datetime('now'), datetime('now'))",
        [],
    );

    let _ = conn.execute(
        "INSERT OR IGNORE INTO permissions (name, slug, description, \"group\", created_at, updated_at)
         VALUES ('Manage Payroll', 'manage-payroll', 'Generate, preview, and unlock payslips', 'Payroll', datetime('now'), datetime('now'))",
        [],
    );

    // Laravel salary_components uses `type`; Rust code expects `component_type`, `slug`, etc.
    let salary_component_cols = [
        "ALTER TABLE salary_components ADD COLUMN slug TEXT;",
        "ALTER TABLE salary_components ADD COLUMN component_type TEXT;",
        "ALTER TABLE salary_components ADD COLUMN default_value REAL;",
        "ALTER TABLE salary_components ADD COLUMN is_taxable INTEGER;",
    ];
    for sql in salary_component_cols {
        let _ = conn.execute(sql, []);
    }
    let _ = conn.execute(
        "UPDATE salary_components SET component_type = type WHERE component_type IS NULL AND type IS NOT NULL",
        [],
    );
    let _ = conn.execute(
        "UPDATE salary_components SET slug = LOWER(REPLACE(name, ' ', '_')) WHERE slug IS NULL OR slug = ''",
        [],
    );
    let _ = conn.execute(
        "UPDATE salary_components SET default_value = amount WHERE default_value IS NULL AND amount IS NOT NULL",
        [],
    );
    let _ = conn.execute(
        "UPDATE salary_components SET is_taxable = COALESCE(is_pre_tax, 0) WHERE is_taxable IS NULL",
        [],
    );
    // Reimbursements used calculation_type='reimbursement' as a marker; store real calc separately.
    let _ = conn.execute(
        "UPDATE salary_components SET
            type = 'reimbursement',
            component_type = 'reimbursement',
            calculation_type = 'flat_amount'
         WHERE calculation_type = 'reimbursement'",
        [],
    );
    let _ = conn.execute(
        "UPDATE salary_components SET
            type = 'reimbursement',
            component_type = 'reimbursement'
         WHERE reimbursement_type IS NOT NULL
           AND COALESCE(component_type, type) NOT IN ('reimbursement')",
        [],
    );
    let _ = conn.execute(
        "UPDATE salary_components SET earning_type = name
         WHERE COALESCE(component_type, type) = 'earning'
           AND (earning_type IS NULL OR earning_type IN ('flat_amount', 'percentage_of_basic'))",
        [],
    );

    // ── Phase 1–4: CTC templates, profiles, advances, extended payslip ──
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS salary_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            basic_pct REAL NOT NULL DEFAULT 50,
            hra_pct REAL NOT NULL DEFAULT 35,
            conv_pct REAL NOT NULL DEFAULT 15,
            special_pct REAL NOT NULL DEFAULT 0,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS employee_salary_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            yearly_ctc REAL NOT NULL DEFAULT 0,
            template_id INTEGER REFERENCES salary_templates(id),
            pf_applicable INTEGER NOT NULL DEFAULT 1,
            esi_applicable INTEGER NOT NULL DEFAULT 1,
            effective_from TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_emp_salary_profile_user
            ON employee_salary_profiles(user_id, effective_from);

        CREATE TABLE IF NOT EXISTS employee_advances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount REAL NOT NULL,
            balance REAL NOT NULL,
            monthly_emi REAL NOT NULL DEFAULT 0,
            description TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_employee_advances_user ON employee_advances(user_id);
        ",
    )
    .expect("salary template migrations");

    let _ = conn.execute(
        "INSERT OR IGNORE INTO salary_templates (name, basic_pct, hra_pct, conv_pct, special_pct, is_default)
         VALUES ('Standard (50/35/15)', 50, 35, 15, 0, 1)",
        [],
    );

    expand_salary_component_calculation_types(&conn);

    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS leave_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            payment_type TEXT NOT NULL DEFAULT 'paid' CHECK (payment_type IN ('paid', 'unpaid', 'half_day')),
            counts_toward_quota INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT,
            updated_at TEXT
        );",
    );

    let default_leave_types = [
        ("sick", "Sick Leave", "paid", 0),
        ("annual", "Annual Leave", "paid", 1),
        ("personal", "Personal Leave", "paid", 0),
        ("unpaid", "Unpaid Leave", "unpaid", 0),
        ("emergency", "Emergency Leave", "paid", 0),
    ];
    for (slug, name, payment, quota) in default_leave_types {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO leave_types (slug, name, payment_type, counts_toward_quota, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 1, datetime('now'), datetime('now'))",
            rusqlite::params![slug, name, payment, quota],
        );
    }
    let _ = conn.execute(
        "UPDATE leave_types SET payment_type='unpaid' WHERE slug='unpaid'",
        [],
    );

    let payslip_ext_cols = [
        "ALTER TABLE payslips ADD COLUMN lop_basic REAL DEFAULT 0;",
        "ALTER TABLE payslips ADD COLUMN lop_hra REAL DEFAULT 0;",
        "ALTER TABLE payslips ADD COLUMN lop_transport REAL DEFAULT 0;",
        "ALTER TABLE payslips ADD COLUMN lop_other REAL DEFAULT 0;",
        "ALTER TABLE payslips ADD COLUMN prof_tax REAL DEFAULT 0;",
        "ALTER TABLE payslips ADD COLUMN advance_deduction REAL DEFAULT 0;",
        "ALTER TABLE payslips ADD COLUMN lw_employee REAL DEFAULT 0;",
        "ALTER TABLE payslips ADD COLUMN payroll_detail TEXT;",
    ];
    for sql in payslip_ext_cols {
        let _ = conn.execute(sql, []);
    }

    let _ = conn.execute(
        "INSERT OR IGNORE INTO permission_role (permission_id, role_id, created_at, updated_at)
         SELECT p_manage.id, pr.role_id, datetime('now'), datetime('now')
         FROM permissions p_manage
         JOIN permission_role pr ON 1=1
         JOIN permissions p_view ON p_view.id = pr.permission_id AND p_view.slug = 'view-payroll'
         WHERE p_manage.slug = 'manage-payroll'
           AND NOT EXISTS (
               SELECT 1 FROM permission_role x
               WHERE x.permission_id = p_manage.id AND x.role_id = pr.role_id
           )",
        [],
    );

    // Statutory settings (organization-scoped after SaaS migration)
    run_saas_migrations(&conn);

    let statutory_settings = [
        ("pf_wage_ceiling", "15000", "PF wage ceiling"),
        ("pf_employee_rate", "0.12", "PF employee rate"),
        ("pf_employer_rate", "0.12", "PF employer rate"),
        ("esi_gross_ceiling", "21000", "ESI gross ceiling"),
        ("esi_employee_rate", "0.0075", "ESI employee rate"),
        ("esi_employer_rate", "0.0325", "ESI employer rate"),
        ("esi_admin_rate", "0", "ESI admin rate"),
        ("prof_tax_default", "200", "Default professional tax"),
        ("lw_employee", "50", "Labour welfare employee"),
        ("lw_employer", "50", "Labour welfare employer"),
    ];
    for (key, value, desc) in statutory_settings {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO app_settings (organization_id, key, value, type, description, created_at, updated_at)
             VALUES (1, ?1, ?2, 'number', ?3, datetime('now'), datetime('now'))",
            rusqlite::params![key, value, desc],
        );
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS user_presence (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            ip_address TEXT,
            latitude REAL,
            longitude REAL,
            city TEXT,
            region TEXT,
            country TEXT,
            last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_user_presence_org ON user_presence(organization_id);
        CREATE INDEX IF NOT EXISTS idx_user_presence_last_active ON user_presence(last_active_at);
        ",
    )
    .expect("user_presence migration failed");

    let _ = conn.execute(
        "ALTER TABLE user_presence ADD COLUMN accuracy_meters REAL",
        [],
    );

    migrate_chat_module(&conn);
    migrate_platform_admin_extras(&conn);
    migrate_platform_billing(&conn);
    migrate_platform_support(&conn);
    migrate_platform_announcement_extras(&conn);
    migrate_org_notifications(&conn);
    migrate_org_notification_extras(&conn);
    migrate_subscription_plan_module_catalog(&conn);
    crate::subscription_period::backfill_org_subscriptions(&db);
    crate::plan_limits::seed_all_permissions(&db);
    crate::role_defaults::sync_role_defaults(&db);

    log::info!("✅ Database migrations completed");
}

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
                 VALUES (?1, 'shift_penalty_half_day_factor', '0.5', 'number', 'Half-day wage factor per late/early attendance mark', datetime('now'), datetime('now'))",
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
