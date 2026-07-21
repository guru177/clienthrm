# AWS Live Deployment Guide — Raintech HRM

Complete step-by-step guide to deploy **HR Daddy** (tenant app + platform admin + Rust API + PostgreSQL) on an **AWS EC2** instance with HTTPS, biometric device support, and optional desktop auto-updates.

---

## Table of contents

1. [What you are deploying](#1-what-you-are-deploying)
2. [AWS EC2 setup](#2-aws-ec2-setup)
3. [DNS (custom domain or sslip.io)](#3-dns-custom-domain-or-sslipio)
4. [Prepare your dev machine](#4-prepare-your-dev-machine)
5. [Configure production secrets](#5-configure-production-secrets)
6. [First-time deploy (recommended — automated)](#6-first-time-deploy-recommended--automated)
7. [First-time deploy (manual)](#7-first-time-deploy-manual)
8. [Import local database to production](#8-import-local-database-to-production)
9. [Verify the deployment](#9-verify-the-deployment)
10. [Redeploy after code changes](#10-redeploy-after-code-changes)
11. [Electron desktop installer (production API)](#11-electron-desktop-installer-production-api)
12. [Biometric devices](#12-biometric-devices)
13. [Operations & troubleshooting](#13-operations--troubleshooting)
14. [Security checklist](#14-security-checklist)
15. [Backup & restore](#15-backup--restore)

---

## 1. What you are deploying

```text
Internet
   │
   ├─ HTTPS :443  ──► Caddy (Let's Encrypt TLS)
   │                    ├─ tenant React app   (TENANT_DOMAIN)
   │                    ├─ platform React app (PLATFORM_DOMAIN)
   │                    └─ /api/*  ──► Rust backend :3001
   │
   ├─ HTTP :7788  ──► Biometric iClock push (no TLS — device limitation)
   ├─ TCP  :5010  ──► BIO-PARK binary protocol
   │
   └─ SSH  :22    ──► Server administration

Backend ──► PostgreSQL 16 (Docker volume, persistent)
```

| Service | Container | Host ports |
|---------|-----------|------------|
| Caddy (HTTPS + static frontends) | `deploy-caddy-1` | 80, 443, 7788 |
| Rust API | `deploy-backend-1` | 5010 |
| PostgreSQL 16 | `deploy-postgres-1` | internal only |

**App install path on server:** `/opt/hrm`

---

## 2. AWS EC2 setup

### 2.1 Launch instance

1. Open **AWS Console → EC2 → Launch instance**.
2. Recommended settings:

| Setting | Value |
|---------|-------|
| **Name** | `hrm-production` |
| **AMI** | Ubuntu Server 22.04 or 24.04 LTS (64-bit x86) |
| **Instance type** | `t3.medium` minimum (2 vCPU, 4 GB RAM). Use `t3.large` for 50+ active users. |
| **Key pair** | Create or select `.pem` key (e.g. `raintechHrm_key_pair.pem`) |
| **Storage** | 40 GB gp3 minimum (Docker images + PostgreSQL + uploads) |

3. **Network settings → Security group** — create or edit inbound rules:

| Type | Port | Source | Purpose |
|------|------|--------|---------|
| SSH | 22 | Your IP / office IP | Administration |
| HTTP | 80 | 0.0.0.0/0 | Let's Encrypt challenge + HTTP→HTTPS redirect |
| HTTPS | 443 | 0.0.0.0/0 | Tenant + platform web apps |
| Custom TCP | 7788 | Device network or 0.0.0.0/0 | Biometric HTTP push |
| Custom TCP | 5010 | Device network or 0.0.0.0/0 | BIO-PARK TCP (if used) |

> Restrict ports 7788 and 5010 to your office/VPN CIDR when possible.

4. Launch the instance.

### 2.2 Elastic IP (recommended)

1. **EC2 → Elastic IPs → Allocate**.
2. **Associate** with your `hrm-production` instance.
3. Note the public IP — example: `13.207.152.187`.

### 2.3 Test SSH

From your Windows machine (PowerShell):

```powershell
ssh -i "$env:USERPROFILE\Downloads\raintechHrm_key_pair (1).pem" ubuntu@13.207.152.187
```

If connection times out:
- Confirm the instance is **running**
- Security group allows SSH from your IP
- You are using user `ubuntu` (Ubuntu AMI default)

---

## 3. DNS (custom domain or sslip.io)

Caddy obtains **Let's Encrypt** certificates automatically. Domains must resolve to your server IP **before** the first HTTPS deploy.

### Option A — sslip.io (quick start, no domain purchase)

Replace dots in the IP with dashes:

| IP | Tenant URL | Platform URL |
|----|------------|--------------|
| `13.207.152.187` | `https://hrm.13-207-152-187.sslip.io` | `https://platform.13-207-152-187.sslip.io` |

Set in `deploy/.env`:

```env
TENANT_DOMAIN=hrm.13-207-152-187.sslip.io
PLATFORM_DOMAIN=platform.13-207-152-187.sslip.io
API_DOMAIN=api.13-207-152-187.sslip.io
```

sslip.io resolves `*.<ip-with-dashes>.sslip.io` to that IP automatically — no DNS panel needed.

### Option B — Custom domain

Create **A records** pointing to your Elastic IP:

| Host | Type | Value |
|------|------|-------|
| `hrm.yourcompany.com` | A | `13.207.152.187` |
| `platform.yourcompany.com` | A | `13.207.152.187` |
| `api.yourcompany.com` | A | `13.207.152.187` |

Wait for DNS propagation (5–30 minutes), then verify:

```powershell
nslookup hrm.yourcompany.com
```

---

## 4. Prepare your dev machine

On your Windows PC where the HRM repo lives:

### 4.1 Required software

| Tool | Purpose |
|------|---------|
| **Git** | Clone / pull code |
| **Node.js 20+** | Build React frontends |
| **OpenSSH client** | `ssh` / `scp` (built into Windows 10+) |
| **tar** | Packaging (Windows 10+ includes tar) |

### 4.2 Clone and install dependencies

```powershell
cd C:\Users\ASUS\Pictures\HRM

# Tenant frontend
cd frontend
npm ci
cd ..

# Platform admin frontend
cd platform
npm ci
cd ..
```

### 4.3 Keep deploy folder locally

The `deploy/` folder contains Docker Compose, Caddy config, and server scripts. It is **environment-specific** and must exist on your machine and be uploaded to the server on each deploy.

Ensure these files exist locally:

```text
deploy/
  .env                          ← production secrets (never commit)
  .env.production.example       ← template
  docker-compose.production.yml
  Caddyfile
  Dockerfile.caddy
  Dockerfile.backend
  remote-bootstrap.sh
  remote-deploy.sh
  remote-git-deploy.sh
  remote-git-setup.sh
  postgres/init/01-extensions.sql
```

---

## 5. Configure production secrets

### 5.1 Create `deploy/.env`

```powershell
copy deploy\.env.production.example deploy\.env
notepad deploy\.env
```

### 5.2 Required values

```env
# Domains (must match DNS / sslip.io)
TENANT_DOMAIN=hrm.13-207-152-187.sslip.io
PLATFORM_DOMAIN=platform.13-207-152-187.sslip.io
API_DOMAIN=api.13-207-152-187.sslip.io
ACME_EMAIL=info@raintechpos.com

# PostgreSQL (generate a strong password)
POSTGRES_DB=hrm
POSTGRES_USER=hrm
POSTGRES_PASSWORD=<random-32-chars>

# Auth
JWT_SECRET=<random-48-chars>
PLATFORM_ADMIN_EMAIL=admin@retaildaddy.in
PLATFORM_ADMIN_PASSWORD=<strong-password-min-12-chars>
PLATFORM_ADMIN_NAME=Platform Admin

# CORS + URLs
CORS_ORIGINS=https://hrm.13-207-152-187.sslip.io,https://platform.13-207-152-187.sslip.io
TRUST_PROXY=1
TENANT_APP_URL=https://hrm.13-207-152-187.sslip.io
VITE_TENANT_APP_URL=https://hrm.13-207-152-187.sslip.io
VITE_PLATFORM_APP_URL=https://platform.13-207-152-187.sslip.io

# Backend Docker image (pre-built from GitHub Actions)
BACKEND_IMAGE=ghcr.io/guru177/hrm-rust-backend:latest

# Feature flags
BIOMETRIC_STRICT_IP=1
ALLOW_PUBLIC_SIGNUP=1
SIGNUP_OTP_DEBUG=0
SIGNUP_OTP_BYPASS=0
RUST_LOG=info
```

### 5.3 Optional — email, SMS, S3 (copy from `backend/.env`)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=info@raintechpos.com
SMTP_PASS=<app-password>
SMTP_FROM=HRM DADDY <info@raintechpos.com>

MSG91_AUTHKEY=...
MSG91_INTEGRATED_NUMBER=...
# ... other MSG91 vars

AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=raintech-daddy
CLOUDFRONT_URL=https://...
GEMINI_API_KEY=...
```

### 5.4 GHCR (only if backend image is private)

```env
GHCR_USERNAME=your-github-username
GHCR_TOKEN=ghp_xxxxxxxx   # PAT with read:packages
```

> **Save `deploy/.env` securely.** The deploy script reuses existing secrets on the server when redeploying so PostgreSQL passwords stay in sync with the data volume.

---

## 6. First-time deploy (recommended — automated)

The PowerShell script builds frontends locally, packages the project, uploads to EC2, bootstraps Docker/UFW, and starts the stack.

### 6.1 Run from repo root

```powershell
cd C:\Users\ASUS\Pictures\HRM

powershell -NoProfile -File scripts\deploy-production.ps1 `
  -ServerIp "13.207.152.187" `
  -KeyPath "$env:USERPROFILE\Downloads\raintechHrm_key_pair (1).pem" `
  -TenantDomain "hrm.13-207-152-187.sslip.io" `
  -PlatformDomain "platform.13-207-152-187.sslip.io" `
  -ApiDomain "api.13-207-152-187.sslip.io"
```

### 6.2 What the script does

1. Generates or preserves `deploy/.env` secrets
2. Builds `frontend` and `platform` with production API URLs
3. Creates `hrm-deploy.tgz` (excludes `node_modules`, `target`, `.git`)
4. SCP upload to `/tmp/` on the server
5. Runs `remote-bootstrap.sh` (Docker, UFW, fail2ban, SSH hardening)
6. Runs `remote-deploy.sh`:
   - Builds Caddy image with static frontends
   - Pulls `BACKEND_IMAGE` from GHCR (or builds locally if pull fails)
   - Starts PostgreSQL → waits for healthy
   - Starts full stack
   - Syncs storage files into Docker volume
   - Waits for `https://<TENANT_DOMAIN>/api/health`

### 6.3 Faster redeploy (frontends already built)

```powershell
powershell -NoProfile -File scripts\deploy-production.ps1 `
  -ServerIp "13.207.152.187" `
  -KeyPath "$env:USERPROFILE\Downloads\raintechHrm_key_pair (1).pem" `
  -TenantDomain "hrm.13-207-152-187.sslip.io" `
  -PlatformDomain "platform.13-207-152-187.sslip.io" `
  -SkipBootstrap -Fast
```

| Flag | Effect |
|------|--------|
| `-SkipBootstrap` | Skip Docker/UFW install (subsequent deploys) |
| `-Fast` | Package only `deploy/` + `frontend/dist` + `platform/dist` |
| `-UseGit` | Pull code on server instead of tar upload (needs `deploy/` on server) |
| `-SkipElectron` | Skip desktop installer build/upload |

### 6.4 Expected output

```text
PRODUCTION DEPLOYED
Tenant:    https://hrm.13-207-152-187.sslip.io
Platform:  https://platform.13-207-152-187.sslip.io
Biometric: http://13.207.152.187:7788
```

---

## 7. First-time deploy (manual)

Use this if the PowerShell script is unavailable or you need full control.

### 7.1 Bootstrap server (once)

```powershell
scp -i "...\raintechHrm_key_pair (1).pem" deploy\remote-bootstrap.sh ubuntu@13.207.152.187:/tmp/
ssh -i "...\raintechHrm_key_pair (1).pem" ubuntu@13.207.152.187 "bash /tmp/remote-bootstrap.sh"
```

Log out and back in so `docker` group membership applies.

### 7.2 Build frontends locally

```powershell
cd frontend
$env:VITE_API_URL = "https://hrm.13-207-152-187.sslip.io/api"
$env:VITE_PLATFORM_APP_URL = "https://platform.13-207-152-187.sslip.io"
npm run build
cd ..\platform
$env:VITE_TENANT_APP_URL = "https://hrm.13-207-152-187.sslip.io"
npm run build
cd ..
```

### 7.3 Upload project

```powershell
tar -czf $env:TEMP\hrm-deploy.tgz `
  --exclude=node_modules `
  --exclude=backend/target `
  --exclude=frontend/node_modules `
  --exclude=platform/node_modules `
  --exclude=.git `
  -C C:\Users\ASUS\Pictures\HRM .

scp -i "...\raintechHrm_key_pair (1).pem" $env:TEMP\hrm-deploy.tgz ubuntu@13.207.152.187:/tmp/
scp -i "...\raintechHrm_key_pair (1).pem" deploy\.env ubuntu@13.207.152.187:/tmp/hrm-deploy.env
```

### 7.4 Extract and deploy on server

```bash
ssh -i ".../raintechHrm_key_pair (1).pem" ubuntu@13.207.152.187

sudo mkdir -p /opt/hrm && sudo chown ubuntu:ubuntu /opt/hrm
cd /opt/hrm
tar -xzf /tmp/hrm-deploy.tgz -C /opt/hrm
cp /tmp/hrm-deploy.env /opt/hrm/deploy/.env
chmod +x /opt/hrm/deploy/*.sh
bash /opt/hrm/deploy/remote-deploy.sh
```

Wait until you see `Deploy finished.` and `HTTPS healthy`.

---

## 8. Import local database to production

If you have a local PostgreSQL dump (e.g. `db/hrm.sql` from your dev machine), import it **after** the stack is running.

### 8.1 Upload dump

```powershell
scp -i "...\raintechHrm_key_pair (1).pem" db\hrm.sql ubuntu@13.207.152.187:/tmp/hrm.sql
```

### 8.2 Restore on server (replaces production data)

```bash
ssh -i ".../raintechHrm_key_pair (1).pem" ubuntu@13.207.152.187

cd /opt/hrm/deploy
COMPOSE="sudo docker compose -f docker-compose.production.yml"

# Stop API during restore (optional but safer)
$COMPOSE stop backend

# Restore (may show harmless errors on CREATE EXTENSION if already exists)
cat /tmp/hrm.sql | $COMPOSE exec -T postgres psql -U hrm -d hrm

# Restart backend
$COMPOSE start backend
```

### 8.3 Fresh database instead of import

On first deploy with an empty volume, the backend auto-creates schema and seeds the platform admin from `deploy/.env`. No manual import needed.

---

## 9. Verify the deployment

### 9.1 Health check

```powershell
curl https://hrm.13-207-152-187.sslip.io/api/health
```

Expected JSON includes `"service":"hrm-backend"`.

### 9.2 Container status (on server)

```bash
cd /opt/hrm/deploy
sudo docker compose -f docker-compose.production.yml ps
```

All three services should be `Up` / `healthy`.

### 9.3 Login URLs

| App | URL | Default admin |
|-----|-----|---------------|
| **Tenant HRM** | `https://hrm.<domain>` | Org admins created via signup or platform |
| **Platform** | `https://platform.<domain>` | `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` from `deploy/.env` |

### 9.4 Quick server check script

```bash
bash /opt/hrm/deploy/check-status.sh
```

---

## 10. Redeploy after code changes

### Method A — Automated (recommended)

```powershell
# Push code to GitHub first
git push origin main

# Full deploy from Windows
powershell -NoProfile -File scripts\deploy-production.ps1 `
  -ServerIp "13.207.152.187" `
  -KeyPath "$env:USERPROFILE\Downloads\raintechHrm_key_pair (1).pem" `
  -TenantDomain "hrm.13-207-152-187.sslip.io" `
  -PlatformDomain "platform.13-207-152-187.sslip.io" `
  -SkipBootstrap -Fast
```

### Method B — Git pull on server

Requires `deploy/` scripts already on the server at `/opt/hrm/deploy/`:

```powershell
powershell -NoProfile -File scripts\deploy-production.ps1 `
  -ServerIp "13.207.152.187" `
  -KeyPath "$env:USERPROFILE\Downloads\raintechHrm_key_pair (1).pem" `
  -TenantDomain "hrm.13-207-152-187.sslip.io" `
  -PlatformDomain "platform.13-207-152-187.sslip.io" `
  -UseGit -SkipBootstrap
```

Or directly on the server:

```bash
cd /opt/hrm
git pull origin main
# Still need to upload deploy/.env and deploy/ if not in git
bash deploy/remote-git-deploy.sh
```

### Method C — Backend image only (API change, no frontend change)

```bash
ssh ubuntu@13.207.152.187
cd /opt/hrm/deploy
sudo docker compose -f docker-compose.production.yml pull backend
sudo docker compose -f docker-compose.production.yml up -d backend
```

### What gets preserved on redeploy

| Data | Location | Preserved? |
|------|----------|------------|
| PostgreSQL data | Docker volume `deploy_pgdata` | Yes |
| Uploaded files (chat, photos) | Docker volume `deploy_hrm_data` | Yes |
| TLS certificates | Docker volume `caddy_data` | Yes |
| `deploy/.env` secrets | `/opt/hrm/deploy/.env` | Yes (if you don't overwrite) |

---

## 11. Electron desktop installer (production API)

### Production desktop build

```powershell
cd frontend
npm run electron:build
```

This bakes the production API URL from `deploy/.env` into `electron/production-api.json`.

### Local API desktop build (dev only)

```powershell
npm run electron:build:local
```

Targets `http://127.0.0.1:3001` — requires local backend running.

### Publish updates to production server

The deploy script can upload desktop update manifests to the server (`-SkipElectron` omits this). Manual publish:

```powershell
cd frontend
node scripts/publish-desktop-update.cjs
# Then SCP storage/desktop-updates/* to server volume
```

Desktop clients check: `https://<TENANT_DOMAIN>/api/public/desktop/updates`

---

## 12. Biometric devices

| Protocol | Server URL | Port |
|----------|------------|------|
| iClock HTTP push | `http://<server-ip>:7788` | 7788 |
| BIO-PARK TCP | `<server-ip>` | 5010 |

Configure the device to push to:

```text
http://13.207.152.187:7788/iclock/cdata?SN=<device-serial>
```

Ensure AWS security group allows **7788** from the device network.

Set in `deploy/.env`:

```env
BIOMETRIC_STRICT_IP=1   # reject punches from unregistered device IPs
```

See `docs/BIOMETRIC-DEVICE-SETUP.md` for device registration in the admin UI.

---

## 13. Operations & troubleshooting

### View logs

```bash
cd /opt/hrm/deploy

# All services
sudo docker compose -f docker-compose.production.yml logs -f --tail=100

# Backend only
sudo docker compose -f docker-compose.production.yml logs -f backend

# Caddy (TLS / routing)
sudo docker compose -f docker-compose.production.yml logs -f caddy
```

### Restart stack

```bash
cd /opt/hrm/deploy
sudo docker compose -f docker-compose.production.yml restart
```

### HTTPS / certificate issues

| Symptom | Fix |
|---------|-----|
| Certificate not issued | Confirm DNS points to server IP; ports 80+443 open |
| `502` on `/api` | Check backend logs; wait for postgres healthy |
| CORS errors | `CORS_ORIGINS` must include exact `https://` tenant + platform URLs |
| Login fails after redeploy | `POSTGRES_PASSWORD` in `.env` must match volume; run `remote-deploy.sh` (it syncs password) |

### SSH connection timeout

1. EC2 instance state = **running**
2. Security group inbound **22** from your IP
3. Correct Elastic IP
4. Key path and user `ubuntu`

### Disk full

```bash
df -h /
sudo docker system prune -af   # removes unused images (careful)
```

### Reset platform admin password (on server)

```bash
bash /opt/hrm/deploy/reset-platform-admin.sh
```

### Reset tenant user password

```bash
bash /opt/hrm/deploy/reset-tenant-password.sh
```

---

## 14. Security checklist

- [ ] `JWT_SECRET` — 48+ random characters, unique per environment
- [ ] `POSTGRES_PASSWORD` — strong, never committed to git
- [ ] `deploy/.env` — chmod 600 on server, not in public repos
- [ ] SSH key-only login (bootstrap script disables password auth)
- [ ] UFW enabled: only 22, 80, 443, 7788, 5010
- [ ] fail2ban active for SSH
- [ ] Restrict port 22 to known IPs in AWS security group
- [ ] Rotate AWS/GHCR/SMTP keys if ever exposed
- [ ] `SIGNUP_OTP_BYPASS=0` in production
- [ ] Regular PostgreSQL backups (see below)

---

## 15. Backup & restore

### Backup PostgreSQL (on server)

```bash
cd /opt/hrm/deploy
sudo docker compose -f docker-compose.production.yml exec -T postgres \
  pg_dump -U hrm -d hrm --no-owner --no-acl > /tmp/hrm-backup-$(date +%Y%m%d).sql
```

Download to your PC:

```powershell
scp -i "...\raintechHrm_key_pair (1).pem" ubuntu@13.207.152.187:/tmp/hrm-backup-*.sql db\
```

### Backup uploaded files

```bash
VOL=$(sudo docker volume inspect deploy_hrm_data --format '{{.Mountpoint}}')
sudo tar -czf /tmp/hrm-storage-$(date +%Y%m%d).tgz -C "$VOL" storage
```

### Restore

See [section 8](#8-import-local-database-to-production) for SQL restore. Storage restore:

```bash
sudo tar -xzf /tmp/hrm-storage-YYYYMMDD.tgz -C "$VOL"
sudo chown -R 999:999 "$VOL/storage"
```

---

## Quick reference

| Task | Command |
|------|---------|
| First deploy | `scripts\deploy-production.ps1` (see §6) |
| Fast redeploy | Same script with `-SkipBootstrap -Fast` |
| SSH to server | `ssh -i key.pem ubuntu@<ip>` |
| Server app path | `/opt/hrm` |
| Production env | `/opt/hrm/deploy/.env` |
| Docker compose | `sudo docker compose -f docker-compose.production.yml` |
| Health URL | `https://<TENANT_DOMAIN>/api/health` |
| Platform login | `https://<PLATFORM_DOMAIN>` |
| Biometric | `http://<ip>:7788` |

---

*Last updated: July 2026 — Raintech HRM / HR Daddy*
