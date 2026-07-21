#!/usr/bin/env bash
set -euo pipefail
cd /opt/hrm/backend
source ~/.cargo/env 2>/dev/null || true
echo "Disk:" && df -h / | tail -1
echo "Building..."
CARGO_BUILD_JOBS=1 cargo build --release 2>&1 | tail -20
BIN=target/release/hrm-backend
if [ ! -f "$BIN" ]; then echo "Build failed"; exit 1; fi
SIZE=$(wc -c < "$BIN")
echo "Binary size: $SIZE"
if [ "$SIZE" -lt 20000000 ]; then echo "Binary too small, abort"; exit 1; fi
sudo docker cp "$BIN" deploy-backend-1:/usr/local/bin/hrm-backend
sudo docker restart deploy-backend-1
sleep 8
bash /tmp/test-pagination-lists.sh
