//! Integration tests: shift schedule → attendance flags → payroll / salary (LOP & penalties).
use chrono::{Duration, NaiveDate};

use crate::db::{init_pool, run_migrations, DbPool};
use crate::handlers::payroll::build_employee_payroll;
use crate::payroll_logic;
use crate::salary_logic;
use crate::shift_logic::{self, ShiftConfig};

const TEST_ORG_SLUG: &str = "shift-att-salary-test";
const TEST_MONTH: i32 = 6;
const TEST_YEAR: i32 = 2026;
const ABSENT_DATE: &str = "2026-06-03";
const LATE_DATE: &str = "2026-06-02";

struct ModuleHarness {
    pool: DbPool,
    org_id: i64,
    user_id: i64,
}

impl ModuleHarness {
    fn new() -> Self {
        let database_url = std::env::var("TEST_DATABASE_URL")
            .or_else(|_| std::env::var("DATABASE_URL"))
            .unwrap_or_else(|_| "postgres://hrm:hrm@127.0.0.1:5433/hrm".to_string());

        let pool = init_pool(&database_url);
        run_migrations(&pool);
        let conn = pool.get_platform().expect("platform conn");

        let (org_id, user_id) = seed_org_user_shift_salary(&conn);
        Self {
            pool,
            org_id,
            user_id,
        }
    }

    fn conn(&self) -> crate::db::Connection {
        self.pool.get_platform().expect("platform conn")
    }
}

fn seed_org_user_shift_salary(conn: &crate::db::Connection) -> (i64, i64) {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

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
            crate::params!["Shift Att Salary Test Org", TEST_ORG_SLUG, &now],
        )
        .expect("insert org");
        conn.last_insert_rowid()
    };

    conn.execute(
        "INSERT INTO users (name, email, password, organization_id, is_super_admin, status, date_of_joining, created_at, updated_at)
         VALUES (?1, ?2, 'unused', ?3, 0, 'active', '2020-01-01', ?4, ?4)",
        crate::params![
            "SAS Test Employee",
            "sas-test-employee@hrm.local",
            org_id,
            &now
        ],
    )
    .expect("insert user");
    let user_id = conn.last_insert_rowid();

    let shift_name = format!("SAS-General-{org_id}");
    conn.execute(
        "INSERT INTO shift_templates
            (name, start_time, end_time, grace_in_minutes, grace_out_minutes, is_active, is_default,
             working_days_mask, organization_id, created_at, updated_at)
         VALUES (?1, '09:00:00', '18:00:00', 0, 0, 1, 1, 31, ?2, ?3, ?3)",
        crate::params![&shift_name, org_id, &now],
    )
    .expect("insert shift template");
    let shift_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO user_shift_assignments (user_id, shift_template_id, effective_from, effective_to, created_at, updated_at)
         VALUES (?1, ?2, '2020-01-01', NULL, ?3, ?3)",
        crate::params![user_id, shift_id, &now],
    )
    .expect("assign shift");

    conn.execute(
        "INSERT INTO salary_structures
            (user_id, basic_salary, hra, transport_allowance, other_allowances,
             pf_deduction, esi_deduction, tds, effective_from, created_at, updated_at)
         VALUES (?1, 20000, 5000, 2000, 3000, 0, 0, 0, '2020-01-01', ?2, ?2)",
        crate::params![user_id, &now],
    )
    .expect("insert salary");

    conn.execute(
        "INSERT INTO app_settings (organization_id, key, value, created_at, updated_at)
         VALUES (?1, 'shift_penalty_half_day_factor', '0.5', ?2, ?2)
         ON CONFLICT(organization_id, key) DO UPDATE SET value = excluded.value",
        crate::params![org_id, &now],
    )
    .ok();

    (org_id, user_id)
}

fn insert_attendance(
    conn: &crate::db::Connection,
    user_id: i64,
    date: &str,
    is_late: bool,
    is_early: bool,
) {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "INSERT INTO attendance
            (user_id, date, clock_in, clock_out, duration_minutes, is_late, is_early_exit,
             status, source, created_at, updated_at)
         VALUES (?1, ?2, '09:00:00', '18:00:00', 540, ?3, ?4, 'present', 'manual', ?5, ?5)",
        crate::params![
            user_id,
            date,
            if is_late { 1 } else { 0 },
            if is_early { 1 } else { 0 },
            &now
        ],
    )
    .expect("insert attendance");
}

fn seed_june_weekday_attendance(
    conn: &crate::db::Connection,
    user_id: i64,
    absent: &str,
    late: &str,
) {
    let mut d = NaiveDate::from_ymd_opt(TEST_YEAR, TEST_MONTH as u32, 1).unwrap();
    let end = NaiveDate::from_ymd_opt(TEST_YEAR, TEST_MONTH as u32, 30).unwrap();
    while d <= end {
        if shift_logic::is_working_day(shift_logic::DEFAULT_WORKING_DAYS_MASK, d) {
            let date_s = d.format("%Y-%m-%d").to_string();
            if date_s != absent {
                insert_attendance(conn, user_id, &date_s, date_s == late, false);
            }
        }
        d += Duration::days(1);
    }
}

fn expected_june_working_days() -> i64 {
    let mut count = 0i64;
    let mut d = NaiveDate::from_ymd_opt(TEST_YEAR, TEST_MONTH as u32, 1).unwrap();
    let end = NaiveDate::from_ymd_opt(TEST_YEAR, TEST_MONTH as u32, 30).unwrap();
    while d <= end {
        if shift_logic::is_working_day(shift_logic::DEFAULT_WORKING_DAYS_MASK, d) {
            count += 1;
        }
        d += Duration::days(1);
    }
    count
}

#[test]
fn shift_weekend_not_counted_as_working_day() {
    let sat = NaiveDate::from_ymd_opt(2026, 6, 6).unwrap();
    let mon = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
    assert!(!shift_logic::is_working_day(shift_logic::DEFAULT_WORKING_DAYS_MASK, sat));
    assert!(shift_logic::is_working_day(shift_logic::DEFAULT_WORKING_DAYS_MASK, mon));
}

#[test]
fn late_for_shift_respects_day_off_and_grace() {
    let shift = ShiftConfig {
        template_id: Some(1),
        template_name: Some("General".into()),
        start_time: "09:00:00".into(),
        end_time: "18:00:00".into(),
        grace_in_minutes: 0,
        grace_out_minutes: 0,
        working_days_mask: shift_logic::DEFAULT_WORKING_DAYS_MASK,
        is_day_off: false,
        schedule_source: "assignment".into(),
    };
    assert!(!shift_logic::late_for_shift(&shift, "09:00:00"));
    assert!(shift_logic::late_for_shift(&shift, "09:15:00"));

    let off = ShiftConfig {
        is_day_off: true,
        ..shift
    };
    assert!(!shift_logic::late_for_shift(&off, "10:30:00"));
}

#[test]
fn payroll_working_days_follow_shift_schedule() {
    let h = ModuleHarness::new();
    let conn = h.conn();
    let working = payroll_logic::working_days_for_user(&conn, h.user_id, TEST_MONTH, TEST_YEAR);
    assert_eq!(working, expected_june_working_days());
    assert_eq!(working, 22);
}

#[test]
fn present_days_count_only_completed_shift_workdays() {
    let h = ModuleHarness::new();
    let conn = h.conn();
    seed_june_weekday_attendance(&conn, h.user_id, ABSENT_DATE, LATE_DATE);

    let present =
        payroll_logic::employee_present_business_days(&conn, h.user_id, TEST_MONTH, TEST_YEAR);
    assert_eq!(present, 21);
}

#[test]
fn absent_shift_working_day_increases_lop() {
    let h = ModuleHarness::new();
    let conn = h.conn();
    seed_june_weekday_attendance(&conn, h.user_id, ABSENT_DATE, LATE_DATE);

    let lop_days =
        payroll_logic::total_lop_days_for_month(&conn, h.user_id, TEST_MONTH, TEST_YEAR);
    assert!((lop_days - 1.0).abs() < f64::EPSILON);

    let (lop_amount, breakdown) = payroll_logic::lop_amount_for_user_month(
        &conn,
        h.user_id,
        TEST_MONTH,
        TEST_YEAR,
        22,
    );
    assert!((breakdown.days - 1.0).abs() < f64::EPSILON);
    assert!(lop_amount > 0.0);
}

#[test]
fn late_attendance_feeds_suggested_shift_penalty() {
    let h = ModuleHarness::new();
    let conn = h.conn();
    seed_june_weekday_attendance(&conn, h.user_id, ABSENT_DATE, LATE_DATE);

    let salary = salary_logic::load_user_salary(&conn, h.user_id, "2026-06-30").expect("salary");
    assert!((salary.gross - 30_000.0).abs() < 0.01);

    let working = payroll_logic::working_days_for_user(&conn, h.user_id, TEST_MONTH, TEST_YEAR);
    let penalty_days = salary_logic::count_attendance_penalty_days(
        &conn,
        h.user_id,
        TEST_MONTH,
        TEST_YEAR,
    );
    assert_eq!(penalty_days, 1);

    let (days, amount) = salary_logic::suggested_shift_penalty_for_month(
        &conn,
        h.user_id,
        h.org_id,
        TEST_MONTH,
        TEST_YEAR,
        salary.lop_gross(),
        working,
    );
    assert_eq!(days, 1);
    let expected = crate::salary_split::round2(salary.lop_gross() / working as f64 * 0.5);
    assert!((amount - expected).abs() < 0.02);
}

#[test]
fn roster_day_off_suppresses_shift_penalty() {
    let h = ModuleHarness::new();
    let conn = h.conn();
    seed_june_weekday_attendance(&conn, h.user_id, ABSENT_DATE, LATE_DATE);

    let tx = conn.unchecked_transaction().expect("tx");
    shift_logic::upsert_daily_roster(&tx, h.user_id, LATE_DATE, None, true)
        .expect("roster day off");
    tx.commit().expect("commit");

    assert!(!payroll_logic::is_working_day_for_user(
        &conn,
        h.user_id,
        NaiveDate::parse_from_str(LATE_DATE, "%Y-%m-%d").unwrap()
    ));

    let penalty_days = salary_logic::count_attendance_penalty_days(
        &conn,
        h.user_id,
        TEST_MONTH,
        TEST_YEAR,
    );
    assert_eq!(penalty_days, 0);
}

#[test]
fn build_employee_payroll_wires_shift_attendance_and_salary() {
    let h = ModuleHarness::new();
    let conn = h.conn();
    seed_june_weekday_attendance(&conn, h.user_id, ABSENT_DATE, LATE_DATE);

    let payroll = build_employee_payroll(&conn, h.user_id, h.org_id, TEST_MONTH, TEST_YEAR, None)
        .expect("payroll row");

    assert_eq!(payroll["working_days"], 22);
    assert_eq!(payroll["present_days"], 21);
    assert_eq!(payroll["has_salary_structure"], true);
    assert!((payroll["lop_days"].as_f64().unwrap_or(0.0) - 1.0).abs() < f64::EPSILON);
    let lop_deduction = payroll["salary_structure"]["lop_deduction"]
        .as_f64()
        .unwrap_or(0.0);
    assert!(lop_deduction > 0.0);
    assert_eq!(payroll["penalty_days"], 1);
    assert!(payroll["suggested_shift_penalty"].as_f64().unwrap_or(0.0) > 0.0);
    assert_eq!(payroll["shift_penalty"].as_f64().unwrap_or(-1.0), 0.0);
}

#[test]
fn password_reset_update_users_via_db_layer() {
    let database_url = std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .unwrap_or_else(|_| "postgres://hrm:hrm@127.0.0.1:5433/hrm".to_string());
    let pool = init_pool(&database_url);
    let conn = pool.get_platform().expect("platform conn");

    let found = conn
        .query_row(
            "SELECT id FROM users WHERE email = ?1 LIMIT 1",
            crate::params!["info@retaildaddy.in"],
            |r| r.get_idx::<i64>(0),
        )
        .expect("query email");
    assert!(found > 0, "user id={found}");

    let new_hash = bcrypt::hash("Guru!1234", 12).expect("hash");
    let now = chrono::Utc::now().naive_utc();
    let rows = conn
        .execute(
            "UPDATE users SET password = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
            crate::params![new_hash, now, found],
        )
        .expect("update should succeed");
    assert!(rows > 0, "expected at least one row updated, got {rows}");
}
