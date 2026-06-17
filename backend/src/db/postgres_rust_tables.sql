CREATE TABLE IF NOT EXISTS jwt_refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_jwt_refresh_tokens_user_id ON jwt_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_jwt_refresh_tokens_token ON jwt_refresh_tokens(token);

CREATE TABLE IF NOT EXISTS centers (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    code TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL DEFAULT 1 REFERENCES organizations(id),
    key TEXT NOT NULL,
    value TEXT,
    type TEXT NOT NULL DEFAULT 'text',
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, key)
);
CREATE INDEX IF NOT EXISTS idx_app_settings_org ON app_settings(organization_id);

CREATE TABLE IF NOT EXISTS shift_templates (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL DEFAULT '09:00:00',
    end_time TEXT NOT NULL DEFAULT '18:00:00',
    grace_in_minutes INTEGER NOT NULL DEFAULT 0,
    grace_out_minutes INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_shift_assignments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shift_template_id INTEGER NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_shift_user_date ON user_shift_assignments(user_id, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS biometric_devices (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL DEFAULT 1,
    serial_number TEXT NOT NULL UNIQUE,
    name TEXT DEFAULT 'BIO-PARK D01',
    model TEXT DEFAULT 'D01',
    ip_address TEXT,
    location TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_heartbeat TEXT,
    firmware_version TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS biometric_punches (
    id SERIAL PRIMARY KEY,
    device_serial TEXT NOT NULL,
    device_pin TEXT NOT NULL,
    punch_time TEXT NOT NULL,
    punch_type INTEGER NOT NULL DEFAULT 0,
    verify_method INTEGER DEFAULT 0,
    user_id INTEGER REFERENCES users(id),
    is_processed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bio_punches_device ON biometric_punches(device_serial);
CREATE INDEX IF NOT EXISTS idx_bio_punches_time ON biometric_punches(punch_time);
CREATE INDEX IF NOT EXISTS idx_bio_punches_user ON biometric_punches(user_id);

CREATE TABLE IF NOT EXISTS biometric_user_map (
    id SERIAL PRIMARY KEY,
    device_serial TEXT NOT NULL,
    device_pin TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_serial, device_pin)
);

CREATE TABLE IF NOT EXISTS biometric_commands (
    id SERIAL PRIMARY KEY,
    device_serial TEXT NOT NULL,
    command TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    result TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    executed_at TEXT
);

CREATE TABLE IF NOT EXISTS subscription_plans (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    price_label TEXT NOT NULL DEFAULT 'Free',
    billing_period TEXT NOT NULL DEFAULT 'month',
    max_users INTEGER NOT NULL DEFAULT 10,
    modules TEXT NOT NULL DEFAULT '[]',
    features TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leave_credits (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    days INTEGER NOT NULL DEFAULT 1,
    reason TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    work_date TEXT,
    year INTEGER NOT NULL,
    created_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT
);

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

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_person TEXT;
