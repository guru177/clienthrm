#!/usr/bin/env bash
set -euo pipefail
echo "==> Kill duplicate cargo builds"
pkill -f 'cargo build --release' 2>/dev/null || true
sleep 2

echo "==> Free disk"
sudo docker system prune -af --volumes 2>/dev/null || true
sudo journalctl --vacuum-size=50M 2>/dev/null || true
sudo rm -rf /opt/hrm/backend/target /tmp/cargo-* /home/ubuntu/.cargo/registry/cache
df -h / | tail -1

echo "==> Build (single job)"
cd /opt/hrm/backend
source ~/.cargo/env
export CARGO_BUILD_JOBS=1
cargo build --release 2>&1 | tee /tmp/cargo-rebuild.log | tail -30

BIN=target/release/hrm-backend
if [ ! -f "$BIN" ]; then
  echo "BUILD FAILED"
  grep -i 'error\|no space' /tmp/cargo-rebuild.log | tail -10
  exit 1
fi
SIZE=$(wc -c < "$BIN")
echo "Binary size: $SIZE"
[ "$SIZE" -gt 20000000 ] || { echo "Binary too small"; exit 1; }

echo "==> Deploy"
sudo docker cp "$BIN" deploy-backend-1:/usr/local/bin/hrm-backend
sudo docker restart deploy-backend-1
sleep 10

echo "==> Verify lists"
bash /tmp/test-pagination-lists.sh
