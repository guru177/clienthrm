#!/usr/bin/env bash
head -15 /tmp/deploy-pagination.log 2>/dev/null || true
df -h / | tail -1
cd /opt/hrm/deploy
sudo docker compose -f docker-compose.production.yml exec -T postgres psql -U hrm -d hrm -c "SELECT id, email FROM users WHERE id=1;"
sudo docker ps --filter name=deploy-backend --format "{{.Status}}"
