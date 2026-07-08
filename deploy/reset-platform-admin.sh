#!/usr/bin/env bash
# Reset platform admin password to match deploy/.env on the server.
set -euo pipefail
cd /opt/hrm/deploy

env_val() { grep -E "^$1=" .env | cut -d= -f2- | tr -d '\r' | sed 's/^"//;s/"$//'; }
EMAIL=$(env_val PLATFORM_ADMIN_EMAIL)
PASS=$(env_val PLATFORM_ADMIN_PASSWORD)

if [ -z "$EMAIL" ] || [ -z "$PASS" ]; then
  echo "PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD required in deploy/.env"
  exit 1
fi

COMPOSE="sudo docker compose -f docker-compose.production.yml"

HASH=$($COMPOSE exec -T backend python3 -c "import bcrypt; print(bcrypt.hashpw('${PASS}'.encode(), bcrypt.gensalt(12)).decode())" 2>/dev/null || true)

if [ -z "$HASH" ]; then
  HASH=$(python3 -c "import bcrypt; print(bcrypt.hashpw('${PASS}'.encode(), bcrypt.gensalt(12)).decode())")
fi

NOW=$(date -u +"%Y-%m-%d %H:%M:%S")
SQL="UPDATE platform_admins SET password = '${HASH}', updated_at = '${NOW}' WHERE email = '${EMAIL}';"

echo "Resetting platform admin password for ${EMAIL}..."
$COMPOSE exec -T postgres psql -U hrm -d hrm -c "$SQL"

echo "Testing login..."
$COMPOSE exec -T caddy curl -sS -w "\nHTTP:%{http_code}\n" \
  -X POST http://backend:3001/api/platform/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\"}"
