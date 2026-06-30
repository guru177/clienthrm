# Raintech HRM — Tester Guide (Simple Language)

This document is for **QA testers** and **manual testers**. You do not need to know programming. Follow the steps below to set up the app, run automatic checks, and test important features by hand.

**Related files (for detail):**
- Manual checklist with tick boxes: [TENANT-QA-CHECKLIST.md](TENANT-QA-CHECKLIST.md)
- Latest automated test report: [TEST-REPORT-COMPREHENSIVE.md](TEST-REPORT-COMPREHENSIVE.md)
- Full technical docs: [DOCUMENTATION.md](DOCUMENTATION.md)

---

## 1. What you are testing

Raintech HRM is an **HR (Human Resources) web application** for companies. Each company is a separate **tenant** (organization). Main areas:

| Area | What it does |
|------|----------------|
| **Login & users** | Employees and admins sign in; roles control who can see what |
| **Attendance** | Clock in/out, shifts, late/early flags, biometric device punches |
| **Leave** | Apply for leave, manager approves or rejects |
| **Payroll** | Salary setup, monthly payslips, deductions, PDF |
| **Biometric** | Fingerprint devices send punches; system marks attendance |
| **Workflows** | Automatic actions when leave is submitted/approved (e.g. create a task) |
| **Reports** | Attendance summary, payroll register, leave balance |
| **Platform admin** | Super-admin manages all companies (separate app) |

---

## 2. What you need on your computer

| Item | Why |
|------|-----|
| **Windows PC** (or Mac/Linux with small changes) | Project is tested on Windows |
| **Project folder** | e.g. `C:\Users\...\HRM` |
| **Python 3** | Runs many automatic tests |
| **Node.js** | Runs the web apps and UI tests |
| **Rust** (optional) | Only if you run backend tests with `cargo` |
| **PowerShell** | Runs the main “all tests” script |
| **Chrome** (optional) | For browser navigation tests (Playwright) |

You do **not** need PostgreSQL for normal testing. The app uses a local file database: `database/database.sqlite`.

---

## 3. Start the application (do this first)

Open **three separate terminal windows** (or use Cursor terminals). Keep them running while you test.

### Window 1 — Backend (API server)

```powershell
cd backend
cargo run
```

Wait until you see the server listening on port **3001**.

**Quick check:** Open in browser: `http://localhost:3001/api/health`  
You should see JSON with `"success": true` or similar.

### Window 2 — Tenant app (main HR website for companies)

```powershell
cd frontend
npm install
npm run dev
```

Open in browser: **http://localhost:5174**

### Window 3 — Platform app (super-admin, optional but recommended)

```powershell
cd platform
npm install
npm run dev
```

Open in browser: **http://localhost:5175**

---

## 4. Test login details (development)

### Tenant app (company HR portal)

| Field | Value |
|-------|--------|
| URL | http://localhost:5174 |
| Email | `admin@mashuptech.in` |
| Password | `password` |
| Organization slug | `mashuptech` (if the login page asks for it) |

### Demo employee (for leave / employee view)

| Field | Value |
|-------|--------|
| Email | `demo.employee1@mashuptech.local` |
| Password | `password` |
| Org slug | `mashuptech` |

### Platform admin (super-admin)

Set in `backend/.env` or environment before first backend start. Example:

- Email: `admin@retaildaddy.in` (or value in your `.env`)
- Password: see `PLATFORM_ADMIN_PASSWORD` in `backend/.env`

If platform login fails, ask your developer for the seeded platform credentials.

---

## 5. Two ways to test

### A. Automatic tests (fast, repeatable)

A script clicks APIs and pages for you and prints **PASS** or **FAIL**.

**Run everything (~15–20 minutes):**

```powershell
cd C:\Users\ASUS\Pictures\HRM
powershell -NoProfile -File scripts/run-complete-all-tests.ps1
```

**What “good” looks like at the end:**

```
Suites: 21 passed, 0 failed, 0 skipped
All suites passed.
```

**If something fails:** Note the **suite name** (red line) and tell the developer. Example: `Workflow engine suite FAIL`.

**Skip parts you don’t need:**

```powershell
# No browser UI tests
powershell -NoProfile -File scripts/run-complete-all-tests.ps1 -SkipFrontend

# No platform UI
powershell -NoProfile -File scripts/run-complete-all-tests.ps1 -SkipPlatform
```

### B. Manual tests (you click in the browser)

Use the checklist: [TENANT-QA-CHECKLIST.md](TENANT-QA-CHECKLIST.md)  
Print it or copy to Excel and mark **Pass / Fail** for each row.

**When to do manual testing:**
- Before a release to customers
- After big UI changes
- After payroll or leave rule changes
- When automatic tests pass but something “feels wrong” in the UI

---

## 6. Quick smoke test (5 minutes)

Do this every day or after each build.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `http://localhost:3001/api/health` | Page loads, not error |
| 2 | Login at `http://localhost:5174` | Dashboard opens |
| 3 | Go to **Attendance → Today** | Page loads |
| 4 | Click **Clock in**, then **Clock out** | No error message |
| 5 | Go to **Payroll → Preview** (current month) | List of employees or preview rows |
| 6 | Go to **Leave → Manage** | List loads |
| 7 | Logout | Returns to login page |

If all 7 pass, the core app is probably working.

---

## 7. Run automatic tests one by one (if full suite fails)

From the project root folder:

```powershell
# Database file health
python scripts/test-database-health.py

# Security (login, wrong tokens, cross-company access)
python scripts/test-auth-security-suite.py

# Workflows (leave triggers tasks)
python scripts/test-workflow-suite.py

# Shift + attendance + payroll math
python scripts/test-shift-payroll-suite.py
python scripts/test-payroll-attendance-suite.py

# Full chain: shift → attendance → salary → leave → workflow
python scripts/test-hrm-core-integration-suite.py

# Multi-company isolation
python scripts/test-saas-suite.py

# Tenant API read (many GET endpoints)
powershell -File scripts/flow-test.ps1

# Tenant API write (create dept, leave, task, etc.)
powershell -File scripts/api-input-flow-test.ps1
```

Each script prints `X/Y passed` at the end. **Y passed with 0 failures** = OK.

---

## 8. Manual testing — step by step by module

### 8.1 Login and security

1. Go to `/login`.
2. Try **wrong password** → should show error, stay on login.
3. Try **wrong org slug** → should reject.
4. Login correctly → dashboard loads.
5. Refresh page (F5) → still logged in.
6. Logout → back to login.
7. (Optional) **Forgot password:** `/forgot-password` → enter email → OTP step → set new password.

**Pass if:** No crash; wrong inputs blocked; correct login works.

---

### 8.2 Attendance and shifts

**Employee clock in/out**

1. Login as admin (or employee).
2. Open **Attendance → Today** (or employee attendance page).
3. Click **Clock in** → should show active session.
4. Click **Clock out** → session closes, duration shown.

**Admin manual entry**

1. **Attendance → Manual** (or add entry).
2. Pick an employee, date, clock in/out times.
3. Save → row appears in attendance list.

**Shifts**

1. **Settings → Shifts** (or Shift templates).
2. Create a shift (e.g. 9:00 AM – 6:00 PM).
3. Assign shift to an employee for a date.
4. Mark attendance late (clock in after 9:10) → **Late** flag should appear if grace period is small.

**Pass if:** Clock in/out works; manual entry saves; shift rules affect late/early flags.

---

### 8.3 Leave and holidays

**Employee submits leave**

1. Login as demo employee (or use admin “submit on behalf” if available).
2. **Leave → Apply** → choose type (Annual/Sick), dates, reason → Submit.
3. Status should be **Pending**.

**Manager approves**

1. Login as admin.
2. **Leave → Manage** → find pending request.
3. **Approve** → status **Approved**.
4. **Reject** another request → status **Rejected** with reason.

**Holidays**

1. **Holidays** → Add a paid holiday on a date.
2. Check it appears in calendar/list.

**Pass if:** Submit, approve, reject all work; quota/balance updates look reasonable.

---

### 8.4 Payroll and payslips

**Setup (once per employee)**

1. **Payroll → Salary components** — earnings/deductions exist.
2. **User profile → Salary** — assign structure to employee.

**Monthly run**

1. **Payroll → Preview** — select month/year, run preview.
2. Check **present days**, **leave days**, **LOP**, **net salary** look sensible.
3. **Generate** payslips → status changes to generated (optional: **Email payslip to employees** checkbox).
4. Open **Payslip PDF** — opens A4 PDF in browser; amounts match preview.
5. **Email** one payslip or **Email All** — employee receives summary + PDF (requires SMTP in App Settings or `.env`; employee must have email on profile).
6. Login as **employee** → **My payslips** — only own payslips visible.

Full email/PDF/SMTP details: **[PAYSLIP-DISTRIBUTION.md](PAYSLIP-DISTRIBUTION.md)**.

**Important connection:** If someone was **absent** or on **unpaid leave**, net pay should be **lower** than full month. If they were **present** all working days, net should match structure (minus statutory deductions).

**Late/early penalties:** The system **flags** late arrivals and early exits on attendance, and shows a **suggested** penalty amount in payroll preview. It does **not** deduct automatically — HR adds a manual deduction at generate time when there is no valid excuse.

**Pass if:** Preview matches attendance/leave; generate locks payslip; PDF matches screen; email delivers when SMTP configured.

---

### 8.5 Workflows (automation)

Workflows run actions when something happens (e.g. leave submitted).

**Simple test**

1. **Workflows → Create**  
   - Trigger: **Leave request submitted**  
   - Action: **Create task** (give task a title)  
   - Set **Active**
2. Submit a new leave request (annual leave).
3. Go to **Tasks** → a new task should appear from the workflow.

**Approve workflow**

1. Create workflow with trigger **Leave approved** → action **Create task**.
2. Approve a leave request.
3. Check **Tasks** again.

**Pass if:** Task (or other action) appears after trigger event.

---

### 8.6 Biometric (if device or simulator available)

1. **Biometric → Devices** — device listed for your org.
2. **PIN mapping** — map employee to device user ID.
3. Send a test punch (device or test script).
4. **Live punches** feed shows new punch.
5. **Attendance** for that day shows **biometric** source.

**Pass if:** Punch appears and attendance row is created/updated.

---

### 8.7 Reports

1. **Reports → Attendance summary** — pick month → data loads, export if available.
2. **Reports → Payroll register** — month data loads.
3. **Reports → Leave balance** — per-employee balances show.

**Pass if:** No 500 errors; numbers roughly match what you see in attendance/payroll screens.

---

### 8.8 Multi-company (tenant isolation)

**Needs platform app or two test orgs.**

1. Login to **Company A** (`mashuptech`).
2. Note a user ID or payslip ID from URL or network tab (ask dev if unsure).
3. Login to **Company B** (trial test org).
4. Try to open Company A’s user/payslip URL in Company B session.

**Pass if:** **404** or **access denied** — never show other company’s data.

---

### 8.9 Platform admin (super-admin)

1. Login at `http://localhost:5175`.
2. **Organizations** list loads.
3. Open one tenant → overview (user count, devices).
4. **Impersonate** (if enabled) → opens tenant app as that org.

**Pass if:** Platform pages load; impersonation lands in correct org.

---

## 9. How modules connect (what to watch)

When testing end-to-end, data flows like this:

```
Shift assigned → Attendance (clock/biometric) → Present/Late days
       ↓
Leave approved → Leave days in payroll
       ↓
Payroll preview → Generate payslip → PDF
       ↓
Workflow (optional) → Task / notification on leave events
```

**Example scenario for one employee in one month:**

1. Assign shift Mon–Fri 9–6.
2. Mark present 20 days (clock or manual).
3. Approve 2 days annual leave.
4. Run payroll preview → present + leave + LOP should add up; net pay calculated.
5. Generate payslip → PDF matches preview.

---

## 10. Security checks (basic)

| Test | How | Expected |
|------|-----|----------|
| Wrong password | Login 3–5 times wrong | Error each time; no login |
| Logout | Logout then press Back | Should not see protected data without login |
| Employee vs admin | Employee opens `/admin/payroll` | Blocked or unauthorized |
| Cross-company | See section 8.8 | No other org data |

**Automatic security script:**

```powershell
python scripts/test-auth-security-suite.py
```

Should show **17/17 passed** (or all green).

---

## 11. How to report a bug

Copy this template into your bug tracker or email:

```
Title: [Module] Short description

Environment:
- Date:
- Branch/version:
- Backend running: Yes/No
- URL: localhost:5174 / staging / production

Steps:
1.
2.
3.

Expected:
(what should happen)

Actual:
(what happened — include screenshot)

Automatic test (if any):
- Suite name:
- Script output:

Extra:
- Browser: Chrome / Edge
- Login user:
- Employee/org affected:
```

**Attach:** Screenshot, screen recording, or the **red FAIL line** from the test script.

---

## 12. Common problems

| Problem | What to try |
|---------|-------------|
| `Backend not reachable at :3001` | Start `cargo run` in `backend` folder |
| Login page blank | Start `npm run dev` in `frontend` |
| All tests fail at once | Backend not running; check health URL |
| `cargo run` says file locked | Stop old backend (Task Manager → end `hrm-backend.exe`), run again |
| Playwright / UI tests skipped | Run `cd frontend` then `npx playwright install chromium` |
| Platform tests skipped | Start platform on port 5175 |
| Leave submit fails in tests after many runs | Normal on dev DB; ask dev to reset test leaves or re-run workflow suite alone |
| Payslip PDF wrong numbers | Compare with Payroll Preview first; check attendance for that month |

---

## 13. Test run checklist (sign-off)

Use this before saying **“Ready for release”**:

| # | Item | Done |
|---|------|------|
| 1 | Backend health OK | ☐ |
| 2 | `run-complete-all-tests.ps1` → 21/21 passed | ☐ |
| 3 | Manual smoke (Section 6) passed | ☐ |
| 4 | [TENANT-QA-CHECKLIST.md](TENANT-QA-CHECKLIST.md) critical sections done | ☐ |
| 5 | Payroll preview + PDF checked for one employee | ☐ |
| 6 | Leave approve + workflow task checked | ☐ |
| 7 | Security spot-check (Section 10) | ☐ |
| 8 | No open **Critical** or **High** bugs | ☐ |

**Sign-off**

| Role | Name | Date | Result |
|------|------|------|--------|
| Tester | | | ☐ Pass ☐ Fail |
| Developer | | | |
| Product owner | | | |

---

## 14. Quick reference — important URLs

| What | URL |
|------|-----|
| Tenant app | http://localhost:5174 |
| Platform app | http://localhost:5175 |
| API health | http://localhost:3001/api/health |
| Tenant login | http://localhost:5174/login |
| Admin payroll | http://localhost:5174/admin/payroll |
| Admin attendance | http://localhost:5174/admin/attendance |

---

## 15. Who to ask for help

| Topic | Ask |
|-------|-----|
| Login / credentials | Developer or `backend/.env` |
| Test script failures | Developer with FAIL suite name + log |
| Payroll rules / LOP | Product owner or HR domain expert |
| Device/biometric setup | Developer / IT |

---

*Last updated: 2026-06-22. For technical test case IDs (PA-01, WF-03, SEC-17, etc.), see [test-cases/README.md](test-cases/README.md).*
