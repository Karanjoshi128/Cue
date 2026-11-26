#!/usr/bin/env bash
# Stage 2 on cue-prod-01: Supabase Auth (GoTrue) as a plain systemd service on
# 127.0.0.1:9999, behind Caddy at https://trycue.space/auth/v1. Only the Auth
# server is self-hosted; Cue uses nothing else from Supabase.
# Needs 04-postgres.sh first. Safe to re-run: keys and secrets are kept.
set -euo pipefail
VER=v2.199.0
SHA=629215d75323cfea6a12788f76104a5ceaca47b50bab8989eba8c09c51265d8f
DIR=/opt/cue-auth
CONF=/etc/cue-auth

echo "== user + binary $VER"
id cueauth >/dev/null 2>&1 || useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin cueauth
if [ ! -x $DIR/$VER/gotrue ]; then
  tmp=$(mktemp -d)
  curl -sSLo $tmp/auth.tgz https://github.com/supabase/auth/releases/download/$VER/auth-$VER-arm64.tar.gz
  echo "$SHA  $tmp/auth.tgz" | sha256sum -c -
  install -d $DIR/$VER
  tar -xzf $tmp/auth.tgz -C $DIR/$VER
  rm -rf $tmp
fi
ln -sfn $DIR/$VER $DIR/current

echo "== keys (generated once)"
install -d -m 750 -g cueauth $CONF
TPL=/etc/caddy/cue-auth-templates
install -d -m 755 $TPL
if [ ! -s $CONF/keys.json ]; then
  (umask 077; node - > $CONF/keys.json <<'JS'
const c = require("crypto");
const b64u = (b) => Buffer.from(b).toString("base64url");
const secret = c.randomBytes(48).toString("base64url");
const { privateKey } = c.generateKeyPairSync("ec", { namedCurve: "P-256" });
const ec = privateKey.export({ format: "jwk" });
const kid = c.randomUUID();
const sign = (payload) => {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64u(JSON.stringify(payload));
  return `${h}.${p}.` + c.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
};
const now = Math.floor(Date.now() / 1000), ten = now + 10 * 365 * 86400;
console.log(JSON.stringify({
  jwt_secret: secret,
  jwt_keys: [
    { ...ec, kid, alg: "ES256", use: "sig", key_ops: ["sign", "verify"] },
    { kty: "oct", k: Buffer.from(secret).toString("base64url"), kid: "legacy-hs256", alg: "HS256", key_ops: ["verify"] },
  ],
  anon_key: sign({ iss: "supabase", role: "anon", iat: now, exp: ten }),
  service_role_key: sign({ iss: "supabase", role: "service_role", iat: now, exp: ten }),
}));
JS
  )
fi
chmod 600 $CONF/keys.json

echo "== email templates (served to GoTrue by Caddy on 127.0.0.1:8089)"
cat > $TPL/code.html <<'EOF'
<!doctype html>
<html><body style="font-family:Georgia,serif;background:#f6f3ec;color:#1c1b19;padding:32px">
<div style="max-width:440px;margin:0 auto;background:#fffdf8;border:1px solid #e4ded1;border-radius:12px;padding:28px">
<p style="font-size:18px;margin:0 0 16px">Your Cue sign-in code</p>
<p style="font-size:32px;letter-spacing:6px;font-family:Menlo,Consolas,monospace;margin:0 0 16px"><strong>{{ .Token }}</strong></p>
<p style="font-size:14px;color:#5b574f;margin:0">Type this code on the Cue sign-in page. It works once and expires in one hour.
If you didn't ask for it, you can ignore this email.</p>
</div></body></html>
EOF

echo "== env file"
AUTH_PW=$(cat /etc/cue-db/supabase_auth_admin.pw)
node -e '
const k = require(process.argv[1]);
const out = [
  ["GOTRUE_JWT_SECRET", k.jwt_secret],
  ["GOTRUE_JWT_KEYS", JSON.stringify(k.jwt_keys)],
];
process.stdout.write(out.map(([a, b]) => `${a}=${b}`).join("\n") + "\n");
' $CONF/keys.json > $CONF/keys.env
# Resend SMTP: the password is the Resend API key. Kept in its own file so a
# re-run never wipes it. Empty until Karan adds the key.
[ -f $CONF/smtp.env ] || (umask 077; printf 'GOTRUE_SMTP_PASS=\n' > $CONF/smtp.env)
cat > $CONF/auth.env <<EOF
GOTRUE_API_HOST=127.0.0.1
PORT=9999
API_EXTERNAL_URL=https://trycue.space/auth/v1
GOTRUE_DB_DRIVER=postgres
GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:$AUTH_PW@127.0.0.1:5432/cue?search_path=auth&sslmode=disable
GOTRUE_DB_MIGRATIONS_PATH=$DIR/current/migrations
GOTRUE_DB_MAX_POOL_SIZE=10
GOTRUE_SITE_URL=https://trycue.space
GOTRUE_URI_ALLOW_LIST=https://trycue.space/**
GOTRUE_JWT_EXP=3600
GOTRUE_JWT_AUD=authenticated
GOTRUE_JWT_ADMIN_ROLES=service_role
GOTRUE_DISABLE_SIGNUP=false
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_EXTERNAL_PHONE_ENABLED=false
GOTRUE_MAILER_AUTOCONFIRM=false
GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=true
GOTRUE_MAILER_OTP_EXP=3600
GOTRUE_MAILER_OTP_LENGTH=6
GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=http://127.0.0.1:8089/code.html
GOTRUE_MAILER_TEMPLATES_CONFIRMATION=http://127.0.0.1:8089/code.html
GOTRUE_MAILER_SUBJECTS_MAGIC_LINK=Your Cue sign-in code
GOTRUE_MAILER_SUBJECTS_CONFIRMATION=Your Cue sign-in code
GOTRUE_SMTP_HOST=smtp.resend.com
GOTRUE_SMTP_PORT=465
GOTRUE_SMTP_USER=resend
GOTRUE_SMTP_ADMIN_EMAIL=login@trycue.space
GOTRUE_SMTP_SENDER_NAME=Cue
GOTRUE_SMTP_MAX_FREQUENCY=60s
GOTRUE_RATE_LIMIT_EMAIL_SENT=60
GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true
GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=10
GOTRUE_LOG_LEVEL=info
EOF
chown root:cueauth $CONF/auth.env $CONF/keys.env $CONF/smtp.env
chmod 640 $CONF/auth.env $CONF/keys.env $CONF/smtp.env

echo "== systemd unit"
cat > /etc/systemd/system/cue-auth.service <<EOF
[Unit]
Description=Cue sign-in (Supabase Auth $VER)
After=network-online.target postgresql@17-main.service
Wants=network-online.target
Requires=postgresql@17-main.service

[Service]
User=cueauth
Group=cueauth
WorkingDirectory=$DIR/current
EnvironmentFile=$CONF/auth.env
EnvironmentFile=$CONF/keys.env
EnvironmentFile=$CONF/smtp.env
ExecStart=$DIR/current/gotrue
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
MemoryMax=512M

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable cue-auth >/dev/null
systemctl restart cue-auth
sleep 4
systemctl is-active cue-auth
curl -fsS http://127.0.0.1:9999/health; echo
echo "== done"
