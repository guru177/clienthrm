#!/usr/bin/env bash
set -euo pipefail
cd /opt/hrm/deploy
sudo docker compose -f docker-compose.production.yml exec -T postgres psql -U hrm -d hrm <<'SQL'
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name='users'
ORDER BY ordinal_position;
SQL
