# Move Cue to the new Oracle VM

Prepared 18 November 2026. This is a migration plan. The production checks used to prepare it were read-only.

## What is running today

| Component | Evidence on 18 November | Destination |
| --- | --- | --- |
| Web app, server actions, API, OAuth callbacks and webhooks | The public Cue site responded from Vercel. These components ship together in the Next.js app. | One ARM64 Next.js production service on the new VM, behind HTTPS. |
| Database | Production uses Supabase PostgreSQL 17. The 19 publishing and automation columns have already been added. Measure the live database and backup sizes before provisioning disk. | Self-hosted Supabase PostgreSQL 17 on an attached data volume, after a successful rehearsal. |
| Login | Cue emails a code through Supabase Auth and checks the signed-in user's Cue memberships. | Self-hosted Supabase Auth, its HTTPS gateway and a working SMTP service. |
| Background work | Four enabled Supabase jobs plus a GitHub token refresh. The separate GitHub publish workflow is disabled. | One scheduler per job. The existing schedulers can stay through the web move. |
| Media | Default Cloudflare R2 plus optional workspace-owned R2/S3 buckets. Some media references lack sizes. Inventory the buckets directly to measure storage use. | Keep the working buckets and public URLs. OCI Object Storage is a separate optional migration. |
| Domain and external integrations | The production domain's authoritative DNS currently uses Hostinger. Cue also depends on social APIs, external mail delivery and optional AI services. | Keep the domain, DNS zone, provider apps and existing integrations. Change the web origin. |
| Existing Oracle VM | Its duties could not be established from the Cue checkout or public web response. | Inventory it before deciding which services or files to move. |

## What the free account provides

The current free-only A1 allowance is **2 OCPUs and 12 GB RAM across the tenancy** in its home region. The monthly allowances are 1,500 OCPU-hours and 9,000 GB-hours. One VM at full allocation for a 31-day month consumes 1,488 OCPU-hours and 8,928 GB-hours even if Cue has few visitors. Confirm the shape **VM.Standard.A1.Flex**, home region, existing allocations and eligibility in the new tenancy's console. Free trial credits expire separately. A shape can be eligible while the region lacks available hosts. [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) · [Trial expiry](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm)

| Allowance relevant to Cue | How to use it |
| --- | --- |
| 200 GB combined home-region boot and block volumes | Example allocation is 50 GB boot and 100 GB for database data. Subtract volumes already in the tenancy first. |
| Five volume backups total | Rotate them and keep an independent encrypted database backup outside the tenancy. |
| 20 GB combined Object Storage for a free-only account, 50,000 Object Storage requests monthly | Check actual bucket size, request frequency and backup retention before moving media here. |
| 10 TB monthly outbound transfer | Include downloads and transfers between clouds when estimating use. |

Always Free has no uptime SLA. Oracle permits one free account per person. If the new tenancy belongs to another owner, have the owner grant an individual IAM identity, confirm authorization to host customer data and agree who controls billing, recovery and backups. The console's budget alerts are spending notifications. [Oracle Free Tier FAQ](https://www.oracle.com/cloud/free/faq/) · [OCI budgets](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/budgetsoverview.htm)

## How the idle policy works

Oracle can classify an A1 instance as idle if **all three** measures over seven days fall below 20%: CPU at the 95th percentile, network utilization and memory utilization. If one measure meets or exceeds the threshold under Oracle's measurement, the published three-part idle condition is not met. CPU p95 means brief CPU spikes can coexist with a low weekly p95. Oracle does not specify an equivalent percentile for network or memory on that page. There is no published combined utilization target of 21%. On 12 GB, 20% of allocated RAM is 2.4 GB. A one-time reading cannot establish the weekly classification. The FAQ separately describes accounts left idle for 30 days. [Oracle idle rules](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) · [Account inactivity](https://www.oracle.com/cloud/free/faq/)

In **Compute → Instances → your VM**, enable the **Compute Instance Monitoring** agent plugin. Open **Metrics** or **Monitoring → Metrics Explorer**, select the instance in **oci_computeagent**, and review seven days of CPU, memory and network activity. Network bytes are useful for trends. Oracle does not provide a direct conversion from those charts to its reclamation decision. Enable external uptime and missed-job alerts as well. Run Cue's real workload during the observation period. Use the results to judge whether a reclaimable VM suits the required uptime. An off-tenancy backup and a timed restore remain necessary even when usage is high. [OCI compute metrics](https://docs.oracle.com/en-us/iaas/Content/Compute/References/computemetrics.htm)

## Migration order

### 1. Identify the source and the release

- Inspect both OCI consoles. Record the tenancy owner, home region, selected VM, OS and architecture, attached volumes, subnet, public address or tunnel, backups and available quota. Keep credentials in the secret manager.
- On the existing Oracle VM, inspect running services, timers, user crontabs, containers, reverse proxy, mounts, application directories, persistent container volumes and deployment revision. These read-only commands are starting points. Inspect service-specific configuration privately.

```sh
uname -m
lsblk -f
df -h
systemctl list-units --type=service --state=running
systemctl list-timers --all
ss -lnt
# If Docker is installed
docker ps --format '{{.Names}}  {{.Image}}  {{.Ports}}'
```

- Map each old worker to its inputs, outputs, schedule and owner. Copy and verify Cue-owned persistent files separately from Git and PostgreSQL. Record any external clients calling Cue. Leave other projects on their existing host unless they are explicitly part of the move.
- Merge the publishing and automation PR after review. In Vercel, open the production deployment and verify that its source commit matches the merged revision. Record that commit and the previous known-good deployment for rollback. Build the first Oracle release from the verified production commit. This lets the team compare the same application on both hosts. Review the dependency security notice in the [release handoff](claude-handoff-publishing-automation-2026-11-17.md) before choosing a production build.

### 2. Prepare the new A1 VM

- Select an Always Free eligible ARM64 Ubuntu LTS image in the home region. In OCI, create or verify the VCN, public subnet, internet gateway, route and network security group. Expose HTTPS and the HTTP port needed by your TLS setup. Restrict SSH to your administrator IP or bastion. Enable the OS firewall, install security updates and use SSH keys.
- Attach a separate block volume for the database. Identify it by device identity, initialize only a confirmed empty volume, mount it by UUID, and make database startup depend on that mount. Confirm reboot mounts it correctly. Keep PostgreSQL, the pooler, Next's internal port and admin dashboards on private addresses.
- Configure clock synchronization, log rotation, automatic service restart and backup destinations. Keep SSH, recovery access, encryption keys and an encrypted copy of the deployment configuration recoverable outside the new tenancy.

### 3. Run Cue's frontend and backend on Oracle first

- Build on ARM64 Linux in a separate release directory, or in ARM64 CI. Use the release's locked pnpm dependencies, compatible Node LTS and Prisma generation. Supply the public Auth URL, browser key and public feature flags **before building**. Set the server secrets through the service environment. Use a dedicated build output such as the one below on the parity branch. An older revision without the dist-dir setting needs its own release directory.

```sh
pnpm install --frozen-lockfile
export CUE_NEXT_DIST_DIR=.next-release
pnpm build
# Run under systemd or a restartable container in production
pnpm exec next start --hostname 127.0.0.1 --port 3000
```

- During testing use an isolated staging database/auth project and test credentials. Keep external sends and schedulers disabled on the staging copy. For the **first live switch**, configure a production release on Oracle to use the same existing Supabase and R2 as the old web service. Use the same dist-dir setting for build and start. Run one application process initially.
- Preserve the existing Cue `TOKEN_ENC_KEY`, social provider credentials, cron authentication, webhook verification/signing secrets, R2 settings, email keys and feature gates. Losing the encryption key breaks stored social tokens, workspace storage credentials and previously signed links. Use the existing public Cue URL as the production `APP_URL`. Self-hosted Auth keys are a different set of keys.
- Put Caddy or Nginx in front of the app. Preserve the public host and HTTPS scheme, support streaming, allow appropriate request durations for the five-minute publisher, and keep signed-in responses private. Direct-to-bucket uploads should continue to go to the bucket. Give in-flight publishes and webhook background processing time to finish before restarting the service. [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- Verify the new origin with a temporary protected hostname or a host override using a valid certificate. Then change the apex and any relevant www web record in the **current DNS zone**. Check both A/AAAA records and www's existing alias. Leave mail records, media records and nameservers intact. Verify the public hostname reaches the new origin. Keep the old web release available. While the database is shared, web rollback is an origin switch.

### 4. Rehearse moving PostgreSQL and Auth together

- Install a pinned self-hosted Supabase release that supports PostgreSQL 17. Check the actual ARM64 image manifests for each enabled service before relying on the stack. Verify required extensions, database roles and Auth schema versions. Keep PostgreSQL data on the attached volume. Expose only the required public Auth gateway routes over HTTPS. Restrict Studio and administrative routes.
- Supabase lists 2 CPU cores, 4 GB RAM and 40 GB SSD as its minimum for the complete stack, and recommends 4+ cores, 8+ GB and 80+ GB SSD. Cue will share the same two cores. Omit unused optional services after checking their dependencies. Rehearse sign-ins, concurrent page traffic, a representative large media upload/publish, backup and a scheduler cycle together. Watch response time, queue lateness, peak RAM, swapping and OOM events. If it misses your actual service targets, keep managed Supabase until capacity is available. [Supabase Docker requirements](https://supabase.com/docs/guides/self-hosting/docker)
- Use Supabase's **platform-to-self-host** procedure. Create separate filtered exports of roles, schema and data, then restore in that order into a fresh target with a single transaction and stop-on-error. The guide includes the exact CLI commands, trigger handling and version checks. Set up required extensions before restore. Prevent restored jobs and outbound requests from running against production during rehearsal. The 18 November archive is for rollback to its own snapshot and predates the 19-column migration. Take a fresh export for this move. [Supabase migration commands](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
- Preserve Auth users and identities as well as Cue users, memberships, invitations, social accounts, queued posts, runs, suppressions, grants, roles, RLS and media references. Compare source and target counts plus representative IDs and records. Verify all 19 new columns. Check that representative encrypted values decrypt without logging them. Check restricted roles cannot read private Cue data.
- Set up the new Auth hostname, public gateway URL, Cue site URL, redirect allowlist and real SMTP credentials. Configure the email template to deliver the numeric code Cue expects. Generate the new Supabase signing and API keys. Rebuild Cue with the new public URL and key, and update its server-side Auth key and private Prisma database URLs. Test actual OTP delivery, verification, session refresh, sign-out, invites and workspace isolation. Plan for existing users to sign in again when Auth moves. Preserve the existing public Cue callback paths for connected social accounts. [Supabase restore and Auth considerations](https://supabase.com/docs/guides/self-hosting/restore-from-platform) · [Email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)

### 5. Cut over once with one writer and one scheduler

1. Pick a quiet window between scheduled posts. Record due posts, mail runs, automation backlog, in-flight provider requests and last successful heartbeats. Stage the already-tested final app configuration. Take a new encrypted off-VM backup and ensure you can restore it.
2. Put **all** application entry points into maintenance. Pause web/API writes, Auth changes, external producers, old worker services and cron dispatch. Drain in-flight jobs. Arrange durable buffering for arriving webhooks, or verify provider retry behavior for the chosen maintenance response. Acknowledge events only once retained. The app's publishing pause alone does not freeze Auth, other writers or incoming events.
3. With the source quiet, take the **final** exports and restore into a clean target as rehearsed. Check public and Auth counts, queues, flags, grants and identities again. Fence the old web service during DNS propagation so even cached clients cannot write the old database.
4. Point the Oracle application to the new database and Auth configuration, then open one production writer. Run a controlled login and draft-save test. Enable one copy of each job only after checking which queued items were already accepted by external platforms. Replay buffered events with deduplication.

| Duty | Existing schedule (UTC) | Authenticated HTTP POST |
| --- | --- | --- |
| Publish due posts | Every five minutes | `/api/cron/publish` |
| Instagram automations | Minutes 1, 6, 11, …, 56 | `/api/cron/automations` |
| Reply Desk | Minutes 3, 8, 13, …, 58 | `/api/cron/reply-desk` |
| Mailer | Every minute | `/api/cron/mailer` |
| Refresh expiring social tokens | Existing GitHub schedule `0 6 */5 * *` | `/api/cron/keepalive` |

For a full scheduler move, use systemd timers on the VM and call the local application with the existing cron bearer secret from a protected credential file. Preserve the schedules and give each job its own overlap guard and timeout. Disable the matching old dispatcher before enabling its timer. Keep the old GitHub publish workflow disabled. Verify actual successful work and heartbeats, not just that a timer fired. The keepalive route also refreshes social tokens, so it still matters after Supabase moves.

### 6. Verify, recover and retire

- Check the public domain, TLS, login/session refresh, permissions, existing drafts, file upload/read, queue and first scheduled test post. Use dedicated test accounts for a controlled publish and verify exactly one external result.
- Test Instagram webhook verification and event delivery, incoming mailer webhooks, social OAuth callbacks, tracked links, the external API and connector discovery. Check `/api/webhooks/instagram`, `/api/mailer/webhook/[accountId]`, `/api/oauth/…/callback` and `/.well-known/…` using their normal integration flows. Check large media processing, late queues and successful token refresh.
- Schedule encrypted database and Auth backups outside the new tenancy, monitor backup age and practice a restore on a replacement host. Decide how much data loss and downtime the team can tolerate. For example, nightly dumps alone can lose almost a day of writes. If that is too much, add more frequent backups or PostgreSQL WAL archiving and test point-in-time recovery. Back up media, secrets and service configuration independently.
- Before the new database has accepted writes, return the origin, Auth and jobs to the old stack if needed. **After new writes, keep the new database authoritative** and roll back to a compatible app pointed at it, or freeze writers and reconcile a reverse migration first. Include external provider IDs, messages already delivered and mail already sent. A DNS rollback by itself cannot reconcile those records.
- Keep the old environment recoverable through at least one complete operational cycle, a successful token refresh and a restore drill. Release resources only after verifying no old jobs, producers or callbacks are still using them.

## Optional move for Cue-owned media

Keeping R2 is the smallest change for customers. If consolidating Cue-owned files into OCI Object Storage is a separate requirement, first inventory actual object keys, bytes, versions, domains, lifecycle rules and request volumes. Cue's default storage adapter uses an R2-specific endpoint. Implement and test the OCI S3-compatible endpoint and credentials, signed browser uploads including preflight, public HTTPS reads, byte-range video delivery and reads from social platform servers. Oracle documents fixed CORS behavior. Copy objects while preserving keys, verify size and content checksums, switch new writes, copy the final delta and preserve every existing public URL or keep its old origin available. Customer-owned buckets require their owner's decision. [OCI S3 compatibility](https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/s3compatibleapi.htm) · [OCI Object Storage FAQ](https://www.oracle.com/cloud/storage/object-storage/faq/)
