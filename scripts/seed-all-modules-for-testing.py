#!/usr/bin/env python3
"""
Seed all MODULE_CATALOG modules + dedicated role users for real testing.

Targets the mashuptech tenant (org 1) by default:
  - Ensures Enterprise plan exists with every catalog module
  - Points the org at Enterprise with a far-future expiry
  - Creates Manager / HR / Doctor / Branch Admin / Employee seed users
  - Seeds sample records across thin modules (tagged SeedTest)

Usage (from repo root):
  python scripts/seed-all-modules-for-testing.py
  python scripts/seed-all-modules-for-testing.py --org-slug mashuptech

Env:
  HRM_API, HRM_EMAIL, HRM_PASSWORD, HRM_ORG_SLUG
  PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta

API = os.environ.get("HRM_API", "http://127.0.0.1:3001").rstrip("/")
ADMIN_EMAIL = os.environ.get("HRM_EMAIL", "info@retaildaddy.in")
ADMIN_PASSWORD = os.environ.get("HRM_PASSWORD", "Guru!1234")
ORG_SLUG = os.environ.get("HRM_ORG_SLUG", "mashuptech")
PLATFORM_EMAIL = os.environ.get("PLATFORM_ADMIN_EMAIL", "admin@retaildaddy.in")
PLATFORM_PASSWORD = os.environ.get("PLATFORM_ADMIN_PASSWORD", "LocalTest123!")

# Must match backend/src/plan_limits.rs MODULE_CATALOG keys.
ALL_MODULES = [
    "dashboard",
    "users",
    "centers",
    "departments",
    "designations",
    "careers",
    "job_applications",
    "chat",
    "attendance",
    "shifts",
    "biometric",
    "manual_attendance",
    "leave",
    "leave_manage",
    "holidays",
    "payroll",
    "my_payslips",
    "doctor_reports",
    "my_doctor_reports",
    "grocery_benefits",
    "my_grocery_benefits",
    "assets",
    "my_assets",
    "workflows",
    "tasks",
    "projects",
    "reports",
    "subscription",
    "notifications",
    "support",
    "settings",
]

SEED_PASSWORD = "TestSeed123!"
TAG = "SeedTest"


def req(method: str, path: str, token: str | None = None, body: dict | None = None, timeout: int = 60):
    url = path if path.startswith("http") else f"{API}{path}"
    data = None if body is None else json.dumps(body).encode()
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"message": raw}
        return e.code, payload


def ok(status: int) -> bool:
    return 200 <= status < 300


def log(msg: str) -> None:
    print(f"  {msg}")


def psql(sql: str) -> str:
    """Run SQL against local docker Postgres (hrm-postgres-1)."""
    result = subprocess.run(
        [
            "docker",
            "exec",
            "-i",
            "hrm-postgres-1",
            "psql",
            "-U",
            "hrm",
            "-d",
            "hrm",
            "-v",
            "ON_ERROR_STOP=1",
            "-t",
            "-A",
            "-c",
            sql,
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"psql failed: {result.stderr or result.stdout}")
    return (result.stdout or "").strip()


def ensure_enterprise_plan(org_id: int) -> None:
    modules_json = json.dumps(ALL_MODULES).replace("'", "''")
    features_json = json.dumps(
        ["Unlimited users", "All modules", "Priority support", "Real-testing seed"]
    ).replace("'", "''")
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    expires = (datetime.utcnow() + timedelta(days=3650)).strftime("%Y-%m-%d %H:%M:%S")

    log("Upserting Enterprise plan with full MODULE_CATALOG…")
    psql(
        f"""
        INSERT INTO subscription_plans
          (name, slug, price_label, billing_period, max_users, modules, features, is_active, sort_order, created_at, updated_at)
        VALUES
          ('Enterprise', 'enterprise', 'Custom', 'year', 9999, '{modules_json}', '{features_json}', 1, 4, '{now}', '{now}')
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          modules = EXCLUDED.modules,
          features = EXCLUDED.features,
          max_users = EXCLUDED.max_users,
          is_active = 1,
          updated_at = EXCLUDED.updated_at;

        -- Keep Professional fully unlocked too (real-testing convenience).
        UPDATE subscription_plans
        SET modules = '{modules_json}', updated_at = '{now}'
        WHERE slug = 'professional';

        UPDATE organizations
        SET plan = 'enterprise',
            status = 'active',
            plan_started_at = COALESCE(plan_started_at, '{now}'),
            plan_expires_at = '{expires}',
            updated_at = '{now}'
        WHERE id = {org_id};
        """
    )
    log(f"Org {org_id} → plan=enterprise, expires={expires}")


def login_tenant(email: str, password: str, org_slug: str) -> str:
    status, data = req(
        "POST",
        "/api/auth/login",
        body={"email": email, "password": password, "org_slug": org_slug},
    )
    if not ok(status) or not data.get("data", {}).get("token"):
        raise RuntimeError(f"Tenant login failed for {email}: {status} {data}")
    return data["data"]["token"]


def login_platform() -> str:
    status, data = req(
        "POST",
        "/api/platform/auth/login",
        body={"email": PLATFORM_EMAIL, "password": PLATFORM_PASSWORD},
    )
    if not ok(status) or not data.get("data", {}).get("token"):
        raise RuntimeError(f"Platform login failed: {status} {data}")
    return data["data"]["token"]


def get_json_list(token: str, path: str) -> list:
    status, data = req("GET", path, token=token)
    if not ok(status):
        return []
    payload = data.get("data", data)
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        inner = payload.get("data")
        if isinstance(inner, list):
            return inner
    return []


def find_user_by_email(token: str, email: str) -> dict | None:
    users = get_json_list(token, "/api/admin/users/list")
    email_l = email.lower()
    for u in users:
        if str(u.get("email", "")).lower() == email_l:
            return u
    return None


def ensure_user(
    token: str,
    *,
    name: str,
    email: str,
    role_id: int,
    department_id: int | None,
    designation_id: int | None,
    manager_id: int | None,
    work_location: str | None,
) -> int:
    existing = find_user_by_email(token, email)
    if existing:
        uid = int(existing["id"])
        # Ensure role + manager link via SQL (idempotent for testing).
        psql(
            f"""
            INSERT INTO role_user (user_id, role_id, created_at, updated_at)
            SELECT {uid}, {role_id}, NOW(), NOW()
            WHERE NOT EXISTS (
              SELECT 1 FROM role_user WHERE user_id = {uid} AND role_id = {role_id}
            );
            UPDATE users SET
              manager_id = COALESCE({manager_id if manager_id else 'NULL'}, manager_id),
              reporting_manager_id = COALESCE({manager_id if manager_id else 'NULL'}, reporting_manager_id),
              department_id = COALESCE({department_id if department_id else 'NULL'}, department_id),
              designation_id = COALESCE({designation_id if designation_id else 'NULL'}, designation_id),
              status = 'active',
              updated_at = NOW()
            WHERE id = {uid};
            """
        )
        log(f"User exists: {email} (id={uid}) — role/manager refreshed")
        return uid

    body = {
        "name": name,
        "email": email,
        "password": SEED_PASSWORD,
        "password_confirmation": SEED_PASSWORD,
        "status": "active",
        "employment_type": "full-time",
        "date_of_joining": "2025-01-01",
        "role_ids": [role_id],
        "department_id": department_id,
        "designation_id": designation_id,
        "manager_id": manager_id,
        "reporting_manager_id": manager_id,
        "work_location": work_location,
        "phone": "+919900001111",
    }
    status, data = req("POST", "/api/admin/users", token=token, body=body)
    if not ok(status):
        raise RuntimeError(f"Create user {email} failed: {status} {data}")
    uid = int(data.get("data", {}).get("id") or data.get("data", {}).get("user", {}).get("id") or 0)
    if not uid:
        # Fallback: re-fetch
        created = find_user_by_email(token, email)
        if not created:
            raise RuntimeError(f"User {email} created but id not found")
        uid = int(created["id"])
    log(f"Created user: {email} (id={uid})")
    return uid


def post_ok(token: str, path: str, body: dict, label: str) -> None:
    status, data = req("POST", path, token=token, body=body)
    if ok(status):
        log(f"[OK] {label}")
    else:
        msg = data.get("message") or data
        log(f"[SKIP] {label}: {status} {msg}")


def seed_module_samples(
    token: str,
    *,
    employee_id: int,
    doctor_id: int,
    manager_id: int,
    center_id: int | None,
) -> None:
    today = date.today()
    future = today + timedelta(days=45)
    future2 = future + timedelta(days=2)
    stamp = datetime.utcnow().strftime("%Y%m%d%H%M")

    # Centers first (departments require center_id)
    post_ok(
        token,
        "/api/admin/settings/centers",
        {
            "name": f"{TAG} Branch {stamp}",
            "code": f"ST{stamp[-6:]}",
            "city": "Bengaluru",
            "state": "KA",
            "country": "IN",
            "address_line1": "Seed Street 1",
        },
        "Branch/Center",
    )
    seed_center_id = center_id
    if not seed_center_id:
        centers = get_json_list(token, "/api/admin/settings/centers")
        if centers:
            seed_center_id = int(centers[0]["id"])
    post_ok(
        token,
        "/api/admin/departments",
        {
            "name": f"{TAG} Dept {stamp}",
            "description": "Seeded for real testing",
            "center_id": seed_center_id or 0,
            "is_active": True,
        },
        "Department",
    )
    post_ok(
        token,
        "/api/admin/designations",
        {"name": f"{TAG} Desig {stamp}", "description": "Seeded for real testing"},
        "Designation",
    )

    # Holidays
    hol_date = (today + timedelta(days=120)).isoformat()
    post_ok(
        token,
        "/api/admin/holidays",
        {"name": f"{TAG} Holiday {stamp}", "date": hol_date, "description": "Seed holiday", "is_paid": True},
        "Holiday",
    )

    # Projects / tasks
    status, proj = req(
        "POST",
        "/api/admin/projects",
        token=token,
        body={
            "name": f"{TAG} Project {stamp}",
            "description": "Seeded project",
            "status": "in_progress",
            "priority": "medium",
            "start_date": today.isoformat(),
        },
    )
    project_id = None
    if ok(status):
        project_id = (proj.get("data") or {}).get("id")
        log(f"[OK] Project id={project_id}")
    else:
        log(f"[SKIP] Project: {status} {proj.get('message')}")

    post_ok(
        token,
        "/api/admin/tasks",
        {
            "title": f"{TAG} Task {stamp}",
            "description": "Seeded task assigned to employee",
            "status": "todo",
            "priority": "high",
            "type": "development",
            "assigned_to": employee_id,
            "project_id": project_id,
            "due_date": future.isoformat(),
        },
        "Task",
    )

    # Workflow
    post_ok(
        token,
        "/api/admin/workflows",
        {
            "name": f"{TAG} WF leave notify {stamp}",
            "description": "Seeded workflow",
            "trigger_type": "leave_request_submitted",
            "is_active": True,
            "actions": [{"type": "create_task", "title": "Review leave", "assigned_to": manager_id}],
        },
        "Workflow",
    )

    # Assets
    status, asset = req(
        "POST",
        "/api/admin/assets",
        token=token,
        body={
            "name": f"{TAG} Laptop {stamp}",
            "asset_type": "laptop",
            "identifier": f"ST-LAP-{stamp[-6:]}",
            "status": "available",
            "purchase_date": "2025-06-01",
            "purchase_cost": 55000,
            "notes": "Seed asset",
        },
    )
    asset_id = (asset.get("data") or {}).get("id") if ok(status) else None
    if asset_id:
        log(f"[OK] Asset id={asset_id}")
        post_ok(
            token,
            "/api/admin/asset-allocations",
            {
                "asset_id": asset_id,
                "user_id": employee_id,
                "allocated_date": today.isoformat(),
                "allocation_condition": "good",
            },
            "Asset allocation",
        )
    else:
        log(f"[SKIP] Asset: {status} {asset.get('message')}")

    # Grocery enrollment (ignore if already enrolled)
    post_ok(
        token,
        "/api/admin/grocery-benefits",
        {
            "user_id": employee_id,
            "start_date": today.replace(day=1).isoformat(),
            "subsidy_percentage": 50,
            "monthly_allowance": 5000,
        },
        "Grocery enrollment",
    )

    # Doctor report (published)
    post_ok(
        token,
        "/api/admin/doctor-reports",
        {
            "employee_user_id": employee_id,
            "consultation_date": today.isoformat(),
            "subjective": "Seed headache complaint",
            "objective": "BP normal",
            "assessment": "Tension headache",
            "plan": "Rest + hydration",
            "prescription_notes": "Paracetamol 500mg SOS",
            "status": "published",
        },
        "Doctor report",
    )

    # Careers / job posting
    post_ok(
        token,
        "/api/admin/careers",
        {
            "title": f"{TAG} Software Engineer {stamp}",
            "description": "Seeded job for real testing",
            "location": "Bengaluru",
            "employment_type": "full-time",
            "is_active": True,
            "experience_required": "2+ years",
            "salary_range": "8-12 LPA",
        },
        "Job posting",
    )

    # Org notification
    post_ok(
        token,
        "/api/admin/org-notifications",
        {
            "title": f"{TAG} Announcement {stamp}",
            "body": "All-modules seed complete. Use seed role accounts for RBAC testing.",
            "audience": "all",
        },
        "Org notification",
    )

    # Leave request as employee (login as seed employee)
    emp_token = login_tenant(f"seed.employee@{ORG_SLUG}.test", SEED_PASSWORD, ORG_SLUG)
    leave_types = get_json_list(emp_token, "/api/admin/leave-types")
    leave_slug = "annual"
    for lt in leave_types:
        slug = lt.get("slug") or lt.get("leave_type")
        if slug:
            leave_slug = slug
            break
    post_ok(
        emp_token,
        "/api/admin/leave-requests",
        {
            "leave_type": leave_slug,
            "start_date": future.isoformat(),
            "end_date": future2.isoformat(),
            "reason": f"{TAG} leave request for manager approval testing",
        },
        "Leave request (employee)",
    )

    # Manual attendance for employee (admin marks)
    post_ok(
        token,
        "/api/admin/attendance/manual",
        {
            "user_id": employee_id,
            "date": (today - timedelta(days=1)).isoformat(),
            "clock_in": "09:30:00",
            "clock_out": "18:00:00",
            "status": "present",
            "notes": f"{TAG} manual attendance",
        },
        "Manual attendance",
    )

    # Shift template if endpoint accepts
    post_ok(
        token,
        "/api/admin/shifts",
        {
            "name": f"{TAG} General {stamp}",
            "start_time": "09:00",
            "end_time": "18:00",
            "grace_in_minutes": 10,
            "grace_out_minutes": 10,
            "is_active": True,
            "is_default": False,
            "working_days": ["mon", "tue", "wed", "thu", "fri"],
        },
        "Shift template",
    )

    if center_id:
        log(f"(center_id={center_id} available for branch-admin scoping)")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--org-slug", default=ORG_SLUG)
    args = parser.parse_args()
    org_slug = args.org_slug

    print("=" * 60)
    print("SEED ALL MODULES FOR REAL TESTING")
    print(f"API={API} org={org_slug}")
    print("=" * 60)

    # Resolve org id
    org_id = int(psql(f"SELECT id FROM organizations WHERE slug = '{org_slug}' AND status != 'deleted' LIMIT 1;"))
    log(f"Target organization id={org_id}")

    ensure_enterprise_plan(org_id)

    # Platform touch to re-sync role defaults after plan change
    try:
        plat = login_platform()
        status, _ = req(
            "PATCH",
            f"/api/platform/organizations/{org_id}",
            token=plat,
            body={"plan": "enterprise", "status": "active"},
        )
        log(f"Platform PATCH org plan → HTTP {status} (triggers role_defaults sync when plan changes)")
        # Force sync even if already enterprise: re-PATCH name noop won't sync;
        # call a harmless update that still runs sync via plan change path by toggling.
        # Direct SQL already set enterprise; restart sync via second call with same plan
        # is skipped — so grant access-all-centers / perms via role sync SQL assist:
    except Exception as e:
        log(f"[WARN] Platform sync skipped: {e}")

    # Ensure role_defaults-equivalent grants: admin gets all plan perms already on next boot.
    # Nudge by inserting missing permission_role for admin from permissions table for catalog modules.
    log("Granting all permission slugs on Admin role for this org…")
    psql(
        f"""
        INSERT INTO permission_role (permission_id, role_id, created_at, updated_at)
        SELECT DISTINCT p.id, r.id, NOW(), NOW()
        FROM permissions p
        CROSS JOIN roles r
        WHERE r.organization_id = {org_id}
          AND lower(r.slug) IN ('admin', 'administrator')
          AND NOT EXISTS (
            SELECT 1 FROM permission_role pr
            WHERE pr.permission_id = p.id AND pr.role_id = r.id
          );
        INSERT INTO permission_role (permission_id, role_id, created_at, updated_at)
        SELECT p.id, r.id, NOW(), NOW()
        FROM permissions p
        CROSS JOIN roles r
        WHERE r.organization_id = {org_id}
          AND lower(r.slug) IN ('admin', 'administrator')
          AND p.slug = 'access-all-centers'
          AND NOT EXISTS (
            SELECT 1 FROM permission_role pr
            WHERE pr.permission_id = p.id AND pr.role_id = r.id
          );
        """
    )

    token = login_tenant(ADMIN_EMAIL, ADMIN_PASSWORD, org_slug)
    me_status, me = req("GET", "/api/auth/me", token=token)
    if not ok(me_status):
        raise RuntimeError(f"/auth/me failed: {me_status} {me}")
    plan = (me.get("data") or {}).get("plan") or {}
    modules = plan.get("modules") or []
    log(f"Admin /auth/me plan={plan.get('slug')} modules={len(modules)}/{len(ALL_MODULES)}")
    missing = [m for m in ALL_MODULES if m not in modules]
    if missing:
        log(f"[WARN] Missing modules on effective plan: {missing}")
    else:
        log("All catalog modules present on effective plan")

    # Resolve role ids
    roles = get_json_list(token, "/api/admin/roles/list") or get_json_list(token, "/api/admin/roles")
    role_map = {str(r.get("slug", "")).lower(): int(r["id"]) for r in roles if r.get("id")}
    for needed in ("manager", "hr", "doctor", "branch-admin", "employee"):
        if needed not in role_map:
            # SQL fallback
            rid = psql(
                f"SELECT id FROM roles WHERE organization_id={org_id} AND lower(slug)='{needed}' LIMIT 1;"
            )
            if rid:
                role_map[needed] = int(rid)
    log(f"Roles: {role_map}")

    depts = get_json_list(token, "/api/admin/departments/list")
    desigs = get_json_list(token, "/api/admin/designations/list")
    centers = get_json_list(token, "/api/admin/settings/centers")
    dept_id = int(depts[0]["id"]) if depts else None
    desig_id = int(desigs[0]["id"]) if desigs else None
    center_id = int(centers[0]["id"]) if centers else None
    center_str = str(center_id) if center_id else None

    admin_id = int((me.get("data") or {}).get("user", {}).get("id") or 1)

    manager_id = ensure_user(
        token,
        name=f"{TAG} Manager",
        email=f"seed.manager@{org_slug}.test",
        role_id=role_map["manager"],
        department_id=dept_id,
        designation_id=desig_id,
        manager_id=admin_id,
        work_location=center_str,
    )
    hr_id = ensure_user(
        token,
        name=f"{TAG} HR",
        email=f"seed.hr@{org_slug}.test",
        role_id=role_map["hr"],
        department_id=dept_id,
        designation_id=desig_id,
        manager_id=admin_id,
        work_location=center_str,
    )
    doctor_id = ensure_user(
        token,
        name=f"{TAG} Doctor",
        email=f"seed.doctor@{org_slug}.test",
        role_id=role_map["doctor"],
        department_id=dept_id,
        designation_id=desig_id,
        manager_id=admin_id,
        work_location=center_str,
    )
    branch_admin_id = ensure_user(
        token,
        name=f"{TAG} Branch Admin",
        email=f"seed.branchadmin@{org_slug}.test",
        role_id=role_map["branch-admin"],
        department_id=dept_id,
        designation_id=desig_id,
        manager_id=admin_id,
        work_location=center_str,
    )
    # Give branch-admin a managed center
    if center_id:
        psql(
            f"""
            INSERT INTO user_centers (user_id, center_id, organization_id, created_at, updated_at)
            SELECT {branch_admin_id}, {center_id}, {org_id}, NOW(), NOW()
            WHERE NOT EXISTS (
              SELECT 1 FROM user_centers WHERE user_id={branch_admin_id} AND center_id={center_id}
            );
            """
        )
        log(f"Branch admin {branch_admin_id} → managed center {center_id}")

    employee_id = ensure_user(
        token,
        name=f"{TAG} Employee",
        email=f"seed.employee@{org_slug}.test",
        role_id=role_map["employee"],
        department_id=dept_id,
        designation_id=desig_id,
        manager_id=manager_id,
        work_location=center_str,
    )

    # Reset seed passwords to known value (in case users pre-existed)
    for email in (
        f"seed.manager@{org_slug}.test",
        f"seed.hr@{org_slug}.test",
        f"seed.doctor@{org_slug}.test",
        f"seed.branchadmin@{org_slug}.test",
        f"seed.employee@{org_slug}.test",
    ):
        # bcrypt via backend password update isn't available without current password;
        # set via SQL using a precomputed bcrypt hash for TestSeed123!
        pass
    # Generate hash with python bcrypt if available, else openssl-less skip
    try:
        import bcrypt as _bcrypt

        hashed = _bcrypt.hashpw(SEED_PASSWORD.encode(), _bcrypt.gensalt(rounds=12)).decode()
        hashed_sql = hashed.replace("'", "''")
        ids = ",".join(str(i) for i in [manager_id, hr_id, doctor_id, branch_admin_id, employee_id])
        psql(f"UPDATE users SET password = '{hashed_sql}', updated_at = NOW() WHERE id IN ({ids});")
        log("Reset seed user passwords to TestSeed123!")
    except Exception as e:
        log(f"[WARN] Could not reset passwords via bcrypt: {e}")

    log("Seeding sample records across modules…")
    seed_module_samples(
        token,
        employee_id=employee_id,
        doctor_id=doctor_id,
        manager_id=manager_id,
        center_id=center_id,
    )

    # Verify each module API responds 200 for admin
    print("\nModule API smoke:")
    catalog = [
        ("dashboard", "/api/admin/dashboard/hr-data"),
        ("users", "/api/admin/users/list"),
        ("centers", "/api/admin/settings/centers"),
        ("departments", "/api/admin/departments/list"),
        ("designations", "/api/admin/designations/list"),
        ("careers", "/api/admin/careers/list"),
        ("job_applications", "/api/admin/job-applications/list"),
        ("chat", "/api/admin/chat/spaces"),
        ("attendance", "/api/admin/attendance/today"),
        ("shifts", "/api/admin/shifts"),
        ("biometric", "/api/admin/biometric/devices"),
        ("leave", "/api/admin/leave-requests/list"),
        ("leave_manage", "/api/admin/leave-requests/manage/list"),
        ("holidays", "/api/admin/holidays/list"),
        ("payroll", "/api/admin/payroll/list"),
        ("my_payslips", "/api/admin/me/payslips"),
        ("doctor_reports", "/api/admin/doctor-reports"),
        ("grocery_benefits", "/api/admin/grocery-benefits"),
        ("assets", "/api/admin/assets"),
        ("workflows", "/api/admin/workflows/list"),
        ("tasks", "/api/admin/tasks/list"),
        ("projects", "/api/admin/projects/list"),
        ("reports", "/api/admin/reports/attendance-summary"),
        ("subscription", "/api/admin/billing/plans"),
        ("notifications", "/api/admin/org-notifications"),
        ("support", "/api/admin/support/tickets"),
        ("settings", "/api/admin/settings/app"),
    ]
    failed = 0
    for key, path in catalog:
        st, _ = req("GET", path, token=token)
        mark = "PASS" if ok(st) else "FAIL"
        if mark == "FAIL":
            failed += 1
        print(f"  [{mark}] {key:22} HTTP {st}  {path}")

    print("\n" + "=" * 60)
    print("SEED ACCOUNTS (password for all seed.* users):")
    print(f"  {SEED_PASSWORD}")
    print(f"  Admin (existing):     {ADMIN_EMAIL}")
    print(f"  Manager:              seed.manager@{org_slug}.test")
    print(f"  HR:                   seed.hr@{org_slug}.test")
    print(f"  Doctor:               seed.doctor@{org_slug}.test")
    print(f"  Branch Admin:         seed.branchadmin@{org_slug}.test")
    print(f"  Employee:             seed.employee@{org_slug}.test")
    print(f"  Org slug:             {org_slug}")
    print(f"  Plan:                 enterprise ({len(ALL_MODULES)} modules)")
    print("=" * 60)
    if failed:
        print(f"Module smoke: {len(catalog) - failed}/{len(catalog)} passed, {failed} failed")
        return 1
    print(f"Module smoke: {len(catalog)}/{len(catalog)} passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        raise SystemExit(1)
