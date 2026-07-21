#!/usr/bin/env bash
# Stop HRM stack, remove DB volumes, and free disk before a clean redeploy.
set -euo pipefail

echo "==> Stop containers and remove volumes"
if [ -f /opt/hrm/deploy/docker-compose.production.yml ]; then
  cd /opt/hrm/deploy
  sudo docker compose -f docker-compose.production.yml down -v --remove-orphans || true
fi

echo "==> Remove app tree and build artifacts"
sudo rm -rf /opt/hrm/backend/target /opt/hrm /tmp/hrm-deploy.tgz /tmp/hrm-deploy.log

echo "==> Prune unused Docker data"
sudo docker system prune -af --volumes 2>/dev/null || true
sudo docker builder prune -af 2>/dev/null || true

echo "==> Disk after teardown"
df -h / | tail -1
echo "Teardown complete."
