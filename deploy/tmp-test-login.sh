#!/usr/bin/env bash
set -euo pipefail
cd /opt/hrm/deploy
CURL='sudo docker compose -f docker-compose.production.yml exec -T caddy curl -sS'

echo "=== login without slug ==="
$CURL -X POST http://backend:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"info@retaildaddy.in","password":"password"}'

echo
echo "=== login with slug mashuptech ==="
$CURL -X POST http://backend:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"info@retaildaddy.in","password":"password","org_slug":"mashuptech"}'

echo
echo "=== platform admin ==="
$CURL -X POST http://backend:3001/api/platform/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@retaildaddy.in","password":"RaintechCzTV#AMv7SwwrEtl!"}'
