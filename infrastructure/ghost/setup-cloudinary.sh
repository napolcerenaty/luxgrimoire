#!/bin/sh
set -e

# ── Cloudinary adapter setup ────────────────────────────────────────────
# This runs every container start, AFTER Coolify's volume is mounted.
# Copies the pre-installed adapter from node_modules into content/adapters.

ADAPTER_SRC="/var/lib/ghost/node_modules/ghost-storage-cloudinary"
ADAPTER_DST="/var/lib/ghost/content/adapters/storage/cloudinary"

if [ ! -f "$ADAPTER_DST/index.js" ]; then
  echo "[ghost-setup] Installing Cloudinary storage adapter..."
  mkdir -p "$ADAPTER_DST"
  cp -r "$ADAPTER_SRC/." "$ADAPTER_DST/"
  echo "[ghost-setup] Done."
else
  echo "[ghost-setup] Cloudinary adapter already present, skipping."
fi

# ── Hand off to Ghost's original entrypoint ─────────────────────────────
exec /usr/local/bin/docker-entrypoint.sh "$@"
