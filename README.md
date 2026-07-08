# HRM

Rust backend plus two standalone React apps: tenant HRM (`frontend`) and platform admin (`platform`).

**Full documentation:** [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) — architecture, API, security, deployment, and troubleshooting.

**Per-module docs:** [docs/modules/README.md](docs/modules/README.md) — each HRM module (routes, API, permissions, workflows).

**Platform admin:** [docs/PLATFORM.md](docs/PLATFORM.md) — SaaS console (orgs, plans, impersonation, IP tracking).

**Biometric devices:** [docs/BIOMETRIC-DEVICE-SETUP.md](docs/BIOMETRIC-DEVICE-SETUP.md) — connect ZKTeco / BIO-PARK attendance devices.

## Run locally

Start PostgreSQL (required):

```powershell
docker compose up -d
```

Data is stored in `database/pgdata/`. Connection: `postgres://hrm:hrm@127.0.0.1:5433/hrm` in `backend/.env`.

Backend:

```powershell
cd backend
$env:PORT="3001"   # optional — 3001 is the default
cargo run
```

Tenant app (employees / HR admin):

```powershell
cd frontend
npm install
npm run dev
```

Open the tenant app at:

```text
http://localhost:5174
```

Platform admin (super admin, org management):

```powershell
cd platform
npm install
npm run dev
```

Open the platform app at:

```text
http://localhost:5175
```

Both frontends proxy `/api` to the Rust backend at `http://127.0.0.1:3001`.

### Default platform admin

Set before first backend start (or use defaults):

```powershell
$env:PLATFORM_ADMIN_EMAIL="platform@hrm.local"
$env:PLATFORM_ADMIN_PASSWORD="ChangeMe-Platform-2026!"
```

Sign in at `http://localhost:5175/login`.

### Cross-app URLs (optional)

When deploying, point each app at the other:

```powershell
# frontend/.env
VITE_PLATFORM_APP_URL=https://platform.example.com

# platform/.env
VITE_TENANT_APP_URL=https://app.example.com
```

Impersonation from the platform app opens the tenant app on port 5174 (or `VITE_TENANT_APP_URL`).

## Production deployment

For HTTPS (Caddy reverse proxy), PostgreSQL, and Docker Compose:

```bash
cd deploy
cp .env.production.example .env
# edit .env — domains, JWT_SECRET, passwords
docker compose -f docker-compose.production.yml up -d --build
```

Full guide: [docs/PRODUCTION.md](docs/PRODUCTION.md)

**PostgreSQL:** set `DATABASE_URL=postgres://...` in `backend/.env` — see `backend/.env.example`. Local dev uses `docker compose` at the repo root.
