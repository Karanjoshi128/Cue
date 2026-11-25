# Cue on the Oracle VM: runbook

Stage 1 of [oracle-free-tier-migration.md](oracle-free-tier-migration.md): the
Next.js app runs on our own VM. The database and sign-in stay on Supabase,
media stays in R2. Set up 25 Nov 2026.

## The machine

| | |
|---|---|
| Name | `cue-prod-01`, Oracle Cloud (Karan's second account), Mumbai AD-1 |
| Shape | VM.Standard.A1.Flex, 2 OCPU / 12 GB (the whole Always Free A1 allowance), ARM64 |
| OS | Ubuntu 24.04 aarch64, 45 GB disk, 4 GB swap file |
| Public IP | `130.210.64.74` |
| Admin login | `ssh -i ~/.ssh/ssh-key-2026-11-18.key ubuntu@130.210.64.74` (the only copy of that key is on Karan's PC) |

Oracle reclaims an idle Always Free VM when CPU (95th percentile), network
and memory all stay under 20% for 7 days. Watch the instance's Metrics page.

## What runs on it

```
internet ─▶ Caddy :80/:443 (TLS) ─▶ Next.js (pm2, user cue) 127.0.0.1:3000 or :3001
                                        │
                                        ├─▶ Supabase Postgres + Auth (unchanged)
                                        └─▶ R2 (media.trycue.space)
```

- **Caddy** (`/etc/caddy/Caddyfile`, source in [ops/oracle-vm/Caddyfile](../ops/oracle-vm/Caddyfile)).
  It terminates HTTPS, redirects `www` to the apex, gzips/zstds responses,
  and caps request bodies at 100 MB. The certificate comes from Let's Encrypt
  by **DNS-01 through Cloudflare** (plugin `caddy-dns/cloudflare`), using a
  token in `/etc/caddy/cloudflare.env`. The token is limited to DNS edits on
  `trycue.space` and only works from this VM's IP. Renewal is automatic.
- **The app** runs as user `cue` (no login, no sudo) under pm2 (`PM2_HOME=/srv/cue/.pm2`),
  started at boot by the `pm2-cue` systemd unit.
- **Firewall**: Oracle's security list and the VM's `iptables` both allow only
  22, 80 and 443. Postgres, the app ports and pm2 are never public.
- **Hardening**: SSH keys only, no root login, fail2ban on SSH, automatic
  security updates (reboots at 21:30 UTC, 03:00 IST, only when an update needs one),
  journald capped at 1 GB.

Setup scripts, in order: [01-base.sh](../ops/oracle-vm/01-base.sh),
[02-runtime.sh](../ops/oracle-vm/02-runtime.sh), [03-caddy.sh](../ops/oracle-vm/03-caddy.sh).
All are safe to re-run.

## Files

| Path | What |
|---|---|
| `/srv/cue/shared/.env` | Production environment (owner `cue`, mode 600). **Never in git.** |
| `/srv/cue/releases/<utc>-<sha7>/` | One folder per deploy, last 3 kept |
| `/srv/cue/current` | Symlink to the live release |
| `/srv/cue/repo.git` | Bare clone the deploys build from |
| `/etc/caddy/cue-upstream.caddy` | Which port gets traffic; rewritten by each deploy |
| `/usr/local/bin/cue-deploy` | The deploy script ([source](../ops/oracle-vm/cue-deploy)) |
| `/var/log/caddy/trycue.log` | Access log (rolled at 50 MB, 5 kept) |

## Deploying

Merging to `main` deploys automatically: the
[deploy-vm workflow](../.github/workflows/deploy-vm.yml) SSHes in as `deploy`
and runs `cue-deploy deploy <sha>`. The `deploy` user's key is locked to that
script (forced command): it can only `deploy <sha>`, `rollback` or `status`.

What `cue-deploy deploy` does:

1. Fetches `main` and checks the commit is on it.
2. Unpacks it into a new release folder, links the shared `.env` and build cache.
3. `pnpm install --frozen-lockfile`, then `pnpm build`.
4. Starts it on the spare port (3000/3001) and waits for `/api/health` to return 200
   (the app is up and the database answers).
5. Points Caddy at the new port (graceful reload, no dropped requests), then
   stops the old process with a 30 s grace period so `after()` work finishes.
6. Deletes releases beyond the last 3.

If any step fails, the live release keeps serving and the workflow turns red.

**Database changes still go first**: apply schema SQL to production before
merging code that needs it, as before.

**Rollback**: Actions → deploy-vm → Run workflow → `rollback`. It restarts the
previous release (already built) and switches to it in seconds. Or on the VM:
`sudo cue-deploy rollback`.

**Status**: `sudo cue-deploy status` (live release, commit, pm2 list).

Vercel also still deploys every merge, so it stays a warm fallback.

## Everyday commands (as `ubuntu`)

```bash
sudo cue-deploy status
sudo -u cue PM2_HOME=/srv/cue/.pm2 pm2 logs --lines 100     # app logs
sudo -u cue PM2_HOME=/srv/cue/.pm2 pm2 monit                # live CPU/memory
sudo journalctl -u caddy -f                                 # Caddy
sudo tail -f /var/log/caddy/trycue.log                      # requests
sudo fail2ban-client status sshd
```

Changing an environment variable: edit `/srv/cue/shared/.env` (as root),
then **redeploy** (Run workflow → deploy). `NEXT_PUBLIC_*` values are baked
in at build time, and a restart alone would keep the old ones.

## Monthly maintenance (about 15 minutes)

- `sudo apt update && sudo apt upgrade` (security updates already install themselves daily).
- `sudo caddy upgrade` (keeps the Cloudflare plugin; the apt package is held so apt never replaces it), then `sudo systemctl restart caddy`.
- `sudo npm install -g pm2@latest && sudo -u cue PM2_HOME=/srv/cue/.pm2 pm2 update`.
- Check disk (`df -h`), memory, and the Oracle Metrics page.

## Switching the site to the VM (stage 1 cutover)

Not done yet. In Cloudflare → `trycue.space` → DNS:

1. Edit the `A` record `trycue.space`: `216.198.79.1` → `130.210.64.74`, DNS only, TTL Auto.
2. Edit `www`: change the CNAME `cname.vercel-dns.com` to an `A` record `130.210.64.74`, DNS only.
3. Within about 5 minutes, all traffic, cron calls and webhooks reach the VM.
   Check: sign in, open the calendar, upload, and watch `pm2 logs` for the next
   `/api/cron/publish` call.

**Rollback**: put the two records back (`216.198.79.1`, `cname.vercel-dns.com`).
Both hosts use the same database, so nothing is lost either way.

Before switching, fill the values still missing from `/srv/cue/shared/.env`
(they're marked at the bottom of the file). Vercel stores them as sensitive,
so they can't be read back.

## Later: Cloudflare proxy in front (optional hardening)

Once the VM has run stably for a few days:

1. Cloudflare → Security → WAF → custom rule "Machine callers", action **Skip**
   (skip Security Level, Browser Integrity Check and the remaining custom rules):
   ```
   starts_with(http.request.uri.path, "/api/cron/") or starts_with(http.request.uri.path, "/api/v1/") or starts_with(http.request.uri.path, "/api/webhooks/") or starts_with(http.request.uri.path, "/api/mcp") or starts_with(http.request.uri.path, "/api/oauth/") or starts_with(http.request.uri.path, "/.well-known/")
   ```
2. Keep **Bot Fight Mode off**: it can't skip paths and would block publishing.
3. In the Caddyfile, trust Cloudflare's ranges so logs and rate limits see real
   visitor IPs (`trusted_proxies` + `client_ip_headers CF-Connecting-IP`).
4. Turn the `@` and `www` records orange (proxied). SSL mode is already Full (strict),
   and Caddy's Let's Encrypt certificate keeps working behind the proxy.
5. Then limit ports 80/443 to Cloudflare's IP ranges in both firewalls.

Limits behind the proxy: 100 s per request and 100 MB request bodies.
