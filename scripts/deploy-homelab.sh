#!/usr/bin/env bash
set -e

HOST="${DEPLOY_HOST:-root@192.168.0.53}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/id_ed25519}"
TARGET_DIR="/srv/college-radio-demo"

echo "==> Deploying DLXR Radio to $HOST ($TARGET_DIR)..."

tar --exclude='node_modules' --exclude='.git' -cf - . | ssh -i "$KEY" "$HOST" "mkdir -p $TARGET_DIR/data && tar -xvf - -C $TARGET_DIR && cd $TARGET_DIR && docker build -t radio-visualizer . && docker stop radio-visualizer && docker rm radio-visualizer && docker run -d --name radio-visualizer --restart unless-stopped -p 3030:8080 -v $TARGET_DIR/data:/app/data -e PORT=8080 -e DATA_DIR=/app/data -e AZURACAST_HOST=192.168.0.53 -e STATION_SHORTCODE=iadt_radio -e DJ_KEY=dlxr2026 radio-visualizer"

echo "==> Deployment complete! Live on https://iadt-radio.online"
