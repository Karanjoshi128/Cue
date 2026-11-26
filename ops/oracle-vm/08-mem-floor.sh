#!/usr/bin/env bash
# Keeps cue-prod-01 from looking idle to Oracle.
#
# Oracle may reclaim an Always Free VM when, over 7 days, CPU (95th
# percentile), network AND memory (A1 shapes) are all under 20%. Cue alone
# uses about 8% of this VM's RAM, ~0% CPU and almost no network, so all three
# were under. Keeping just one above 20% is enough, and memory is the cheapest:
# steady all day, no CPU, no effect on visitors.
#
# `cue-mem-floor` holds spare RAM so total use stays near 30% (28-35%). It
# grows when the server is quiet and gives memory back as soon as the app,
# Postgres or a deploy build need it, down to nothing once they use 30% alone.
# The kernel kills it first under memory pressure, and it never goes to swap
# (swapped pages wouldn't count as used).
#
# Undo instantly: systemctl disable --now cue-mem-floor
# Safe to re-run.
set -euo pipefail

cat > /usr/local/sbin/cue-mem-floor <<'EOF'
#!/usr/bin/env python3
"""cue-mem-floor: hold spare RAM so total use stays near FLOOR_TARGET %.

Use = MemTotal - MemAvailable, the same idea as `free`'s "used". Written by
ops/oracle-vm/08-mem-floor.sh.
"""
import mmap
import os
import signal
import sys
import time

TARGET = float(os.environ.get("FLOOR_TARGET", "30"))  # % of RAM in use
LOW, HIGH = TARGET - 2, TARGET + 5  # grow below LOW, shrink above HIGH
CAP = int(os.environ.get("FLOOR_MAX_MB", "3500")) * 2**20  # under MemoryMax
CHUNK = 64 * 2**20
PAGE = mmap.PAGESIZE
EVERY = 30  # seconds between checks

held = []


def usage():
    m = {}
    with open("/proc/meminfo") as f:
        for line in f:
            key, rest = line.split(":", 1)
            m[key] = int(rest.split()[0]) * 1024
    total = m["MemTotal"]
    return 100 * (total - m["MemAvailable"]) / total, total


def grab():
    # Anonymous mapping, every page written so it is really resident.
    # Closing it hands the memory straight back to the kernel.
    block = mmap.mmap(-1, CHUNK, flags=mmap.MAP_PRIVATE | mmap.MAP_ANONYMOUS)
    for off in range(0, CHUNK, PAGE):
        block[off] = 1
    return block


def log(msg):
    print(msg, flush=True)


signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
last_report = 0.0
while True:
    pct, total = usage()
    before = len(held)
    if pct < LOW:
        want = int((TARGET - pct) / 100 * total) // CHUNK
        room = (CAP - len(held) * CHUNK) // CHUNK
        for _ in range(max(0, min(max(1, want), room))):
            held.append(grab())
    elif pct > HIGH and held:
        give = max(1, int((pct - TARGET) / 100 * total) // CHUNK)
        for _ in range(min(give, len(held))):
            held.pop().close()
    now = time.monotonic()
    if len(held) != before or now - last_report > 3600:
        after, _ = usage()
        log(f"in use {after:.1f}% of {total / 2**30:.1f} GiB; holding {len(held) * CHUNK // 2**20} MB")
        last_report = now
    time.sleep(EVERY)
EOF
chmod 755 /usr/local/sbin/cue-mem-floor

cat > /etc/systemd/system/cue-mem-floor.service <<'EOF'
[Unit]
Description=Cue: hold spare RAM so the VM never looks idle to Oracle (~30% in use)
After=multi-user.target

[Service]
ExecStart=/usr/local/sbin/cue-mem-floor
Environment=FLOOR_TARGET=30 FLOOR_MAX_MB=3500
Restart=always
RestartSec=60
# First to go under memory pressure; never swapped; hard cap above FLOOR_MAX_MB.
OOMScoreAdjust=1000
MemorySwapMax=0
MemoryMax=4G
Nice=19
CPUSchedulingPolicy=idle
DynamicUser=yes
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateNetwork=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now cue-mem-floor
sleep 3
systemctl --no-pager --lines=3 status cue-mem-floor | sed -n '1,3p;/in use/p'
free -m | sed -n 1,2p
