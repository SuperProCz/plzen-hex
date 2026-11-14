#!/usr/bin/env bash
# One-time (idempotent) server setup for the Plzeň Hex analytics API on Oracle Linux 9.
# Upload the whole server/ directory, then run on the server:  sudo bash server/deploy/setup.sh
# Installs PostgreSQL 16, Node.js 22 and Caddy 2.9.1; creates the plzenhex DB/user; starts the services;
# opens ports 80/443 in firewalld. Ports 80/443 must ALSO be allowed in the OCI subnet's security list.
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$(dirname "$DEPLOY_DIR")"
APP_DIR=/opt/plzen-hex-api
CADDY_VERSION=2.9.1
CADDY_SHA512=80b917c2bd8aa0892f1386ff97af9e776067dd8cdc4793238869aca7e13f7280f89d1799a1fef08b49af92dbd86684c3ba7a38b9d44afc55ef2eeb33b49e1cbd

echo "== Packages"
dnf -y module reset postgresql nodejs >/dev/null
dnf -y module enable postgresql:16 nodejs:22 >/dev/null
dnf -y install postgresql-server postgresql nodejs npm tar >/dev/null

echo "== PostgreSQL"
if [ ! -f /var/lib/pgsql/data/PG_VERSION ]; then postgresql-setup --initdb; fi
systemctl enable --now postgresql
id plzenhex >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /sbin/nologin plzenhex
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='plzenhex'" | grep -q 1 || sudo -u postgres createuser plzenhex
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='plzenhex'" | grep -q 1 || sudo -u postgres createdb -O plzenhex plzenhex
sudo -u plzenhex psql -d plzenhex -v ON_ERROR_STOP=1 -f - < "$SRC_DIR/schema.sql"

echo "== API"
mkdir -p "$APP_DIR"
cp "$SRC_DIR"/{index.js,batch.js,package.json,schema.sql} "$APP_DIR/"
(cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund >/dev/null)
chown -R root:root "$APP_DIR"
cp "$DEPLOY_DIR/plzen-hex-api.service" /etc/systemd/system/

echo "== Caddy"
if ! /usr/local/bin/caddy version 2>/dev/null | grep -q "v$CADDY_VERSION"; then
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/caddy.tar.gz" "https://github.com/caddyserver/caddy/releases/download/v$CADDY_VERSION/caddy_${CADDY_VERSION}_linux_arm64.tar.gz"
  echo "$CADDY_SHA512  $tmp/caddy.tar.gz" | sha512sum -c -
  tar -xzf "$tmp/caddy.tar.gz" -C "$tmp" caddy
  install -m 0755 "$tmp/caddy" /usr/local/bin/caddy
  rm -rf "$tmp"
fi
id caddy >/dev/null 2>&1 || useradd --system --home-dir /var/lib/caddy --create-home --shell /sbin/nologin caddy
mkdir -p /etc/caddy
cp "$DEPLOY_DIR/Caddyfile" /etc/caddy/Caddyfile
cp "$DEPLOY_DIR/caddy.service" /etc/systemd/system/
# SELinux: allow the binary in /usr/local/bin to run as a service and bind 80/443.
restorecon -v /usr/local/bin/caddy >/dev/null 2>&1 || true

echo "== Firewall"
firewall-cmd --permanent --add-service=http --add-service=https >/dev/null
firewall-cmd --reload >/dev/null

echo "== Start"
systemctl daemon-reload
systemctl enable --now plzen-hex-api caddy
systemctl restart plzen-hex-api caddy
sleep 2
curl -fsS http://127.0.0.1:8787/api/health && echo "  ← API OK"
echo "Done. Check HTTPS from outside: curl https://92-5-185-123.sslip.io/api/health"
