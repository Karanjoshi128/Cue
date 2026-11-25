#!/usr/bin/env bash
# Phase 2 on cue-prod-01: Node 24 LTS, pnpm, pm2, the cue (app) and deploy
# users, and the /srv/cue layout. Safe to re-run.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
PNPM_VERSION=11.5.2

echo "== Node 24 (NodeSource)"
if ! node -v 2>/dev/null | grep -q '^v24\.'; then
  install -d -m 755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -q
  apt-get -y -q install nodejs
fi
node -v

echo "== pnpm $PNPM_VERSION and pm2 (global)"
npm install -g --no-fund --no-audit "pnpm@$PNPM_VERSION" pm2@latest >/dev/null
pnpm -v; pm2 -v

echo "== users"
# cue: runs the app. No password, no sudo, no SSH login.
id cue >/dev/null 2>&1 || useradd --system --create-home --home-dir /srv/cue --shell /usr/sbin/nologin cue
# deploy: GitHub Actions logs in as this user; its key may only run cue-deploy.
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
passwd -l deploy >/dev/null

echo "== /srv/cue layout"
install -d -o cue -g cue -m 750 /srv/cue
install -d -o cue -g cue -m 750 /srv/cue/releases /srv/cue/shared /srv/cue/shared/next-cache
install -d -o cue -g cue -m 700 /srv/cue/.pm2
ls -la /srv/cue

echo "== pm2 under systemd for user cue"
env PATH="$PATH" pm2 startup systemd -u cue --hp /srv/cue >/dev/null
systemctl enable pm2-cue >/dev/null 2>&1 || true
systemctl is-enabled pm2-cue
echo "== done"
