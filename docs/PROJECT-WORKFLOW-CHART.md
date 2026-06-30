# Raintech HRM — Full Project Workflow Chart

Visual map of system architecture, user journeys, and cross-module data flows.

---

## 1. System topology

```mermaid
flowchart TB
    subgraph Clients
        TENANT["Tenant Web / Electron<br/>:5174"]
        PLATFORM["Platform Admin<br/>:5175"]
        BIO_HTTP["Biometric devices<br/>HTTP :7788"]
        BIO_TCP["BIO-PARK devices<br/>TCP :5010"]
    end

    subgraph Edge["Production edge"]
        CADDY["Caddy TLS<br/>app.* / platform.*"]
    end

    subgraph Backend["Rust backend hrm-backend"]
        API["REST API :3001"]
        WS["WebSocket chat"]
        RBAC["RBAC middleware"]
        LOGIC["Domain logic<br/>payroll · shift · leave · workflow"]
        BIO_SVC["Biometric ingest"]
    end

    subgraph Data
        DB[("SQLite dev / PostgreSQL prod")]
        FILES[("storage/ files")]
        SMTP["SMTP / notifications"]
    end

    TENANT -->|"/api proxy"| API
    PLATFORM -->|"/api proxy"| API
    TENANT -.->|Electron file://| API
    CADDY --> TENANT
    CADDY --> PLATFORM
    CADDY --> API
    BIO_HTTP --> BIO_SVC
    BIO_TCP --> BIO_SVC
    BIO_SVC --> API
    API --> RBAC --> LOGIC
    API --> WS
    LOGIC --> DB
    API --> FILES
    LOGIC --> SMTP
```

---

## 2. Multi-tenant request flow

```mermaid
sequenceDiagram
    actor User
    participant UI as Tenant UI
    participant API as Backend :3001
    participant RBAC as RBAC
    participant DB as Database

    User->>UI: Login email + password + org_slug
    UI->>API: POST /api/auth/login
    API->>DB: Validate user + organization
    API-->>UI: JWT aud=tenant + permissions
    UI->>UI: Store hrm_token

    User->>UI: Open /admin/payroll
    UI->>API: GET /api/admin/payroll/... Bearer JWT
    API->>RBAC: Check permission slug
    RBAC->>API: org_id from claims
    API->>DB: Query scoped by organization_id
    API-->>UI: JSON response
```

---

## 3. Authentication & onboarding

```mermaid
flowchart LR
    subgraph Public
        LOGIN["Login"]
        FORGOT["Forgot password"]
        SIGNUP["Public signup<br/>optional"]
        CAREERS["Public careers / apply"]
    end

    subgraph Tenant
        DASH["Dashboard"]
        PROFILE["Profile / 2FA settings"]
    end

    subgraph Platform
        PL_LOGIN["Platform admin login"]
        PL_2FA["Platform 2FA"]
        IMP["Impersonate tenant"]
    end

    LOGIN -->|JWT tenant| DASH
    FORGOT -->|SMTP email OTP| LOGIN
    SIGNUP -->|new org + admin| LOGIN
    CAREERS -->|resume webhook| Applications

    PL_LOGIN --> PL_2FA --> IMP
    IMP -->|token handoff| DASH
```

---

## 4. Leave policy → manage → attendance → payroll

```mermaid
flowchart TB
    subgraph Policy["Leave policy (Settings)"]
        QUOTA["Annual quota<br/>app_settings"]
        TYPES["Leave types<br/>paid / unpaid / half_day"]
        CREDITS["Bonus credits<br/>leave_credits"]
    end

    subgraph Employee
        SUBMIT["Submit leave request"]
    end

    subgraph HR["Manage leave"]
        PENDING["Pending queue"]
        APPROVE["Approve"]
        REJECT["Reject"]
    end

    subgraph Engine["Backend logic"]
        QUOTA_CHK["Quota check<br/>used + pending + new"]
        WF["Workflow trigger"]
        LOP["LOP calculator<br/>payroll_logic"]
        PREVIEW["Payroll preview"]
    end

    subgraph Outputs
        ATT["Attendance register<br/>present / absent / LOP"]
        PAY["Payslip<br/>leave_days · lop_days · net pay"]
    end

    QUOTA --> QUOTA_CHK
    TYPES --> QUOTA_CHK
    CREDITS --> QUOTA_CHK
    TYPES --> LOP

    SUBMIT --> QUOTA_CHK
    QUOTA_CHK -->|ok| PENDING
    QUOTA_CHK -->|exceeded| SUBMIT
    SUBMIT --> WF

    PENDING --> APPROVE
    PENDING --> REJECT
    APPROVE --> WF
    APPROVE --> LOP

    LOP --> ATT
    LOP --> PREVIEW
    PREVIEW --> PAY
```

**Per working day LOP decision**

| Condition | LOP |
|-----------|-----|
| Present (clock-out done) or paid holiday | 0 |
| Open clock-in today (no clock-out yet) | 0 (wait) |
| Approved unpaid leave | 1.0 |
| Approved half-day leave | 0.5 |
| Approved paid leave | 0 |
| No attendance, no leave | 1.0 (absent) |

---

## 5. Attendance & biometric pipeline

```mermaid
flowchart LR
    subgraph Sources
        APP_IN["In-app clock-in/out"]
        MANUAL["Manual attendance mark"]
        ICLOCK["iClock HTTP :7788"]
        BIOPARK["BIO-PARK TCP :5010"]
    end

    subgraph Ingest
        PUNCH["biometric_punches"]
        MAP["biometric_user_map"]
        SYNC["sync punches → attendance"]
    end

    subgraph Store
        ATT_TBL[("attendance<br/>source: app | biometric | manual")]
    end

    subgraph Consumers
        DASH_STATS["Dashboard stats"]
        ROSTER["Daily register"]
        PAYROLL["Payroll present_days"]
    end

    APP_IN --> ATT_TBL
    MANUAL --> ATT_TBL
    ICLOCK --> PUNCH
    BIOPARK --> PUNCH
    PUNCH --> MAP
    PUNCH --> SYNC --> ATT_TBL
    ATT_TBL --> DASH_STATS
    ATT_TBL --> ROSTER
    ATT_TBL --> PAYROLL
```

---

## 6. Shift → roster → payroll month

```mermaid
flowchart TB
    SHIFT_TPL["Shift templates"]
    ROSTER["Daily roster / assignments"]
    WORKDAY["is_working_day_for_user"]
    ACTIVE["User active date range in month"]

    SHIFT_TPL --> ROSTER
    ROSTER --> WORKDAY
    ACTIVE --> WORKDAY

    WORKDAY --> WD["working_days count"]
    ATT_P["present_days"]
    LEAVE_D["leave_days"]
    HOL["paid_holidays"]
    LOP_D["lop_days"]

    WD --> PREVIEW["Payroll preview"]
    ATT_P --> PREVIEW
    LEAVE_D --> PREVIEW
    HOL --> PREVIEW
    LOP_D --> PREVIEW

    PREVIEW --> GEN["Generate payslips"]
    GEN --> PDF["PDF payslip + optional email"]
```

---

## 7. Workflow automation engine

```mermaid
flowchart TB
    subgraph Triggers["Wired triggers only"]
        T1["leave_request_submitted"]
        T2["leave_request_approved"]
        T3["leave_request_rejected"]
    end

    subgraph Conditions
        COND["trigger_conditions<br/>field · operator · value"]
    end

    subgraph Actions
        A1["create_task"]
        A2["send_notification → org_notifications"]
    end

    subgraph Audit
        EXEC["workflow_executions"]
    end

    T1 & T2 & T3 --> COND
    COND -->|match| ACT["execute_actions"]
    COND -->|skip| EXEC
    ACT --> A1 & A2
    ACT --> EXEC
```

**UI action shape** `{ type, config }` is normalized on save to flat JSON the engine executes.

---

## 8. Payroll generation workflow

```mermaid
flowchart TB
    START["Select month + employees"]
    SYNC["Sync biometric punches for month"]
    PREVIEW["Preview per employee"]
    CALC["Build payroll row"]

    subgraph calc["Calculation stack"]
        SAL["Salary structure / CTC"]
        STAT["Statutory PF · ESI · TDS"]
        OT["Overtime"]
        VAR["Variable pay · reimbursements · arrears"]
        LOP_C["LOP deduction"]
        ADV["Advance EMI"]
    end

    HOLD{On payroll hold?}
    GEN["Generate payslips"]
    EMAIL["Email PDF async"]
    LOCK["Status: generated"]

    START --> SYNC --> PREVIEW --> CALC
    CALC --> SAL --> STAT --> OT --> VAR --> LOP_C --> ADV
    CALC --> HOLD
    HOLD -->|no| GEN --> LOCK
    HOLD -->|yes| PREVIEW
    GEN --> EMAIL
```

---

## 9. Platform SaaS admin workflow

```mermaid
flowchart TB
    PL_DASH["Platform dashboard"]
    ORGS["Organizations CRUD"]
    PLANS["Subscription plans"]
    USERS["Cross-tenant users"]
    REV["Revenue / billing"]
    ANN["Announcements"]
    AUDIT["Audit log"]
    HEALTH["System health"]
    IMP["Impersonate → tenant JWT"]

    PL_DASH --> ORGS & PLANS & USERS & REV & ANN & AUDIT & HEALTH
    ORGS --> IMP
    IMP --> TENANT_UI["Tenant app session"]
```

---

## 10. Recruitment workflow

```mermaid
flowchart LR
    POST["Job posting<br/>admin/careers"]
    PUBLIC["Public careers page"]
    APPLY["Application + resume"]
    WEBHOOK["Resume webhook / IMAP"]
    REVIEW["HR review applications"]
    HIRE["Convert to employee user"]

    POST --> PUBLIC --> APPLY
    WEBHOOK --> APPLY
    APPLY --> REVIEW --> HIRE
    HIRE --> USERS["Users & roles"]
```

---

## 11. Electron desktop app flow

```mermaid
flowchart LR
    INSTALL["NSIS installer"]
    LAUNCH["Electron shell"]
    API_CFG["Auto API 127.0.0.1:3001"]
    UI["Load dist/ or dev :5174"]
    LOGIN["Same login as web"]
    HASH["HashRouter navigation"]

    INSTALL --> LAUNCH --> API_CFG --> UI --> LOGIN --> HASH
```

---

## 12. CI / QA test workflow

```mermaid
flowchart TB
    RUN["run-complete-all-tests.ps1"]
    DB_H["Database health 19"]
    BIO_T["Biometric 22"]
    WF_T["Workflow 15"]
    CORE["HRM core integration 30"]
    PAY_T["Payroll + attendance 18"]
    API_ALL["25 modules API"]
    UI_ALL["25 modules UI + E2E"]
    RUST["cargo test"]
    SEC["Auth & security"]

    RUN --> DB_H & BIO_T & WF_T & CORE & PAY_T & API_ALL & UI_ALL & RUST & SEC
```

**Maintenance after marathon runs**

```text
python scripts/prune-qa-workflow-tasks.py
VACUUM database.sqlite   # if DB-08 fragmentation fails
```

---

## 13. Production deploy workflow (AWS / Docker)

```mermaid
flowchart TB
    DNS["DNS → Elastic IP"]
    EC2["EC2 + Docker Compose"]
    ENV["deploy/.env secrets"]
    PG["PostgreSQL 16"]
    MIG["migrate-sqlite-to-postgres.py"]
    STACK["Caddy + backend + postgres"]
    TLS["Let's Encrypt HTTPS"]
    SMOKE["/api/health + login smoke"]

    DNS --> EC2 --> ENV
    ENV --> PG --> MIG --> STACK --> TLS --> SMOKE
```

| URL | Role |
|-----|------|
| `https://app.domain` | Tenant HRM |
| `https://platform.domain` | Platform admin |
| `http://server-ip:7788` | Biometric push (no TLS) |

---

## 14. Tenant module map (25 modules)

```mermaid
mindmap
  root((Raintech HRM))
    People
      Users and Roles
      Departments
      Designations
      Centers
    Time
      Attendance
      Shifts and Roster
      Biometric
      Manual Attendance
      Holidays
    Leave
      Leave Requests
      Manage Leave
      Leave Types Policy
    Pay
      Salary Components
      Salary Employees
      Payroll
      My Payslips
    Ops
      Tasks
      Projects
      Workflows
    Talent
      Careers
      Applications
    Comms
      Team Chat
      Notifications
    Insight
      Dashboard
      Reports
    Admin
      Settings
      Subscription
      Support
```

---

## 15. Data dependency graph (core HR loop)

```mermaid
flowchart TB
    ORG["organization"]
    USER["users"]
    SHIFT["shifts · roster"]
    ATT["attendance"]
    LEAVE["leave_requests"]
    HOL["holidays"]
    SAL["salary_structures"]
    PAY["payslips"]

    ORG --> USER
    USER --> SHIFT
    SHIFT --> ATT
    SHIFT --> LEAVE
    ORG --> HOL
    USER --> LEAVE
    ATT --> PAY
    LEAVE --> PAY
    HOL --> PAY
    SAL --> PAY
    USER --> SAL
```

---

## Quick reference — ports

| Service | Dev | Production |
|---------|-----|------------|
| API | 3001 | 443 `/api` via Caddy |
| Tenant UI | 5174 | `app.domain` |
| Platform UI | 5175 | `platform.domain` |
| Biometric HTTP | 7788 | 7788 (LAN) |
| BIO-PARK TCP | 5010 | 5010 (LAN) |

---

*Generated for Raintech HRM monorepo. See also [DOCUMENTATION.md](DOCUMENTATION.md), [PRODUCTION.md](PRODUCTION.md), [modules/README.md](modules/README.md).*
