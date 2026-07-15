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

CREATE TABLE IF NOT EXISTS payroll_variable_items (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    item_type TEXT NOT NULL,
    label TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL DEFAULT 'approved',
    notes TEXT,
    created_by BIGINT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reimbursement_claims (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    salary_component_id BIGINT,
    claim_month INTEGER NOT NULL,
    claim_year INTEGER NOT NULL,
    title TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    receipt_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by BIGINT,
    reviewed_at TEXT,
    review_notes TEXT,
    payroll_month INTEGER,
    payroll_year INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll_runs (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    run_type TEXT NOT NULL DEFAULT 'monthly',
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    pay_group_id BIGINT,
    status TEXT NOT NULL DEFAULT 'draft',
    prepared_by BIGINT,
    reviewed_by BIGINT,
    approved_by BIGINT,
    released_by BIGINT,
    prepared_at TEXT,
    reviewed_at TEXT,
    approved_at TEXT,
    released_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll_audit_log (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    payroll_run_id BIGINT,
    actor_user_id BIGINT,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_tax_declarations (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    financial_year TEXT NOT NULL,
    regime TEXT NOT NULL DEFAULT 'new',
    declarations_json TEXT NOT NULL DEFAULT '{}',
    hra_rent_paid DOUBLE PRECISION DEFAULT 0,
    hra_metro INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, financial_year)
);

CREATE TABLE IF NOT EXISTS pt_slabs (
    id BIGSERIAL PRIMARY KEY,
    state_code TEXT NOT NULL,
    state_name TEXT NOT NULL,
    min_gross DOUBLE PRECISION NOT NULL DEFAULT 0,
    max_gross DOUBLE PRECISION,
    monthly_tax DOUBLE PRECISION NOT NULL,
    effective_from TEXT,
    UNIQUE(state_code, min_gross)
);

CREATE TABLE IF NOT EXISTS pay_groups (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'monthly',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_exit_settlements (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exit_date TEXT NOT NULL,
    leave_encashment DOUBLE PRECISION DEFAULT 0,
    gratuity_estimate DOUBLE PRECISION DEFAULT 0,
    notice_pay DOUBLE PRECISION DEFAULT 0,
    other_earnings DOUBLE PRECISION DEFAULT 0,
    recoveries DOUBLE PRECISION DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    payroll_run_id BIGINT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS payroll_hold INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS payroll_hold_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS payroll_hold_until TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pay_group_id BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_ifsc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_state TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_regime TEXT DEFAULT 'new';

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS payroll_run_id BIGINT;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS ot_hours DOUBLE PRECISION DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS ot_amount DOUBLE PRECISION DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS variable_pay_amount DOUBLE PRECISION DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS reimbursement_amount DOUBLE PRECISION DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS arrears_amount DOUBLE PRECISION DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS employer_cost_json TEXT;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_person TEXT;

CREATE TABLE IF NOT EXISTS user_presence (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ip_address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    city TEXT,
    region TEXT,
    country TEXT,
    accuracy_meters DOUBLE PRECISION,
    last_active_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_presence_org ON user_presence(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_presence_last_active ON user_presence(last_active_at);

ALTER TABLE departments ADD COLUMN IF NOT EXISTS center_id INTEGER REFERENCES centers(id);
CREATE INDEX IF NOT EXISTS idx_departments_center ON departments(organization_id, center_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_org_center_slug ON departments(organization_id, center_id, slug);

CREATE TABLE IF NOT EXISTS doctor_reports (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    employee_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consultation_date DATE NOT NULL,
    subjective TEXT NOT NULL DEFAULT '',
    objective TEXT NOT NULL DEFAULT '',
    assessment TEXT NOT NULL DEFAULT '',
    plan TEXT NOT NULL DEFAULT '',
    prescription_notes TEXT,
    prescription_path TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_doctor_reports_org_employee ON doctor_reports(organization_id, employee_user_id);
CREATE INDEX IF NOT EXISTS idx_doctor_reports_org_date ON doctor_reports(organization_id, consultation_date DESC);

CREATE TABLE IF NOT EXISTS grocery_benefits (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date TEXT NOT NULL,
    subsidy_percentage INTEGER NOT NULL DEFAULT 50,
    monthly_allowance DOUBLE PRECISION NOT NULL DEFAULT 5000,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_grocery_benefits_org ON grocery_benefits(organization_id);
CREATE INDEX IF NOT EXISTS idx_grocery_benefits_user ON grocery_benefits(user_id);

CREATE TABLE IF NOT EXISTS grocery_claims (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    benefit_id INTEGER NOT NULL REFERENCES grocery_benefits(id) ON DELETE CASCADE,
    claim_month INTEGER NOT NULL,
    claim_year INTEGER NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    company_share DOUBLE PRECISION NOT NULL DEFAULT 0,
    employee_share DOUBLE PRECISION NOT NULL DEFAULT 0,
    is_free_month INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    receipt_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TEXT,
    review_notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_grocery_claims_org ON grocery_claims(organization_id);
CREATE INDEX IF NOT EXISTS idx_grocery_claims_user ON grocery_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_grocery_claims_benefit ON grocery_claims(benefit_id);
CREATE INDEX IF NOT EXISTS idx_grocery_claims_month ON grocery_claims(claim_year, claim_month);

CREATE TABLE IF NOT EXISTS assets (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    identifier TEXT,
    status TEXT NOT NULL DEFAULT 'available',
    purchase_date TEXT,
    purchase_cost DOUBLE PRECISION,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_assets_org ON assets(organization_id);

CREATE TABLE IF NOT EXISTS asset_allocations (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    allocated_date TEXT NOT NULL,
    return_date TEXT,
    allocation_condition TEXT,
    return_condition TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_asset_allocations_org ON asset_allocations(organization_id);
CREATE INDEX IF NOT EXISTS idx_asset_allocations_asset ON asset_allocations(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_allocations_user ON asset_allocations(user_id);

CREATE TABLE IF NOT EXISTS asset_expenses (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    expense_type TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    expense_date TEXT NOT NULL,
    description TEXT,
    receipt_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_asset_expenses_org ON asset_expenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_asset_expenses_asset ON asset_expenses(asset_id);
