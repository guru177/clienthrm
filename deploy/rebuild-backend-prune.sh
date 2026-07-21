#!/usr/bin/env bash
set -euo pipefail
COMPOSE="sudo docker compose -f /opt/hrm/deploy/docker-compose.production.yml"

echo "==> Stop backend only (keep postgres)"
$COMPOSE stop backend 2>/dev/null || true

echo "==> Aggressive docker cleanup"
sudo docker image prune -af
sudo docker builder prune -af
sudo rm -rf /opt/hrm/backend/target
sudo apt-get clean 2>/dev/null || true
sudo journalctl --vacuum-size=20M 2>/dev/null || true
df -h / | tail -1

echo "==> Build backend"
cd /opt/hrm/backend
source ~/.cargo/env
export CARGO_BUILD_JOBS=1
cargo build --release 2>&1 | tee /tmp/cargo-final2.log | tail -25

BIN=target/release/hrm-backend
[ -f "$BIN" ] || { echo BUILD FAILED; tail -20 /tmp/cargo-final2.log; exit 1; }
SIZE=$(wc -c < "$BIN")
echo "Binary size: $SIZE bytes"
[ "$SIZE" -gt 20000000 ] || exit 1

echo "==> Deploy binary"
sudo docker cp "$BIN" deploy-backend-1:/usr/local/bin/hrm-backend
$COMPOSE start backend
sleep 10

echo "==> Verify"
bash /tmp/test-pagination-lists.sh
df -h / | tail -1
