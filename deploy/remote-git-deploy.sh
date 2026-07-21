#!/usr/bin/env bash
# Pull latest code from git, build frontends, and redeploy Docker stack.
set -euo pipefail

APP_DIR=/opt/hrm
BRANCH="${HRM_GIT_BRANCH:-main}"

cd "${APP_DIR}"

if [ ! -d .git ]; then
  echo "ERROR: ${APP_DIR} is not a git repo. Run deploy/remote-git-setup.sh first."
  exit 1
fi

if [ ! -f deploy/.env ]; then
  echo "ERROR: deploy/.env missing. Copy deploy/.env.production.example and configure secrets."
  exit 1
fi

env_val() { grep -E "^$1=" deploy/.env | cut -d= -f2- | tr -d '\r' | sed 's/^"//;s/"$//'; }
TENANT_DOMAIN=$(env_val TENANT_DOMAIN)
PLATFORM_DOMAIN=$(env_val PLATFORM_DOMAIN)
TENANT_URL="https://${TENANT_DOMAIN}"
PLATFORM_URL="https://${PLATFORM_DOMAIN}"

echo "==> Git pull (${BRANCH})"
git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js required. Re-run deploy/remote-git-setup.sh or install Node 20+."
  exit 1
fi

echo "==> Build tenant frontend"
cd "${APP_DIR}/frontend"
npm ci
export VITE_API_URL="${TENANT_URL}/api"
export VITE_PLATFORM_APP_URL="${PLATFORM_URL}"
npm run build

echo "==> Build platform frontend"
cd "${APP_DIR}/platform"
npm ci
export VITE_TENANT_APP_URL="${TENANT_URL}"
npm run build

echo "==> Docker deploy"
bash "${APP_DIR}/deploy/remote-deploy.sh"
