#!/usr/bin/env bash
# Phase 3 on cue-prod-01: Caddy with the Cloudflare DNS plugin, so the
# trycue.space certificate is issued by DNS-01 before DNS points here.
# Installs ./Caddyfile (run from a checkout: sudo bash ops/oracle-vm/03-caddy.sh).
# The sign-in route in it needs 05-auth.sh; until then /auth/v1 answers 502.
# Safe to re-run.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "== Caddy (official apt repo)"
if ! command -v caddy >/dev/null; then
  apt-get -y -q install debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get -y -q install caddy
fi

echo "== add the Cloudflare DNS plugin, and hold the package"
# apt would replace the plugin build on upgrade; upgrade with `caddy upgrade`.
if ! caddy list-modules 2>/dev/null | grep -q '^dns.providers.cloudflare'; then
  caddy add-package github.com/caddy-dns/cloudflare
fi
apt-mark hold caddy >/dev/null
caddy version
caddy list-modules | grep dns.providers.cloudflare

echo "== systemd: load the token file"
install -d /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/cue.conf <<'EOF'
[Service]
EnvironmentFile=/etc/caddy/cloudflare.env
EOF
systemctl daemon-reload

echo "== Caddyfile"
install -d -o caddy -g caddy /var/log/caddy
# Which local port the live app is on. The deploy script rewrites this file
# and reloads Caddy to switch traffic between 3000 and 3001.
[ -f /etc/caddy/cue-upstream.caddy ] || echo 'reverse_proxy 127.0.0.1:3000' > /etc/caddy/cue-upstream.caddy
install -m 644 "$(dirname "$0")/Caddyfile" /etc/caddy/Caddyfile
caddy fmt --overwrite /etc/caddy/Caddyfile
# Validate as the caddy user with the token loaded: as root, validation would
# create the log file root-owned and Caddy could no longer open it.
runuser -u caddy -- env $(cat /etc/caddy/cloudflare.env) caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -1
systemctl enable caddy >/dev/null
systemctl restart caddy
sleep 2
systemctl is-active caddy
echo "== done"
