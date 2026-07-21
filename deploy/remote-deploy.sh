#!/usr/bin/env bash
# Run on server from /opt/hrm after deploy/.env exists and database is present.
set -euo pipefail

cd /opt/hrm/deploy

env_val() { grep -E "^$1=" .env | cut -d= -f2- | tr -d '\r' | sed 's/^"//;s/"$//'; }
POSTGRES_PASSWORD=$(env_val POSTGRES_PASSWORD)
POSTGRES_USER=$(env_val POSTGRES_USER); POSTGRES_USER=${POSTGRES_USER:-hrm}
POSTGRES_DB=$(env_val POSTGRES_DB); POSTGRES_DB=${POSTGRES_DB:-hrm}
TENANT_DOMAIN=$(env_val TENANT_DOMAIN)
BACKEND_IMAGE=$(env_val BACKEND_IMAGE)

COMPOSE="sudo docker compose -f docker-compose.production.yml"

ghcr_login() {
  local token user
  token=$(env_val GHCR_TOKEN 2>/dev/null || true)
  user=$(env_val GHCR_USERNAME 2>/dev/null || true)
  if [ -n "$token" ] && [ -n "$user" ]; then
    echo "==> Log in to GHCR"
    echo "$token" | sudo docker login ghcr.io -u "$user" --password-stdin
  fi
}

pull_backend() {
  echo "==> Pull backend image (${BACKEND_IMAGE})"
  ghcr_login
  if $COMPOSE pull backend; then
    return 0
  fi
  echo "WARN: Pull failed — building backend locally (slow; fix BACKEND_IMAGE or GHCR access)"
  sudo docker build -f /opt/hrm/deploy/Dockerfile.backend -t "${BACKEND_IMAGE}" /opt/hrm
}

echo "==> Build caddy (tenant + platform static)"
$COMPOSE build caddy

pull_backend

echo "==> Start PostgreSQL"
$COMPOSE up -d postgres
for i in $(seq 1 30); do
  if $COMPOSE exec -T postgres pg_isready -U "${POSTGRES_USER:-hrm}" -d "${POSTGRES_DB:-hrm}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

# Keep role password aligned with deploy/.env (volume retains the password from first init).
$COMPOSE exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "ALTER USER \"${POSTGRES_USER}\" WITH PASSWORD '${POSTGRES_PASSWORD}';" >/dev/null 2>&1 || true

USER_COUNT=$($COMPOSE exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc "SELECT COUNT(*) FROM users" 2>/dev/null | tr -d '[:space:]' || echo 0)
if [ "${USER_COUNT:-0}" -gt 0 ] 2>/dev/null; then
  echo "==> PostgreSQL already has data (${USER_COUNT} users), skipping migration"
elif [ -f /opt/hrm/database/database.sqlite ]; then
  echo "==> Migrate SQLite -> PostgreSQL"
  export POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB
  PG_URL=$(python3 -c "import os; from urllib.parse import quote_plus; u=os.environ['POSTGRES_USER']; p=os.environ['POSTGRES_PASSWORD']; d=os.environ['POSTGRES_DB']; print(f\"postgres://{u}:{quote_plus(p)}@postgres:5432/{d}\")")
  sudo docker run --rm \
    --network deploy_hrm \
    -v /opt/hrm:/work \
    -w /work \
    -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    python:3.12-slim \
    bash -c "pip install -q psycopg2-binary && python scripts/migrate-sqlite-to-postgres.py \
      --sqlite database/database.sqlite \
      --pg-url \"${PG_URL}\""
else
  echo "WARN: No database/database.sqlite — fresh Postgres (seed only)"
fi

echo "==> Start full stack"
$COMPOSE up -d

echo "==> Sync storage files into data volume"
VOL=$(sudo docker volume inspect deploy_hrm_data --format '{{.Mountpoint}}' 2>/dev/null || true)
if [ -n "$VOL" ]; then
  sudo mkdir -p "$VOL/storage"
  for dir in chat users announcements org-notifications desktop-updates; do
    if [ -d "/opt/hrm/storage/$dir" ]; then
      sudo mkdir -p "$VOL/storage/$dir"
      sudo cp -an "/opt/hrm/storage/$dir/." "$VOL/storage/$dir/" 2>/dev/null || true
    fi
  done
  if [ -d /opt/hrm/frontend/public/storage ]; then
    for dir in chat users announcements org-notifications; do
      if [ -d "/opt/hrm/frontend/public/storage/$dir" ]; then
        sudo mkdir -p "$VOL/storage/$dir"
        sudo cp -an "/opt/hrm/frontend/public/storage/$dir/." "$VOL/storage/$dir/" 2>/dev/null || true
      fi
    done
  fi
  sudo chown -R 999:999 "$VOL/storage" 2>/dev/null || true
  echo "Storage synced to $VOL/storage"
fi

echo "==> Wait for HTTPS health"
PLATFORM_DOMAIN=$(env_val PLATFORM_DOMAIN)
for i in $(seq 1 90); do
  HEALTH=$(curl -fsSk "https://${TENANT_DOMAIN}/api/health" 2>/dev/null || true)
  if echo "$HEALTH" | grep -q '"service":"hrm-backend"'; then
    echo "$HEALTH"
    echo ""
    echo "HTTPS healthy"
    break
  fi
  sleep 5
done

$COMPOSE ps
echo "Deploy finished."
echo "Tenant:    https://${TENANT_DOMAIN}"
echo "Platform:  https://${PLATFORM_DOMAIN}"
echo "Biometric: http://$(curl -fsS http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || hostname -I | awk '{print $1}'):7788"
