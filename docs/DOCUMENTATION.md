# Raintech HRM — Full Project Documentation

Multi-tenant Human Resource Management system with a **Rust (Actix-web) API**, **tenant React app**, **platform super-admin app**, biometric device integration, payroll, and team chat.

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Module documentation](#module-documentation)
4. [Repository structure](#3-repository-structure)
5. [Technology stack](#4-technology-stack)
6. [Getting started](#5-getting-started)
7. [Environment variables](#6-environment-variables)
8. [Multi-tenancy](#7-multi-tenancy)
9. [Authentication & authorization](#8-authentication--authorization)
10. [Backend](#9-backend)
11. [Tenant frontend](#10-tenant-frontend)
12. [Platform admin](#11-platform-admin)
13. [Database](#12-database)
14. [File storage](#13-file-storage)
15. [Biometric integration](#14-biometric-integration)
16. [Team chat](#15-team-chat)
17. [Payroll & salaries](#16-payroll--salaries)
18. [API overview](#17-api-overview)
19. [Testing](#18-testing)
20. [Security](#19-security)
21. [Production deployment](#20-production-deployment)
22. [Scripts & utilities](#21-scripts--utilities)
23. [Troubleshooting](#22-troubleshooting)

---

## 1. Overview

Raintech HRM is a full-stack HR platform supporting:

| Capability | Description |
|------------|-------------|
| **Users & RBAC** | Employees, roles, permissions, departments, designations |
| **Attendance** | Manual clock-in/out, shift templates, roster, biometric sync |
| **Leave** | Leave types, credits, requests, approvals |
| **Payroll** | Salary components, CTC profiles, payslip generation, statutory deductions |
| **Recruitment** | Job postings, applications, email, resume webhook |
| **Operations** | Tasks, projects, workflows |
| **Communication** | Slack-style team chat (channels, DMs, WebSocket) |
| **SaaS platform** | Organizations, subscription plans, impersonation |
| **Reports** | Attendance, payroll register, leave balance |

**Default local URLs**

| Service | URL | Port |
|---------|-----|------|
| Backend API | `http://localhost:3001` | 3001 |
| Tenant UI | `http://localhost:5174` | 5174 |
| Platform UI | `http://localhost:5175` | 5175 |
| Biometric HTTP (iClock/ADMS) | `http://0.0.0.0:7788` | 7788 |
| BIO-PARK TCP | `0.0.0.0:5010` | 5010 |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Clients (Browser / Devices)                      │
├──────────────────────┬──────────────────────┬───────────────────────────┤
│  Tenant React (5174) │ Platform React (5175)│ ZKTeco / BIO-PARK devices │
│  /api → proxy 3001   │ /api → proxy 3001    │ :7788 iClock / :5010 TCP  │
└──────────┬───────────┴──────────┬───────────┴─────────────┬─────────────┘
           │                      │                         │
           ▼                      ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    Rust Backend (hrm-backend)                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌─────────────────┐ │
│  │ Actix API   │  │ RBAC         │  │ JWT Auth   │  │ Rate limiting   │ │
│  │ :3001       │  │ middleware   │  │ tenant +   │  │ login/signup    │ │
│  │             │  │              │  │ platform   │  │                 │ │
│  └─────────────┘  └──────────────┘  └────────────┘  └─────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────────┐ │
│  │ Biometric   │  │ Chat WS      │  │ Payroll / shift / leave logic  │ │
│  │ HTTP :7788  │  │              │  │                                │ │
│  └─────────────┘  └──────────────┘  └────────────────────────────────┘ │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │ SQLite DB   │    │ File storage│    │ SMTP (opt)  │
    │ database/   │    │ storage/    │    │ via settings│
    └─────────────┘    └─────────────┘    └─────────────┘
```

**Request flow (tenant admin)**

1. User logs in → `POST /api/auth/login` → JWT with `aud: "tenant"`.
2. Frontend stores token in `localStorage` (`hrm_token`).
3. Axios attaches `Authorization: Bearer <token>` to `/api/admin/*` calls.
4. RBAC middleware maps HTTP method + path → required permission slug.
5. Handlers scope all queries by `organization_id` from JWT.

---

## Module documentation

Per-module guides (permissions, routes, API, database, workflows):

**[docs/modules/README.md](modules/README.md)**

| Module | Document |
|--------|----------|
| Auth & Onboarding | [modules/auth-onboarding.md](modules/auth-onboarding.md) |
| Dashboard | [modules/dashboard.md](modules/dashboard.md) |
| Users & Roles | [modules/users-roles.md](modules/users-roles.md) |
| Centers | [modules/centers.md](modules/centers.md) |
| Departments | [modules/departments.md](modules/departments.md) |
| Designations | [modules/designations.md](modules/designations.md) |
| Job Postings | [modules/careers.md](modules/careers.md) |
| Applications | [modules/job-applications.md](modules/job-applications.md) |
| Team Chat | [modules/team-chat.md](modules/team-chat.md) |
| Attendance | [modules/attendance.md](modules/attendance.md) |
| Shifts | [modules/shifts.md](modules/shifts.md) |
| Biometric | [modules/biometric.md](modules/biometric.md) |
| Leave | [modules/leave.md](modules/leave.md) |
| Holidays | [modules/holidays.md](modules/holidays.md) |
| Payroll | [modules/payroll.md](modules/payroll.md) |
| Workflows | [modules/workflows.md](modules/workflows.md) |
| Tasks | [modules/tasks.md](modules/tasks.md) |
| Projects | [modules/projects.md](modules/projects.md) |
| Reports | [modules/reports.md](modules/reports.md) |
| Settings | [modules/settings.md](modules/settings.md) |
| Platform Admin | [PLATFORM.md](PLATFORM.md) · [modules/platform.md](modules/platform.md) |

---

## 3. Repository structure

```
HRM/
├── backend/                 # Rust API (Actix-web)
│   ├── src/
│   │   ├── main.rs          # Starts API + biometric HTTP + BIO-PARK TCP
│   │   ├── routes.rs        # All HTTP routes
│   │   ├── config.rs        # Env-based configuration
│   │   ├── handlers/        # Route handlers (30 modules)
│   │   ├── middleware/      # auth, rbac, platform_auth
│   │   ├── models/          # Serde structs
│   │   ├── db/              # Pool + migrations
│   │   ├── payroll_logic.rs # Business days, LOP, leave quota
│   │   ├── salary_split.rs  # CTC → component split
│   │   ├── statutory_logic.rs
│   │   ├── shift_logic.rs
│   │   ├── storage.rs       # File paths, ACL
│   │   └── ...
│   └── Cargo.toml
├── frontend/                # Tenant HRM (React + Vite + Electron optional)
│   ├── src/
│   │   ├── main.tsx         # Routes + auth guards
│   │   ├── pages/admin/     # Feature pages
│   │   ├── components/      # UI, tables, forms
│   │   ├── contexts/        # Auth, chat notifications
│   │   └── lib/             # axios, api, chat-api, storage-url
│   └── electron/            # Desktop wrapper
├── platform/                # SaaS super-admin (React + Vite)
├── database/                # SQLite file (default: database.sqlite)
├── storage/                 # Uploaded files (users/, chat/, logos)
├── scripts/                 # Integration & E2E test scripts
└── docs/                    # This documentation
```

---

## 4. Technology stack

| Layer | Technologies |
|-------|----------------|
| **Backend** | Rust 2021, Actix-web 4, Rusqlite, JWT (jsonwebtoken 9), bcrypt, Tokio |
| **Tenant UI** | React 19, TypeScript, Vite 6, Tailwind CSS 4, Radix UI, React Router 7, Axios |
| **Platform UI** | React 19, Vite, Tailwind, Leaflet (IP map) |
| **Desktop** | Electron (optional tenant build) |
| **Database** | SQLite (local dev) or PostgreSQL (production via `DATABASE_URL`) |
| **Real-time** | Actix WebSocket (chat, biometric live) |
| **E2E tests** | Playwright (headless browser navigation) |

---

## 5. Getting started

### Prerequisites

- **Rust** (stable) + Cargo
- **Node.js** 18+ and npm
- **Windows / Linux / macOS** (biometric devices need LAN access to host)

### 1. Backend

```powershell
cd backend
cargo run
```

API listens on `http://0.0.0.0:3001` by default. Migrations run automatically on startup.

### 2. Tenant app

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5174**

### 3. Platform admin

```powershell
cd platform
npm install
npm run dev
```

Open **http://localhost:5175**

### Default credentials (development)

| App | Email | Password | Notes |
|-----|-------|----------|-------|
| Tenant | `admin@mashuptech.in` | `password` | Org slug: `mashuptech` (if prompted) |
| Platform | Set via env | See below | Seeded on first migration |

**Platform admin seed** (set before first `cargo run`):

```powershell
$env:PLATFORM_ADMIN_EMAIL="platform@hrm.local"
$env:PLATFORM_ADMIN_PASSWORD="ChangeMe-Platform-2026!"  # min 12 chars
```

### Production builds

```powershell
cd backend && cargo build --release
cd frontend && npm run build      # output: frontend/dist
cd platform && npm run build      # output: platform/dist
```

---

## 6. Environment variables

### Backend (`backend/.env` or shell)

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address (use `0.0.0.0` for biometric LAN) |
| `PORT` | `3001` | Main API port |
| `BIOMETRIC_PORT` | `7788` | iClock / ADMS HTTP listener |
| `BIO_PARK_TCP_PORT` | `5010` | BIO-PARK binary TCP |
| `DATABASE_PATH` | `../database/database.sqlite` | SQLite file path (used when `DATABASE_URL` is unset) |
| `DATABASE_URL` | — | PostgreSQL URL (`postgres://user:pass@host:5432/db`) — takes precedence in production |
| `JWT_SECRET` | *(dev default)* | **Required ≥32 chars in release** |
| `JWT_EXPIRATION_HOURS` | `24` | Tenant + platform token TTL |
| `STORAGE_PATH` | `../storage` | File upload root |
| `WEBHOOK_SECRET` | *(empty)* | Resume ingestion webhook; empty = disabled |
| `PLATFORM_ADMIN_EMAIL` | — | Platform admin seed email |
| `PLATFORM_ADMIN_PASSWORD` | — | Platform admin seed (≥12 chars) |
| `PLATFORM_ADMIN_NAME` | — | Display name for platform admin |
| `ALLOW_PUBLIC_SIGNUP` | `1` in debug | Set `0` to disable `/api/public/signup` in production |
| `ALLOW_INSECURE_SECRETS` | `1` in debug | Allow weak JWT in dev only |
| `BIOMETRIC_STRICT_IP` | `0` | `1` = reject ATTLOG from non-registered device IPs |
| `RUST_LOG` | `info` | Log level |

### Frontend (`frontend/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_PLATFORM_APP_URL` | Link to platform app (impersonation redirect) |

### Platform (`platform/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_TENANT_APP_URL` | Link to tenant app (impersonation target) |

---

## 7. Multi-tenancy

- Every tenant user belongs to an **organization** (`organizations` table).
- JWT claims include `organization_id` and `org_slug`.
- Login accepts optional `org_slug`; empty defaults to org ID `1`.
- All `/api/admin/*` handlers filter data by organization.
- **Subscription plans** control which **modules** an org can use (`plan_limits`, `subscription_plans`).
- Platform admin manages orgs, plans, and can **impersonate** a tenant admin.

---

## 8. Authentication & authorization

### Tenant JWT

- Issued by `POST /api/auth/login`, `refresh`, `signup`.
- Claims: `sub`, `email`, `organization_id`, `org_slug`, `is_super_admin`, `aud: "tenant"`.
- Audience validation is strict — only `aud == "tenant"` is accepted on admin routes.

### Platform JWT

- Issued by `POST /api/platform/auth/login`.
- Audience: `aud: "platform"`.
- Separate decode path in `middleware/platform_auth.rs`.

### RBAC

- Permissions are slug strings (e.g. `view-users`, `view-payroll`).
- Roles ↔ permissions ↔ users via join tables.
- `is_super_admin` is loaded from **database** at request time, not trusted from JWT alone.
- `middleware/rbac.rs` maps each route to a required permission.
- Super admin receives permission `*`.

### Rate limiting

- Login, refresh, signup, platform login — per-IP sliding window (`rate_limit.rs`).

---

## 9. Backend

### Process model (`main.rs`)

Three concurrent listeners:

1. **API server** — port `PORT` (3001): REST + WebSocket chat + authenticated files.
2. **Biometric HTTP** — port `BIOMETRIC_PORT` (7788): iClock/ADMS device protocol (no JWT).
3. **BIO-PARK TCP** — port `BIO_PARK_TCP_PORT` (5010): binary attendance push.

### Handler modules

| Handler | Responsibility |
|---------|----------------|
| `auth` | Login, refresh, logout, signup, me |
| `users` | CRUD, stats, multipart profile update |
| `departments`, `designations` | Org structure |
| `roles`, `permissions` | RBAC management |
| `attendance` | Clock in/out, today, stats, list |
| `shifts` | Templates, assignments, roster, daily schedule |
| `biometric` | Devices, punches, mapping, iClock, ADMS, live WS |
| `leave_types`, `leave_credits`, `leave_requests` | Leave policy & workflow |
| `holidays` | Company holidays |
| `salaries`, `payroll`, `payslips` | Compensation |
| `careers`, `job_applications` | ATS / recruitment |
| `projects`, `tasks`, `workflows` | Operations |
| `analytics` | HR dashboard aggregates |
| `reports` | Attendance, payroll, leave reports |
| `settings`, `centers` | App config, work centers |
| `chat` | Spaces, messages, reactions, upload, WS |
| `files` | Authenticated file serving |
| `platform`, `subscription_plans` | SaaS administration |

### Business logic crates (in `src/`)

| Module | Purpose |
|--------|---------|
| `payroll_logic` | Working days, LOP, leave overlap, payslip adjustments |
| `salary_split` | CTC breakdown, component lines, statutory preview |
| `statutory_logic` | PF, ESI, professional tax, advances |
| `shift_logic` | Shift resolution, grace, working-day mask |
| `attendance_logic` | Session rules, late detection |
| `subscription_period` | Plan expiry, renewal |
| `plan_limits` | Module gating, permission seeds |

---

## 10. Tenant frontend

### Routing (`frontend/src/main.tsx`)

| Path | Module |
|------|--------|
| `/login`, `/signup` | Auth |
| `/admin/dashboard` | Dashboard |
| `/admin/users`, `/admin/users/:id` | Users & roles |
| `/admin/departments`, `/admin/designations` | Org structure |
| `/admin/centers` | Work centers |
| `/admin/careers`, `/admin/job-applications` | Recruitment |
| `/admin/chat`, `/admin/chat/:spaceId` | Team chat |
| `/admin/attendance` | Attendance |
| `/admin/shifts`, `/roster`, `/daily` | Shifts |
| `/admin/biometric` | Biometric devices |
| `/admin/leave-requests`, `/manage` | Leave |
| `/admin/holidays` | Holidays |
| `/admin/salaries/*`, `/admin/payroll` | Payroll |
| `/admin/my-payslips` | Employee payslips |
| `/admin/workflows`, `/tasks`, `/projects` | Operations |
| `/admin/reports` | Reports |
| `/admin/settings/*` | Settings |

### Key libraries

| File | Role |
|------|------|
| `contexts/AuthContext.tsx` | Login state, permissions, plan modules |
| `lib/axios.ts` | API client with JWT interceptor |
| `lib/storage-url.ts` | Authenticated file URLs (`/api/admin/files/...`) |
| `lib/chat-api.ts` | Chat REST helpers |
| `hooks/use-chat-ws.ts` | Shared WebSocket for chat events |
| `components/permission-route.tsx` | Route guard by permission + plan module |

### Plan module keys

Sidebar items map to subscription modules: `dashboard`, `users`, `centers`, `departments`, `designations`, `careers`, `job_applications`, `chat`, `attendance`, `shifts`, `biometric`, `leave`, `holidays`, `payroll`, `workflows`, `tasks`, `projects`, `reports`, `settings`.

### Electron desktop

```powershell
cd frontend
npm run electron:dev    # dev + Electron shell
npm run electron:build  # NSIS installer
```

---

## 11. Platform admin

**Purpose:** Manage SaaS customers — organizations, subscription plans, platform users, IP tracking, impersonation.

**Full platform documentation:** [docs/PLATFORM.md](PLATFORM.md) — screens, API reference, impersonation, plans, deployment, troubleshooting.

| Feature | API prefix |
|---------|------------|
| Login | `/api/platform/auth/*` |
| Organizations CRUD | `/api/platform/organizations` |
| Impersonate tenant | `POST .../organizations/{id}/impersonate` |
| Plans | `/api/platform/plans` |
| Dashboard stats | `/api/platform/dashboard/stats` |
| IP tracking | `/api/platform/ip-tracking` |

- **App:** `platform/` on port **5175**
- **Token:** `hrm_platform_token` with JWT `aud: "platform"`
- Impersonation issues a tenant JWT and redirects to the tenant app (`/auth/impersonate`)

Module summary: [modules/platform.md](modules/platform.md)

---

## 12. Database

- **Engine:** SQLite (dev) or PostgreSQL (production). Unified `backend/src/db/` layer with `r2d2` pools for both.
- **Migrations:** `backend/src/db/migrations.rs` — run on every startup.
- **Location:** `database/database.sqlite` (relative to backend cwd).

### Core tables (non-exhaustive)

| Table | Purpose |
|-------|---------|
| `organizations` | Tenants |
| `users` | Employees (scoped by `organization_id`) |
| `roles`, `permissions`, `role_user`, `permission_role` | RBAC |
| `departments`, `designations` | Org chart |
| `attendance` | Clock in/out records |
| `shift_templates`, `user_shift_assignments`, `shift_daily_roster` | Shifts |
| `biometric_devices`, `biometric_punches`, `biometric_user_map` | Devices |
| `leave_types`, `leave_requests`, `leave_credits` | Leave |
| `holidays` | Public holidays |
| `salary_components`, `salary_structure_items`, `employee_salary_profiles` | Pay |
| `payslips` | Generated payroll |
| `careers`, `job_applications` | ATS |
| `projects`, `tasks`, `workflows`, `workflow_executions` | Ops |
| `chat_spaces`, `chat_messages`, `chat_*` | Team chat |
| `app_settings` | Per-org key/value config |
| `subscription_plans`, `platform_admins` | SaaS |
| `jwt_refresh_tokens` | Refresh token rotation |

---

## 13. File storage

- **Root:** `STORAGE_PATH` (default `../storage`).
- **Not publicly served** — Vite dev blocks `/storage/*` with 403.
- **Access:** `GET /api/admin/files/{path}` with Bearer token or `?token=`.
- **ACL:** `storage::can_access_storage_file` — user photos, chat attachments, org logos.
- **Missing profile photos:** Returns SVG placeholder (200) instead of 404.

### Path conventions

| Prefix | Content |
|--------|---------|
| `users/{uuid}.jpg` | Profile photos |
| `chat/{uuid}.ext` | Chat attachments |

Frontend helper: `storageUrl()` in `lib/storage-url.ts`.

---

## 14. Biometric integration

### Supported protocols

1. **ZKTeco iClock** — HTTP on port 7788  
   - `GET /iclock/cdata` — handshake  
   - `POST /iclock/cdata` — ATTLOG punch upload  
   - `GET /iclock/getrequest` — device commands  

2. **BIO-PARK ADMS** — HTTP `/pub/chat` (WebSocket + POST) on 7788  

3. **BIO-PARK TCP** — binary protocol on port 5010  

### Security

- Device endpoints have **no JWT** — security relies on:
  - Device serial registration in `biometric_devices`
  - Optional `BIOMETRIC_STRICT_IP` — reject punches from unknown IPs
  - Unregistered devices get plain `OK` (no data accepted) on handshake

### Admin UI

`/admin/biometric` — register devices, map device PIN → user, view punches, live WebSocket feed.

---

## 15. Team chat

Slack-style messaging per organization:

- **Channels** (public/private) + **DMs**
- Auto-created `#general` channel and department channels
- **REST** for history, upload, search, pins, stars, reactions
- **WebSocket** `GET /api/admin/chat/ws?token=` for live updates
- Attachments via `POST /api/admin/chat/upload`
- DOCX/XLSX previews sanitized with DOMPurify

---

## 16. Payroll & salaries

### Flow

1. Define **salary components** (earnings/deductions).
2. Assign **CTC profile** or **salary structure items** per employee.
3. **Payroll preview** — computes gross, LOP, statutory deductions per month.
4. **Generate** — creates `payslips` records (draft → generated).
5. **Payslip PDF** / bulk download / WhatsApp send (where configured).

### Key logic

- `payroll_logic` — business days, present days, leave overlap, LOP amounts.
- `salary_split` — CTC → basic/HRA/transport/special + deduction lines.
- `statutory_logic` — PF, ESI, PT, advance EMI recovery.

---

## 17. API overview

### Public (no auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/public/signup` | Create org + admin (if enabled) |
| GET | `/api/public/careers` | Public job listings (`?org_slug=`) |
| POST | `/api/webhooks/incoming-resume` | Resume webhook (`X-Webhook-Secret`) |

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Tenant login |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Current user + permissions + plan |
| POST | `/api/auth/logout` | Revoke refresh token |

### Admin prefix

All routes under `/api/admin/*` require tenant JWT + RBAC permission.

Full route list: `backend/src/routes.rs` (~300 lines).

### Platform prefix

All routes under `/api/platform/*` require platform JWT.

---

## 18. Testing

### Full suite (recommended)

```powershell
# Backend :3001, tenant frontend :5174, database/database.sqlite
powershell -NoProfile -File scripts/run-all-tests.ps1
```

Runs suites in order (biometric before SaaS to avoid attendance date conflicts):

| Step | Script | Checks |
|------|--------|--------|
| 1 | `scripts/test-biometric-suite.py` | Device protocol, punch → attendance (22) |
| 2 | `scripts/test-saas-suite.py` | Platform + tenant isolation (30) |
| 3 | `backend` `cargo test` | Rust unit tests |
| 4 | `scripts/flow-test.ps1` | API read flow (50 endpoints) |
| 5 | `scripts/api-input-flow-test.ps1` | API write flows |
| 6 | `scripts/attendance-flow-test.ps1` | Clock in/out |
| 7 | `scripts/frontend-module-check.mjs` | All admin routes (28 modules) |
| 8 | `scripts/ui-nav-check.mjs` | Browser nav + console/API errors (optional) |

**Flags:** `-SkipFrontend`, `-SkipRust`, `-SkipSaas`, `-SkipBrowserNav`, `-IncludeBrowserNav` (fail if Playwright missing).

**Playwright setup** (for step 8):

```powershell
cd frontend
npm install
npx playwright install chromium
```

### Rust unit tests

```powershell
cd backend
cargo test
```

Includes JWT audience round-trip tests and subscription period logic.

### API integration (PowerShell)

```powershell
# Read-only flow across all major list endpoints (50 checks)
.\scripts\flow-test.ps1

# Write flows: create dept, designation, leave, task, etc.
.\scripts\api-input-flow-test.ps1

# Attendance clock in/out deep test
.\scripts\attendance-flow-test.ps1
```

### Browser E2E (Playwright)

```powershell
# Visits all 28 admin modules after login (uses frontend/node_modules/playwright)
node scripts/frontend-module-check.mjs

# Deeper walkthrough: login flow, per-page console/API errors, attendance buttons
node scripts/ui-nav-check.mjs
```

Requires frontend on `:5174` and backend on `:3001`.

### Production / PostgreSQL

Integration scripts above use local SQLite + HTTP dev ports. For Docker + PostgreSQL deploy verification, see [PRODUCTION.md](PRODUCTION.md#post-deploy-smoke-tests).

### Builds

```powershell
cd backend && cargo check
cd frontend && npm run build
cd platform && npm run build
```

---

## 19. Security

| Control | Implementation |
|---------|----------------|
| JWT secret | ≥32 chars required in release; no default secret |
| Token audience | Strict `aud: tenant` / `platform` separation |
| Super admin | DB-backed flag, not JWT-only |
| RBAC | Per-route permission middleware |
| Cross-tenant | All queries scoped by `organization_id` |
| File access | Authenticated API + ACL checks |
| Storage | No direct `/storage` in dev or production mapping |
| Public signup | Disabled in release unless `ALLOW_PUBLIC_SIGNUP=1` |
| Rate limits | Auth endpoints per IP |
| Chat XSS | DOMPurify on document previews |
| Biometric | Device registration + optional strict IP |
| Webhook | `WEBHOOK_SECRET` header required |

---

## 20. Production deployment

**Full guide:** [docs/PRODUCTION.md](PRODUCTION.md) — Docker Compose, Caddy HTTPS, PostgreSQL, biometric ports, migration script.

### Checklist

1. Set strong `JWT_SECRET` (≥32 characters).
2. Set `PLATFORM_ADMIN_PASSWORD` (≥12 chars) before first deploy.
3. Set `ALLOW_INSECURE_SECRETS=0` and `ALLOW_PUBLIC_SIGNUP=0`.
4. Configure `STORAGE_PATH` outside web root; serve only via `/api/admin/files`.
5. Use **`deploy/docker-compose.production.yml`** (Caddy + Let's Encrypt) or your own nginx/Caddy reverse proxy with TLS.
6. Map `/api` to backend `:3001`; serve `frontend/dist` and `platform/dist` as static sites.
7. **Do not** expose `/storage` publicly.
8. Firewall biometric ports (`7788`, `5010`) to device subnet only.
9. Set `WEBHOOK_SECRET` if using resume ingestion.
10. Configure SMTP in App Settings for transactional email.
11. Set `CORS_ORIGINS` to your HTTPS tenant and platform URLs (comma-separated).

### Quick deploy

```bash
cd deploy
cp .env.production.example .env
docker compose -f docker-compose.production.yml up -d --build
```

### PostgreSQL

Set `DATABASE_URL` for production PostgreSQL. For migrating existing SQLite data, use `scripts/migrate-sqlite-to-postgres.py`. Local dev continues to use `DATABASE_PATH` (SQLite) when `DATABASE_URL` is unset.

### CORS

Set `CORS_ORIGINS` (e.g. `https://app.example.com,https://platform.example.com`). Same-origin proxy via Caddy is recommended so browsers never cross origins for `/api`.

---

## 21. Scripts & utilities

| Script | Purpose |
|--------|---------|
| `scripts/run-all-tests.ps1` | Run all suites in order with summary |
| `scripts/test-biometric-suite.py` | Biometric device + attendance QA (22 cases) |
| `scripts/test-saas-suite.py` | Multi-tenant platform + tenant QA (30 cases) |
| `scripts/flow-test.ps1` | API read flow (50 endpoints) |
| `scripts/api-input-flow-test.ps1` | API write flows |
| `scripts/attendance-flow-test.ps1` | Attendance module |
| `scripts/frontend-module-check.mjs` | Playwright E2E all modules (28 routes) |
| `scripts/ui-nav-check.mjs` | Playwright nav + console/API error scan |
| `scripts/inspect-db.py` | Database inspection |
| `scripts/migrate-sqlite-to-postgres.py` | SQLite → PostgreSQL schema + data migration |
| `scripts/fix-org-admin.py` | Org admin repair utility |

---

## 22. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| 401 on all API calls after login | JWT audience mismatch | Ensure backend has `set_audience` for tenant tokens; restart backend |
| Backend won't start (release) | Weak `JWT_SECRET` | Set `JWT_SECRET` or `ALLOW_INSECURE_SECRETS=1` (dev only) |
| Port 3001 in use | Old process | Kill process on 3001, restart `cargo run` |
| Biometric device not syncing | Wrong port / unregistered SN | Register device in admin; point device to `:7788` |
| Avatars 404 in chat | Missing files on disk | Fixed: placeholder SVG returned; re-upload photos in profile |
| `/storage` 403 in dev | Intentional security block | Use `storageUrl()` → `/api/admin/files/...` |
| Module missing in sidebar | Plan doesn't include module | Update org subscription plan in platform admin |
| Platform admin can't login | Not seeded | Set `PLATFORM_ADMIN_EMAIL` + `PASSWORD` and restart backend |

---

## Appendix: Version info

- **Backend crate:** `hrm-backend` v0.1.0  
- **Product name:** Raintech HRM  
- **Documentation generated:** reflects codebase as of project state including multi-tenant SaaS, biometric, chat, and payroll modules.

For quick start only, see the root [README.md](../README.md).
