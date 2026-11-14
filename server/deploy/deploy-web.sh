#!/usr/bin/env bash
# Builds the web app and publishes it to the server (served by Caddy from /srv/plzen-hex).
# Usage (from the repo root):  SSH_KEY=~/Downloads/cau.key bash server/deploy/deploy-web.sh
set -euo pipefail
HOST=${HOST:-opc@92.5.185.123}
KEY=${SSH_KEY:-$HOME/Downloads/cau.key}
npm run build
# Upload to a fresh directory, then swap it in, so visitors never see a half-copied site.
COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs -C dist -czf - . | ssh -i "$KEY" "$HOST" '
  set -e
  sudo rm -rf /srv/plzen-hex.new && sudo mkdir -p /srv/plzen-hex.new
  sudo tar -xzf - -C /srv/plzen-hex.new --no-same-owner
  sudo chmod -R a+rX /srv/plzen-hex.new
  sudo rm -rf /srv/plzen-hex.old
  if [ -d /srv/plzen-hex ]; then sudo mv /srv/plzen-hex /srv/plzen-hex.old; fi
  sudo mv /srv/plzen-hex.new /srv/plzen-hex
  sudo restorecon -R /srv/plzen-hex >/dev/null 2>&1 || true'
echo "Published: https://92-5-185-123.sslip.io/  (dashboard: /dashboard/)"
