#!/usr/bin/env bash
set -euo pipefail
cd /opt/hrm/deploy

echo "==> Load backend image"
sudo docker load -i /tmp/hrm-backend-fix.tar

echo "==> Point compose at local fix image"
if grep -q '^BACKEND_IMAGE=' .env; then
  sed -i 's|^BACKEND_IMAGE=.*|BACKEND_IMAGE=hrm-backend-fix:latest|' .env
else
  echo 'BACKEND_IMAGE=hrm-backend-fix:latest' >> .env
fi

echo "==> Reset tenant password"
EMAIL='info@retaildaddy.in'
PASS='password@123'
HASH=$(python3 -c "import bcrypt; print(bcrypt.hashpw('${PASS}'.encode(), bcrypt.gensalt(12)).decode())")
NOW=$(date -u +"%Y-%m-%d %H:%M:%S")
sudo docker compose -f docker-compose.production.yml exec -T postgres psql -U hrm -d hrm \
  -c "UPDATE users SET password = '${HASH}', updated_at = '${NOW}' WHERE lower(email) = lower('${EMAIL}');"

echo "==> Restart backend"
sudo docker compose -f docker-compose.production.yml up -d backend
sleep 8

echo "==> Test login"
sudo docker compose -f docker-compose.production.yml exec -T caddy curl -sS \
  -X POST http://backend:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"info@retaildaddy.in","password":"password@123"}'
