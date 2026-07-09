#!/usr/bin/env bash
# One-command production deploy.
# Usage on the VPS:  cd ~/Real-Estate-CRM- && ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Pulling latest code from GitHub…"
git pull --ff-only

echo "==> Rebuilding & restarting containers…"
docker compose -f docker-compose.prod.yml up -d --build

echo "==> Cleaning up old images…"
docker image prune -f >/dev/null 2>&1 || true

echo ""
echo "✅ Deployed. Live at https://crm.bunnycreations.in"
docker compose -f docker-compose.prod.yml ps
