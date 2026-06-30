#!/usr/bin/env bash
set -euo pipefail
cd /opt/hrm/deploy
COMPOSE="sudo docker compose -f docker-compose.production.yml"
$COMPOSE exec -T caddy curl -sS -w "\nHTTP:%{http_code}\n" \
  -X POST http://backend:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@mashuptech.in","password":"password"}'
