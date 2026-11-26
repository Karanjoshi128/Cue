# Cue on the Oracle VM: runbook

This runbook covers [oracle-free-tier-migration.md](oracle-free-tier-migration.md).
It moves Cue off Vercel and Supabase onto one VM of our own, in two stages:

- **Stage 1**: the Next.js app runs on the VM. The database and sign-in stay on Supabase.
- **Stage 2**: the database (PostgreSQL 17), sign-in (Supabase Auth, self-hosted) and the
  scheduled jobs move onto the same VM.

Media stays in R2 throughout. The server was built on 25–26 Nov 2026, and both stages
were rehearsed there. **Neither stage is switched on yet:** the public site still runs
on Vercel and Supabase. See [Switching over](#switching-over).

## The machine

| | |
|---|---|
| Name | `cue-prod-01`, Oracle Cloud (Karan's second account), Mumbai AD-1 |
| Shape | VM.Standard.A1.Flex, 2 OCPU / 12 GB (the whole Always Free A1 allowance), ARM64 |
| OS | Ubuntu 24.04 aarch64, 45 GB disk, 4 GB swap file |
| Public IP | `130.210.64.74` |
| Admin login | `ssh -i ~/.ssh/ssh-key-2026-11-18.key ubuntu@130.210.64.74` (the only copy of that key is on Karan's PC) |
| Backup key | `~/.ssh/cue-backup-age.key` on Karan's PC. It's the only key that can decrypt backups and isn't on the server. **Keep a second copy somewhere safe** (a password manager). |

Oracle reclaims an idle Always Free VM when CPU (95th percentile), network
and memory all stay under 20% for 7 days. Watch the instance's Metrics page.

## What runs on it

```
internet ─▶ Caddy :80/:443 (TLS)
              ├─ /auth/v1/*  ─▶ Supabase Auth (cue-auth, 127.0.0.1:9999)  ─┐
              └─ everything else ─▶ Next.js (pm2, user cue) :3000 or :3001 ─┤
                                                                            ├─▶ PostgreSQL 17 (127.0.0.1:5432, db "cue")
systemd timers (cue-cron-*) ─▶ the app's /api/cron/* every 1–5 min          │
nightly cue-backup ─▶ /srv/backups/nightly (+ R2 cue-backups) ◀─────────────┘
Media: R2 bucket cue-media, served at media.trycue.space
```

Before stage 2, the app uses Supabase's database and sign-in instead of the local ones,
and Supabase pg_cron runs the scheduled jobs.

- **Caddy** (`/etc/caddy/Caddyfile`, source in [ops/oracle-vm/Caddyfile](../ops/oracle-vm/Caddyfile)).
  - It terminates HTTPS and redirects `www` to the apex.
  - It compresses responses (zstd/gzip) and caps request bodies at 100 MB.
  - It sends `/auth/v1/*` to the sign-in server. The sign-in admin API answers 404 from outside.
  - The certificate comes from Let's Encrypt by **DNS-01 through Cloudflare**, using the token in
    `/etc/caddy/cloudflare.env`. That token can only edit DNS on `trycue.space`, and only from this
    VM's IP. Renewal is automatic.
- **The app** runs as user `cue` (no login, no sudo) under pm2 (`PM2_HOME=/srv/cue/.pm2`).
  The `pm2-cue` systemd unit starts it at boot.
- **Sign-in**: Supabase Auth v2.199.0 runs as the `cue-auth` systemd service, as user `cueauth`.
  - It's the same server Supabase runs. It keeps its users in the `auth` schema of the `cue` database.
  - It sends the sign-in code email through Resend's SMTP; the template is
    `/etc/caddy/cue-auth-templates/code.html`.
  - It signs sessions with an ES256 key, and the app verifies them locally via
    `/auth/v1/.well-known/jwks.json`.
  - Its keys are in `/etc/cue-auth/keys.json`, which also holds the anon key the app uses.
- **PostgreSQL 17** (PGDG packages) listens on localhost only.
  - The app connects as `cue_app`, the owner of the `public` schema.
  - Sign-in connects as `supabase_auth_admin`, the owner of `auth`.
  - Passwords are in `/etc/cue-db/*.pw` (root only).
- **Scheduled jobs**: five systemd timers call the app through Caddy on 127.0.0.1, on the same
  schedule as the old pg_cron jobs. The timers are `cue-cron-publish` (every 5 min),
  `-mailer` (every min), `-automations` (:01 every 5 min), `-reply-desk` (:03 every 5 min) and
  `-media-retention` (hourly at :17).
  The ~5-day token refresh (`/api/cron/keepalive`) still runs from GitHub Actions.
- **Backups**: `cue-backup` runs nightly at 20:30 UTC (02:00 IST).
  - It covers the database (app data plus sign-in users), the roles, and the server's config and secrets.
  - Everything is encrypted with `age` to the backup key on Karan's PC.
  - Copies are kept for 14 days in `/srv/backups/nightly`, and also go to the R2 bucket
    `cue-backups` once `/etc/cue-backup/r2.env` exists.
- **Idle guard**: the `cue-mem-floor` service holds spare RAM so about 30% of memory is in use.
  - Oracle may reclaim an Always Free VM when CPU (95th percentile), network and memory are all
    under 20% for 7 days. Cue alone uses about 8% of the RAM, so all three were under.
  - It gives memory back within 30 s when the app, Postgres or a deploy build need it, and the
    kernel kills it first under memory pressure. It never goes to swap.
  - Check it with `journalctl -u cue-mem-floor -n 5`. Undo it with
    `sudo systemctl disable --now cue-mem-floor`.
  - An OCI Monitoring alarm emails Karan if Oracle's `MemoryUtilization` for the VM stays under 22%
    for an hour.
- **Firewall**: Oracle's security list and the VM's `iptables` both allow only
  22, 80 and 443. Postgres, sign-in, the app ports and pm2 are never public.
- **Hardening**: SSH keys only, no root login, fail2ban on SSH, journald capped at 1 GB.
  Security updates install automatically. When one needs a reboot, it happens at 21:30 UTC (03:00 IST).

Setup scripts, in order: [01-base.sh](../ops/oracle-vm/01-base.sh),
[02-runtime.sh](../ops/oracle-vm/02-runtime.sh), [03-caddy.sh](../ops/oracle-vm/03-caddy.sh),
[04-postgres.sh](../ops/oracle-vm/04-postgres.sh), [05-auth.sh](../ops/oracle-vm/05-auth.sh),
[06-cron.sh](../ops/oracle-vm/06-cron.sh), [07-backup.sh](../ops/oracle-vm/07-backup.sh) and
[08-mem-floor.sh](../ops/oracle-vm/08-mem-floor.sh).
Each one is safe to re-run, and keeps existing keys and passwords.

## Files

| Path | What |
|---|---|
| `/srv/cue/shared/.env` | The live environment (owner `cue`, mode 600). **Never in git.** |
| `/srv/cue/shared/.env.stage2` | Stage 2 environment: local database URLs, `NEXT_PUBLIC_SUPABASE_URL=https://trycue.space`, the local anon key. The cutover copies it over `.env`. |
| `/srv/cue/shared/.env.stage1` | Created by the cutover: the stage 1 environment, kept for rollback. |
| `/srv/cue/shared/STAGE` | `2` once stage 2 is live (missing = stage 1). |
| `/srv/cue/releases/<utc>-<sha7>/` | One folder per deploy, last 3 kept. `PUBLIC_ENV` records which environment it was built for. |
| `/srv/cue/current` | Symlink to the live release |
| `/srv/cue/repo.git` | Bare clone the deploys build from |
| `/etc/caddy/cue-upstream.caddy` | Which port gets traffic, or the maintenance page. Rewritten by deploys and the cutover. |
| `/etc/cue-auth/` | Sign-in config (`auth.env`), keys (`keys.json`, `keys.env`), the SMTP password (`smtp.env`) |
| `/etc/cue-db/` | Database passwords, and the Supabase source URL `cue-db-sync` reads from |
| `/etc/cue-backup/` | `recipient.txt` (public backup key); `r2.env` (off-site bucket key, once set up) |
| `/srv/backups/nightly/` | Encrypted nightly backups; `LAST_OK` holds the time of the last good one |
| `/srv/backups/supabase/` | The dumps taken from Supabase during rehearsals and the cutover |
| `/usr/local/bin/cue-deploy` | Deploy script ([source](../ops/oracle-vm/cue-deploy)) |
| `/usr/local/sbin/cue-cutover` | Switch-over script ([source](../ops/oracle-vm/cue-cutover)) |
| `/usr/local/sbin/cue-db-sync` | Copy Supabase into the local database ([source](../ops/oracle-vm/cue-db-sync)) |
| `/usr/local/sbin/cue-backup` | One backup now (written by [07-backup.sh](../ops/oracle-vm/07-backup.sh)) |
| `/usr/local/sbin/cue-mem-floor` | The idle guard (written by [08-mem-floor.sh](../ops/oracle-vm/08-mem-floor.sh)) |
| `/var/log/caddy/trycue.log` | Access log (rolled at 50 MB, 5 kept) |

## Deploying

Merging to `main` deploys automatically: the
[deploy-vm workflow](../.github/workflows/deploy-vm.yml) SSHes in as `deploy`
and runs `cue-deploy deploy <sha>`. The `deploy` user's key is locked to that
script (forced command): it can only `deploy <sha>`, `rollback` or `status`.

What `cue-deploy deploy` does:

1. Fetches `main` and checks the commit is on it.
2. Unpacks it into a new release folder, and links the shared `.env` and build cache.
3. Runs `pnpm install --frozen-lockfile`, then `pnpm build`.
4. Starts it on the spare port (3000/3001), and waits for `/api/health` to return 200
   (the app is up and the database answers).
5. Points Caddy at the new port (a graceful reload, so no requests drop). Then it
   stops the old process with a 30 s grace period, so `after()` work finishes.
6. Deletes releases beyond the last 3.

If any step fails, the live release keeps serving and the workflow turns red.

**Database changes still go first.** Before merging code that needs them, apply the schema SQL to the
production database:
- Before stage 2, that's Supabase, as before.
- After stage 2, it's the VM. Copy the file to the VM, then run it there:
  `sudo -u postgres psql -d cue -v ON_ERROR_STOP=1 -c 'set role cue_app' -f file.sql`
- For `prisma db push`, open a tunnel first, then point `DATABASE_URL` at `127.0.0.1:15432` with
  `cue_app`'s password:
  `ssh -L 15432:127.0.0.1:5432 -i ~/.ssh/ssh-key-2026-11-18.key ubuntu@130.210.64.74`

**Rollback**: Actions → deploy-vm → Run workflow → `rollback`, or `sudo cue-deploy rollback`
on the VM. It restarts the newest previous release (already built) and switches to it in seconds.
It only picks a release built for the current environment. After the stage 2 switch, older
releases still point at Supabase, so for those it says to deploy an older commit instead.

**Status**: `sudo cue-deploy status` (live release, commit, pm2 list).

## Everyday commands (as `ubuntu`)

```bash
sudo cue-deploy status
sudo cue-cutover check                                       # read-only health/readiness summary
sudo -u cue PM2_HOME=/srv/cue/.pm2 pm2 logs --lines 100      # app logs
sudo -u cue PM2_HOME=/srv/cue/.pm2 pm2 monit                 # live CPU/memory
sudo journalctl -u cue-auth -n 50                            # sign-in server
sudo journalctl -u 'cue-cron-*' --since -1h                  # scheduled jobs (after stage 2)
systemctl list-timers 'cue-*'                                # when jobs and the backup run next
sudo journalctl -u caddy -f                                  # Caddy
sudo tail -f /var/log/caddy/trycue.log                       # requests
sudo -u postgres psql -d cue                                 # database shell (superuser: careful)
sudo fail2ban-client status sshd
```

**Changing an environment variable**: `sudo cue-cutover secret NAME`. Type the value; it isn't
shown or saved in the shell history. It's written to every env file, so the value survives a
cutover or rollback. For `RESEND_API_KEY`, it also becomes the sign-in email password, and the
sign-in server restarts. Then **redeploy** (Run workflow → deploy): `NEXT_PUBLIC_*` values are
built into the app, and a restart alone would keep the old ones.

**Signing in without email** (to check sign-in works): `sudo node /usr/local/share/cue/auth-check.mjs you@example.com`
([source](../ops/oracle-vm/auth-check.mjs)).
It makes a one-time code through the admin API, signs in, opens three pages, then signs out.
It needs stage 2.

## Monthly maintenance (about 15 minutes)

- `sudo apt update && sudo apt upgrade`. Security updates already install themselves daily.
  PostgreSQL minor updates come the same way.
- `sudo caddy upgrade` (keeps the Cloudflare plugin; the apt package is held so apt never replaces it), then `sudo systemctl restart caddy`.
- `sudo npm install -g pm2@latest && sudo -u cue PM2_HOME=/srv/cue/.pm2 pm2 update`.
- Sign-in server: check [supabase/auth releases](https://github.com/supabase/auth/releases).
  To update, change `VER` and `SHA` (the arm64 `.tar.gz` SHA-256 from the release notes) in
  `05-auth.sh` and re-run it. It applies its own migrations on start.
- Check `cat /srv/backups/nightly/LAST_OK`, the disk (`df -h`), memory, and the Oracle Metrics page.
- Every few months, run a **restore drill** on your PC or a spare database (see below).

## Backups and restoring

On Karan's PC (Git Bash, with `age` and `zstd` installed), or on any machine that holds the backup key:

```bash
age -d -i ~/.ssh/cue-backup-age.key cue-YYYYMMDD-HHMMSS.tar.zst.age | zstd -d | tar -x
# gives cue.dump (database), globals.sql (roles), config.tar (env files, keys, Caddy)
```

To restore onto a rebuilt VM:
1. Run setup scripts 01–07.
2. `sudo -u postgres psql -f globals.sql` (roles; errors for roles that already exist are fine).
3. Recreate the database: `sudo -u postgres dropdb cue`, then `sudo -u postgres createdb -O cue_app cue`.
4. `sudo -u postgres pg_restore -d cue cue.dump`.
5. Put the files from `config.tar` back in place, so the same keys and passwords are used.
6. Restart `cue-auth` and redeploy.

A drill on 26 Nov 2026 restored a backup into a scratch database in 1 s with identical row counts.

**Off-site copy** (needed before stage 2):
1. In Cloudflare → R2, create a bucket `cue-backups`, private, with no public access and no custom domain.
2. Create an R2 API token: **Object Read & Write**, scoped to `cue-backups` only.
3. On the VM, create `/etc/cue-backup/r2.env` (root, mode 600):
   ```
   R2_ACCOUNT_ID=<the Cloudflare account id>
   R2_BACKUP_KEY_ID=<token access key id>
   R2_BACKUP_SECRET=<token secret>
   ```
4. Then run `sudo cue-backup`; it should print `off-site: r2:cue-backups/...`.
5. Optionally, add a lifecycle rule on the bucket to delete objects after 30 days.

## Switching over

### Before either stage

- **Missing values.** Vercel stores these as "sensitive", so they can't be read back; get them
  from each service. Set each one with `sudo cue-cutover secret NAME`.
  - `RESEND_API_KEY`: a new key from Resend. It's needed for sign-in codes, invites, alerts and the admin mailer.
  - `LINKEDIN_PAGES_CLIENT_ID` and `LINKEDIN_PAGES_CLIENT_SECRET`: LinkedIn developer portal → the Pages app → Auth.
  - Optional: `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, only needed to re-verify the webhook in Meta.
  - Optional: `PLATFORM_ADMIN_EMAILS`. If it's unset, only the default admin can open `/admin`.
- Merge the PR that adds `/api/health` and the deploy workflow, so deploys run on every merge.
- Set up the off-site backup (see [Backups and restoring](#backups-and-restoring)).
- `sudo cue-cutover check` must end with `== ready`.

### Stage 1 only (app on the VM, data still on Supabase)

`sudo cue-cutover dns vm`. Within a few minutes, all traffic, cron calls and webhooks reach the VM.
To go back: `sudo cue-cutover dns vercel`. Both hosts use the same database, so nothing is lost
either way.

### Stage 2 (everything on the VM): `sudo cue-cutover stage2`

Downtime is about 10 minutes; the site shows "Cue is moving to its new server". Pick a time with
no posts scheduled in the next 15 minutes. The script stops at the first error.

1. Maintenance page on (sign-in stays up).
2. DNS to the VM, if it isn't there already.
3. The Supabase pg_cron `cue-*` jobs are paused (`active = false`; nothing is deleted).
4. Waits 5 minutes, so DNS caches expire and in-flight jobs finish. Writes that still arrive through
   Vercel in this window are included in the next step.
5. `cue-db-sync final`: a fresh copy of the database and the sign-in users from Supabase. Every
   table's row count is compared, and the script stops if any differ.
6. Backup.
7. The environment is swapped to `.env.stage2`, and `main` is rebuilt. If the build fails, it
   switches back to Supabase on its own.
8. The VM's cron timers are switched on.
9. Smoke test: the sign-in server, home, login, health, and one publish run.

Then:
- Sign in at https://trycue.space/login and **check that the email code arrives**.
- Open the calendar, upload a file, and watch the next `cue-cron-publish` run
  (`journalctl -u cue-cron-publish -f`).
- Merge the privacy page PR. Supabase and Vercel come off its processor list.
- Everyone signs in once more. Sessions aren't copied, because the new server signs them with
  new keys. Accounts, workspaces and connected social accounts are unchanged.

**Rollback**: `sudo cue-cutover rollback`. It turns the maintenance page and the VM timers off,
backs up the VM database, rebuilds on the stage 1 env, and turns Supabase pg_cron back on.
DNS stays on the VM (stage 1). **Anything written on the VM after the switch isn't copied back to
Supabase.** It's in the backup the rollback takes, so roll back soon or not at all.

**After stage 2**:
- Leave Supabase as it is for a couple of weeks, as a fallback. On the free plan it pauses itself
  after 7 days without traffic. A rollback after that needs it resumed first, in the Supabase dashboard.
- Vercel still builds every merge, and its `*.vercel.app` URLs still write to Supabase. Once
  stage 2 has settled, disconnect the Git repository in Vercel (Project → Settings → Git), or
  delete the project.
- The keepalive workflow's "keep Supabase warm" step no longer matters; its token refresh still does.

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

Limits behind the proxy: 100 s per request and 100 MB request bodies. The scheduled jobs call
the app on 127.0.0.1, so the proxy never sees them.
