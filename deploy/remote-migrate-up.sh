#!/usr/bin/env bash
set -euo pipefail
cd /opt/hrm/deploy
COMPOSE="sudo docker compose -f docker-compose.production.yml"

env_val() { grep -E "^$1=" .env | cut -d= -f2- | tr -d '\r' | sed 's/^"//;s/"$//'; }

$COMPOSE down 2>/dev/null || true
sudo docker volume rm deploy_pgdata 2>/dev/null || true
$COMPOSE up -d postgres
POSTGRES_PASSWORD=$(env_val POSTGRES_PASSWORD)
POSTGRES_USER=$(env_val POSTGRES_USER); POSTGRES_USER=${POSTGRES_USER:-hrm}
POSTGRES_DB=$(env_val POSTGRES_DB); POSTGRES_DB=${POSTGRES_DB:-hrm}
TENANT_DOMAIN=$(env_val TENANT_DOMAIN)

for i in $(seq 1 30); do
  $COMPOSE exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1 && break
  sleep 2
done

PG_URL=$(python3 -c "import os; from urllib.parse import quote_plus; u='${POSTGRES_USER}'; p='${POSTGRES_PASSWORD}'; d='${POSTGRES_DB}'; print(f'postgres://{u}:{quote_plus(p)}@postgres:5432/{d}')")

echo "==> Migrate"
sudo docker run --rm --network deploy_hrm -v /opt/hrm:/work -w /work python:3.12-slim \
  bash -c "pip install -q psycopg2-binary && python scripts/migrate-sqlite-to-postgres.py --sqlite database/database.sqlite --pg-url \"${PG_URL}\""

echo "==> Start stack"
$COMPOSE up -d

echo "==> Health check"
for i in $(seq 1 60); do
  if curl -fsSk "https://${TENANT_DOMAIN}/api/health" >/dev/null 2>&1; then
    curl -fsSk "https://${TENANT_DOMAIN}/api/health"
    echo ""
    echo "HTTPS healthy"
    exit 0
  fi
  sleep 5
done
echo "Health check timed out"
$COMPOSE ps
exit 1
