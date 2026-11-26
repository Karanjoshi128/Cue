#!/usr/bin/env bash
# Stage 2 on cue-prod-01: the five scheduled jobs that Supabase pg_cron runs
# today, as systemd timers calling this VM's own app (through Caddy on
# 127.0.0.1, so they never go out to the internet and back).
#
# Installed DISABLED. They are switched on at the cutover, in the same step
# that unschedules the Supabase pg_cron jobs, so each job never runs twice.
# Safe to re-run (keeps whether they are on or off).
set -euo pipefail

cat > /usr/local/bin/cue-cron <<'EOF'
#!/usr/bin/env bash
# cue-cron <job> <timeout-seconds>: POST /api/cron/<job> with the cron secret.
set -euo pipefail
JOB=$1; MAX=${2:-60}
SECRET=$(set -a; . /srv/cue/shared/.env; printf '%s' "$CRON_SECRET")
code=$(curl -sS -o /tmp/cue-cron-$JOB.out -w '%{http_code}' --max-time "$MAX" \
  --resolve trycue.space:443:127.0.0.1 -X POST \
  -H 'Content-Type: application/json' -H @- \
  --data '{}' "https://trycue.space/api/cron/$JOB" <<<"Authorization: Bearer $SECRET")
echo "$JOB -> $code $(head -c 300 /tmp/cue-cron-$JOB.out)"
[ "$code" -lt 400 ]
EOF
chmod 755 /usr/local/bin/cue-cron

# name | systemd OnCalendar | timeout (s), same schedule and timeout as pg_cron
JOBS=(
  "publish|*:0/5|60"
  "mailer|*:*|120"
  "automations|*:1/5|60"
  "reply-desk|*:3/5|60"
  "media-retention|*:17|120"
)
for j in "${JOBS[@]}"; do
  IFS='|' read -r name cal max <<<"$j"
  cat > /etc/systemd/system/cue-cron-$name.service <<EOF
[Unit]
Description=Cue scheduled job: $name
After=network-online.target

[Service]
Type=oneshot
User=cue
Group=cue
PrivateTmp=true
ExecStart=/usr/local/bin/cue-cron $name $max
TimeoutStartSec=$((max + 15))
EOF
  cat > /etc/systemd/system/cue-cron-$name.timer <<EOF
[Unit]
Description=Cue scheduled job: $name ($cal)

[Timer]
OnCalendar=$cal
AccuracySec=1s
Persistent=false

[Install]
WantedBy=timers.target
EOF
done
systemctl daemon-reload
systemctl list-timers 'cue-cron-*' --all --no-pager | head -8
echo "== installed; enable at cutover: systemctl enable --now cue-cron-{publish,mailer,automations,reply-desk,media-retention}.timer"
