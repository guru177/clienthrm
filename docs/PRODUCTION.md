# Production deployment (HTTPS + PostgreSQL)

This guide covers deploying Raintech HRM for multi-tenant SaaS production: HTTPS for tenant and platform web apps, PostgreSQL for the database tier, and HTTP for biometric devices.

## Architecture

```text
                    ┌─────────────────────────────────────┐
  Browser (HTTPS)   │  Caddy (Let's Encrypt)              │
  app.example.com ──┤  /     → tenant static (React)      │
  platform.example ─┤  /api  → backend:3001                │
                    └─────────────────────────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    │  backend (Rust / Actix)               │
                    │  DATABASE_URL → PostgreSQL 16         │
                    │  :7788 biometric HTTP                 │
                    │  :5010 BIO-PARK TCP                   │
                    └───────────────────┬───────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    │  PostgreSQL 16 (multi-tenant DB)    │
                    └───────────────────────────────────────┘

  Biometric device ──HTTP──► server-ip:7788 (no TLS — device limitation)
  Biometric device ──TCP───► server-ip:5010 (BIO-PARK binary protocol)
```

### Database

| Layer | Status |
|-------|--------|
| **Production runtime** | PostgreSQL when `DATABASE_URL` is set (Docker compose sets this automatically) |
| **Local development** | SQLite via `DATABASE_PATH` (default) when `DATABASE_URL` is unset |
| **SQLite → PG migration** | `scripts/migrate-sqlite-to-postgres.py` |

The backend uses a unified DB layer (`backend/src/db/`) that adapts SQL placeholders and dialect differences. Set `DATABASE_URL=postgres://...` for production; omit it for local SQLite dev.

## Prerequisites

- Linux server with Docker and Docker Compose v2
- DNS A records pointing to the server:
  - `app.yourcompany.com` → tenant HRM app
  - `platform.yourcompany.com` → platform admin
  - `api.yourcompany.com` → optional direct API subdomain
- Ports **80** and **443** open (Let's Encrypt)
- Port **7788** open for biometric devices (HTTP, LAN or VPN recommended)
- Port **5010** open if devices use BIO-PARK TCP

## Quick start

```bash
cd deploy
cp .env.production.example .env
# Edit .env: domains, JWT_SECRET, POSTGRES_PASSWORD, CORS_ORIGINS, admin credentials

docker compose -f docker-compose.production.yml up -d --build
```

After containers are healthy:

| URL | Purpose |
|-----|---------|
| `https://app.yourcompany.com` | Tenant HRM (employees, HR admin) |
| `https://platform.yourcompany.com` | Platform super-admin |
| `http://<server-ip>:7788/iclock/...` | Biometric device push (ATTLOG) |

## Environment variables

Copy `deploy/.env.production.example` to `deploy/.env`.

### Required (production)

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | At least 32 random characters. Backend refuses weak defaults in release builds. |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `TENANT_DOMAIN` | e.g. `app.yourcompany.com` |
| `PLATFORM_DOMAIN` | e.g. `platform.yourcompany.com` |
| `ACME_EMAIL` | Email for Let's Encrypt certificates |
| `CORS_ORIGINS` | Comma-separated HTTPS origins, e.g. `https://app.example.com,https://platform.example.com` |
| `PLATFORM_ADMIN_EMAIL` | First platform admin login |
| `PLATFORM_ADMIN_PASSWORD` | Min 12 characters |

### Frontend build (baked into Caddy image)

| Variable | Description |
|----------|-------------|
| `VITE_TENANT_APP_URL` | Full HTTPS URL of tenant app (platform impersonation links) |
| `VITE_PLATFORM_APP_URL` | Full HTTPS URL of platform app (tenant “Platform” links) |

Rebuild Caddy after changing these:

```bash
docker compose -f deploy/docker-compose.production.yml up -d --build caddy
```

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `BIOMETRIC_STRICT_IP` | `0` | Set `1` to reject ATTLOG from IPs that don't match registered device IP |
| `API_DOMAIN` | — | Optional dedicated API hostname in Caddyfile |
| `ALLOW_INSECURE_SECRETS` | off in release | **Never** set in production |

## HTTPS / reverse proxy

Caddy terminates TLS and routes traffic:

- **Tenant app** — static files + `/api/*` → backend
- **Platform app** — static files + `/api/*` → backend
- **Biometric** — `:7788` proxied to backend **without TLS** (most ZKTeco/BIO-PARK devices cannot use HTTPS)

Both React apps use relative `/api` paths in production, so no `VITE_API_URL` is required when served behind Caddy on the same host.

### Custom Caddy / nginx

If you use your own reverse proxy instead of the bundled Caddy image:

1. Serve `frontend/dist` and `platform/dist` as static sites.
2. Proxy `/api` to `http://127.0.0.1:3001` with headers:
   - `X-Forwarded-For`
   - `X-Forwarded-Proto: https`
   - `Host`
3. Do **not** expose `/storage` publicly — files go through authenticated API routes.
4. Keep biometric on plain HTTP port 7788.

## PostgreSQL migration

### 1. Start PostgreSQL

Included in the production compose stack, or standalone:

```bash
docker compose -f deploy/docker-compose.production.yml up -d postgres
```

### 2. Migrate SQLite → PostgreSQL

```bash
pip install psycopg2-binary

python scripts/migrate-sqlite-to-postgres.py \
  --sqlite database/database.sqlite \
  --pg-url "postgres://hrm:YOUR_PASSWORD@localhost:5432/hrm"
```

Dry-run (inspect DDL only):

```bash
python scripts/migrate-sqlite-to-postgres.py --sqlite database/database.sqlite --dry-run
```

### 3. First-time production deploy (order matters)

1. Start Postgres only:
   ```bash
   docker compose -f deploy/docker-compose.production.yml up -d postgres
   ```
2. **Import schema + data** (required — backend refuses to start without `users` table):
   ```bash
   python scripts/migrate-sqlite-to-postgres.py \
     --sqlite database/database.sqlite \
     --pg-url "postgres://hrm:PASSWORD@localhost:5432/hrm"
   ```
3. Start the full stack:
   ```bash
   docker compose -f deploy/docker-compose.production.yml up -d --build
   ```

On startup the backend applies Rust-specific tables (`postgres_rust_tables.sql`), seeds platform admin / subscription plans, then runs permission seeds. **Do not** start the backend before step 2 on a fresh Postgres instance.

## Security checklist

- [ ] Strong `JWT_SECRET` (32+ chars, unique per environment)
- [ ] Strong `POSTGRES_PASSWORD` and `PLATFORM_ADMIN_PASSWORD`
- [ ] `CORS_ORIGINS` matches exact HTTPS app URLs (no wildcards)
- [ ] Do not set `ALLOW_INSECURE_SECRETS`
- [ ] `BIOMETRIC_STRICT_IP=1` when devices have fixed IPs
- [ ] Restrict `:7788` and `:5010` to office LAN or VPN
- [ ] Regular backups of `hrm_data` volume and PostgreSQL `pgdata` volume
- [ ] Rotate JWT secret and force re-login if compromised

## Backups

```bash
# PostgreSQL (production)
docker compose -f deploy/docker-compose.production.yml exec postgres \
  pg_dump -U hrm hrm > hrm-backup.sql

# SQLite (local dev only)
cp database/database.sqlite database/database.sqlite.bak
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| CORS errors in browser | Ensure `CORS_ORIGINS` includes exact scheme + host (HTTPS) |
| Let's Encrypt fails | Verify DNS, ports 80/443, and `ACME_EMAIL` |
| Biometric not syncing | Use `http://server-ip:7788`, not HTTPS; check firewall |
| Platform admin not created | Set `PLATFORM_ADMIN_PASSWORD` (12+ chars) before first backend start |
| JWT panic on start | Set `JWT_SECRET` or use debug build with `ALLOW_INSECURE_SECRETS=1` locally only |

## Post-deploy smoke tests

After `docker compose ... up -d --build` and a successful SQLite → PG migration (if applicable):

1. **Health** — `curl -fsS https://app.yourcompany.com/api/health` and the platform equivalent.
2. **Login** — tenant admin and platform admin via HTTPS UI.
3. **CORS** — browser devtools: no cross-origin errors when both apps call `/api` on their own host (Caddy same-origin proxy).
4. **Biometric** — device push to `http://<server-ip>:7788` (HTTP only; firewall to LAN).
5. **Optional full regression** — from a dev machine with repo checkout, point tests at production URLs:

```powershell
$env:FE_URL = "https://app.yourcompany.com"
$env:HRM_EMAIL = "admin@yourorg.com"
$env:HRM_PASSWORD = "..."
# API scripts use Vite proxy locally; for production use curl/Postman or run UI checks only:
node scripts/ui-nav-check.mjs
```

Local integration suites (`scripts/run-all-tests.ps1`) remain SQLite + `:5174`/`:3001` dev stack. Re-run `scripts/migrate-sqlite-to-postgres.py` after major schema changes before relying on PostgreSQL in production.

## Local HTTPS testing (optional)

For development, continue using HTTP on ports 5174/5175 with Vite proxy. Production compose is intended for a real server with public DNS.

See also: [DOCUMENTATION.md](DOCUMENTATION.md), [PLATFORM.md](PLATFORM.md).
