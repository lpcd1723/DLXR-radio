#!/usr/bin/env bash
set -e

# Configuration - adjust HOMELAB_HOST and HOMELAB_PATH to your server setup
HOMELAB_HOST="${HOMELAB_HOST:-homelab}"
HOMELAB_PATH="${HOMELAB_PATH:-~/projects/college-radio-demo}"

echo "==> Deploying IADT Radio to $HOMELAB_HOST ($HOMELAB_PATH)..."

ssh "$HOMELAB_HOST" << EOF
  cd "$HOMELAB_PATH"
  git pull origin main
  docker compose up -d --build
  echo "==> Deployment complete!"
EOF
