#!/usr/bin/env bash
# Stage 2 on cue-prod-01: nightly encrypted backup of the database and the
# server's secrets.
#
# - pg_dump of database `cue` (app data + sign-in users) and the roles.
# - A tarball of the config needed to rebuild the server (.env, Auth keys,
#   DB passwords, Caddy).
# - Both encrypted with `age` to a public key. The private key is NOT on this
#   server (it lives on Karan's PC), so a stolen backup can't be read.
# - Kept 14 days in /srv/backups/nightly, and copied to the R2 bucket
#   `cue-backups` once /etc/cue-backup/r2.env exists (bucket + its own key).
# Safe to re-run.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
command -v age >/dev/null || apt-get -y -q install age
install -d -m 700 /etc/cue-backup /srv/backups/nightly
[ -s /etc/cue-backup/recipient.txt ] || { echo "missing /etc/cue-backup/recipient.txt (age public key)"; exit 1; }

cat > /usr/local/sbin/cue-backup <<'EOF'
#!/usr/bin/env bash
# cue-backup: one encrypted backup now. Prints where it went.
set -euo pipefail
cd /
TS=$(date -u +%Y%m%d-%H%M%S)
OUT=/srv/backups/nightly
REC=/etc/cue-backup/recipient.txt
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
runuser -u postgres -- pg_dump -d cue -Fc > "$tmp/cue.dump"
runuser -u postgres -- pg_dumpall --globals-only > "$tmp/globals.sql"
tar -C / --exclude=srv/cue/shared/next-cache -cf "$tmp/config.tar" srv/cue/shared etc/cue-auth etc/cue-db etc/caddy etc/cue-backup/recipient.txt 2>/dev/null
tar -C "$tmp" -cf - cue.dump globals.sql config.tar | zstd -q -10 | age -R "$REC" > "$OUT/cue-$TS.tar.zst.age"
chmod 600 "$OUT/cue-$TS.tar.zst.age"
ls -l "$OUT/cue-$TS.tar.zst.age" | awk '{print "local: "$9" ("$5" bytes)"}'
find "$OUT" -name 'cue-*.tar.zst.age' -mtime +14 -delete
if [ -s /etc/cue-backup/r2.env ]; then
  # r2.env: R2_ACCOUNT_ID, R2_BACKUP_KEY_ID, R2_BACKUP_SECRET (bucket cue-backups)
  set -a; . /etc/cue-backup/r2.env; set +a
  # A single signed PUT with curl (R2 speaks the S3 API). The key goes in on
  # stdin, so it never shows in the process list.
  F="$OUT/cue-$TS.tar.zst.age"
  code=$(printf 'user = "%s:%s"\n' "$R2_BACKUP_KEY_ID" "$R2_BACKUP_SECRET" | curl -sS -K - \
    --aws-sigv4 "aws:amz:auto:s3" --retry 3 --max-time 600 -o /dev/null -w '%{http_code}' \
    -H "x-amz-content-sha256: $(sha256sum "$F" | cut -d' ' -f1)" -T "$F" \
    "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com/cue-backups/nightly/cue-$TS.tar.zst.age")
  [ "$code" = 200 ] || { echo "off-site upload FAILED (HTTP $code)"; exit 1; }
  echo "off-site: r2:cue-backups/nightly/cue-$TS.tar.zst.age"
else
  echo "off-site: SKIPPED (no /etc/cue-backup/r2.env yet)"
fi
date -u +%FT%TZ > /srv/backups/nightly/LAST_OK
EOF
chmod 750 /usr/local/sbin/cue-backup
command -v zstd >/dev/null || apt-get -y -q install zstd

cat > /etc/systemd/system/cue-backup.service <<'EOF'
[Unit]
Description=Cue nightly encrypted backup
After=postgresql@17-main.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/cue-backup
Nice=10
EOF
cat > /etc/systemd/system/cue-backup.timer <<'EOF'
[Unit]
Description=Cue nightly backup, 20:30 UTC (02:00 IST), before the 21:30 UTC update reboot

[Timer]
OnCalendar=*-*-* 20:30:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now cue-backup.timer >/dev/null
systemctl list-timers cue-backup.timer --no-pager | head -2
echo "== done"
