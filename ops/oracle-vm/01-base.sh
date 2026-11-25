#!/usr/bin/env bash
# Phase 1 on cue-prod-01: updates, base packages, swap, firewall, fail2ban,
# automatic security updates. Safe to re-run.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "== apt update/upgrade"
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade
apt-get -y -q install ca-certificates curl gnupg git jq fail2ban unattended-upgrades \
  netfilter-persistent iptables-persistent build-essential python3 rsync logrotate

echo "== swap 4G"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
cat > /etc/sysctl.d/90-cue.conf <<'EOF'
vm.swappiness=10
EOF
sysctl -q --system

echo "== firewall: open 80/443 before the final REJECT"
for p in 80 443; do
  if ! iptables -C INPUT -p tcp -m state --state NEW -m tcp --dport "$p" -j ACCEPT 2>/dev/null; then
    # Insert right after the SSH rule, i.e. before the catch-all REJECT.
    line=$(iptables -L INPUT --line-numbers -n | awk '/dpt:22/ {print $1; exit}')
    iptables -I INPUT $((line + 1)) -p tcp -m state --state NEW -m tcp --dport "$p" -j ACCEPT
  fi
done
netfilter-persistent save

echo "== ssh: no root login at all (keys only already)"
cat > /etc/ssh/sshd_config.d/90-cue.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
MaxAuthTries 4
EOF
sshd -t
systemctl reload ssh

echo "== fail2ban for ssh"
cat > /etc/fail2ban/jail.d/cue.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "== automatic security updates, reboot if needed at 21:30 UTC (03:00 IST)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52cue-unattended <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "21:30";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF

echo "== journald cap"
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/90-cue.conf <<'EOF'
[Journal]
SystemMaxUse=1G
EOF
systemctl restart systemd-journald

echo "== done"
iptables -S INPUT
swapon --show
fail2ban-client status sshd | tail -3
[ -f /var/run/reboot-required ] && echo "REBOOT REQUIRED" || echo "no reboot needed"
