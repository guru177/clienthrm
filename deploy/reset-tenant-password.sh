#!/usr/bin/env bash
# Reset tenant user password on production.
set -euo pipefail
cd /opt/hrm/deploy

EMAIL="${1:?email required}"
PASS="${2:?password required}"

COMPOSE="sudo docker compose -f docker-compose.production.yml"

HASH=$($COMPOSE exec -T backend python3 -c "import bcrypt; print(bcrypt.hashpw('${PASS}'.encode(), bcrypt.gensalt(12)).decode())" 2>/dev/null || true)

if [ -z "$HASH" ]; then
  HASH=$(python3 -c "import bcrypt; print(bcrypt.hashpw('${PASS}'.encode(), bcrypt.gensalt(12)).decode())")
fi

NOW=$(date -u +"%Y-%m-%d %H:%M:%S")
SQL="UPDATE users SET password = '${HASH}', updated_at = '${NOW}' WHERE lower(email) = lower('${EMAIL}');"

echo "Resetting password for ${EMAIL}..."
$COMPOSE exec -T postgres psql -U hrm -d hrm -c "$SQL"

echo "Testing login..."
$CURL='sudo docker compose -f docker-compose.production.yml exec -T caddy curl -sS'
$CURL -X POST http://backend:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\"}"
