use crate::db::DbPool;

/// Run all migrations. The existing SQLite database from Laravel is used directly,
/// so we only need to ensure our extra tables (e.g. jwt_refresh_tokens) exist.
pub fn run_migrations(pool: &DbPool) {
    let conn = pool.get().expect("Failed to get connection for migrations");

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

        -- Campaigns
        CREATE TABLE IF NOT EXISTS campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            is_public INTEGER NOT NULL DEFAULT 0,
            success_message TEXT,
            redirect_url TEXT,
            form_fields TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Leads
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT,
            email TEXT,
            phone TEXT,
            mobile TEXT,
            status TEXT NOT NULL DEFAULT 'new',
            source TEXT,
            campaign_id INTEGER REFERENCES campaigns(id),
            assigned_to INTEGER REFERENCES users(id),
            notes TEXT,
            custom_fields TEXT,
            converted_contact_id INTEGER,
            converted_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Contacts
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            company TEXT,
            position TEXT,
            type TEXT NOT NULL DEFAULT 'individual',
            status TEXT NOT NULL DEFAULT 'active',
            notes TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Deals
        CREATE TABLE IF NOT EXISTS deals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            stage TEXT NOT NULL DEFAULT 'lead',
            value REAL,
            currency TEXT NOT NULL DEFAULT 'INR',
            probability INTEGER NOT NULL DEFAULT 0,
            expected_close_date TEXT,
            actual_close_date TEXT,
            loss_reason TEXT,
            notes TEXT,
            company_id INTEGER,
            contact_id INTEGER REFERENCES contacts(id),
            project_id INTEGER REFERENCES projects(id),
            campaign_id INTEGER REFERENCES campaigns(id),
            lead_id INTEGER REFERENCES leads(id),
            assigned_to INTEGER REFERENCES users(id),
            created_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

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

    log::info!("✅ Database migrations completed");
}
