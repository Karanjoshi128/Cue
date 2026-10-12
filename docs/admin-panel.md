# Platform admin panel

`/admin` is for whoever runs Cue. It covers every workspace at once. It is
separate from a workspace's own "Admin" role, which only manages that one
workspace.

## Who can open it

- The emails in `PLATFORM_ADMIN_EMAILS` (comma-separated). When that variable is
  not set, the default is `joshikaran0008@gmail.com` (`src/lib/platform-admin.ts`).
  Setting it to an empty value switches the panel off for everyone.
- You sign in the normal way (email code). The panel checks the signed-in email
  on every page, every data loader and every action, not just in the layout.
- Everyone else gets the ordinary 404, so the panel doesn't advertise itself.
  It is also `noindex`.
- Platform admins see an **Admin panel** item in the account menu.

## What's in it

| Page | What you can do |
| --- | --- |
| Overview | Totals, new signups (7 days), posts published / failed / scheduled, publisher health, success rate per platform, newest workspaces, recent admin actions. |
| Workspaces | Search by name, member email or ID; filter active / suspended. |
| Workspace detail | Plan and usage against limits; feature switches; members (change role, ban, remove); clients and connected accounts with token health; API keys (revoke); own storage (re-test, disconnect); recent posts; this workspace's audit trail. **View as admin**, **Suspend / Unsuspend**, **Delete**. |
| Users | Everyone, with workspace, role, last active, ban state. Ban, unban, change role, remove. |
| Accounts | Every connected LinkedIn / Instagram / YouTube account. "Needs attention" lists expired, expiring and failing ones. |
| Posts | Failed (retry), stuck mid-publish (release), overdue with the reason each is held, next 24 hours (cancel). |
| API keys | Every key, how often it's used, revoke. |
| Storage | Workspaces using their own bucket: re-test, disconnect. |
| Audit log | Every action taken in the panel: who, what, when, why, details. Never edited; survives deletions. |
| Platform | Pause all publishing; the announcement banner; the publisher heartbeat; who the platform admins are. |

## What the switches actually do

- **Suspend a workspace.** Members land on a "workspace suspended" page with
  your reason. Its API keys get `403`. Its scheduled posts don't publish. On
  unsuspend, posts that came due in the meantime go out on the next run.
- **Ban a user.** They land on an "access paused" page. API keys that act as
  them get `403`. Their posts and data stay.
- **Pause publishing.** The every-5-minutes run skips everything and "Post now"
  is refused. Every member sees a notice. On resume, overdue posts go out on the
  next run.
- **Plans.** Free, Pro, Agency, Unlimited (limits in `src/lib/plans.ts`).
  - Every workspace starts on **Unlimited**, so nothing changes until you
    assign a plan.
  - Limits are checked when a member adds a client, invites someone, creates a
    post or an API key, or uploads to Cue's bucket.
  - Storage counts the real file sizes. Each upload link is locked to the size
    that was checked, and sizes are read back from the bucket when a post is
    saved.
  - A workspace's own bucket isn't counted.
  - Members see their plan and usage in Settings.
- **Feature switches.** These are API access, own storage, and connecting
  LinkedIn, Instagram and YouTube.
  - Everything is on by default.
  - Switching off own storage sends uploads back to Cue's bucket.
  - Switching off a platform stops new connections. Accounts already connected
    keep publishing.
- **View as admin.**
  - It opens the app exactly as that workspace's admin sees it, **read-only**,
    for 30 minutes, with a banner and an **Exit view** button.
  - It's a signed, httpOnly cookie tied to your email.
  - Every Server Action and every write route refuses it, so nothing can be
    changed by accident.
  - Starting and stopping it are logged.
- **Delete a workspace.**
  - You must type its exact name and give a reason.
  - It removes the workspace and its members, clients, accounts, posts, API
    keys, storage settings and history.
  - It also removes the media it kept in Cue's bucket. A workspace's own bucket
    is left alone.
  - A workspace that a platform admin belongs to can't be deleted.
  - The audit log keeps the record.

## Data and deploy

All schema changes are additive:
- new nullable or defaulted columns on `Workspace`, `User`, `ApiKey`,
  `MediaAsset` and `PostTarget`;
- new tables `AdminAuditLog`, `PlatformSettings` and `CronHeartbeat`.

Run the push **before** deploying the code, because the app reads the new
columns on every request:

```bash
pnpm prisma db push
```

The publisher heartbeat fills in after the first run of the new code. Until
then the overview shows "No runs recorded yet".

## Not included

- **Payments.** Plans are assigned by hand here. Charging for them would need a
  billing provider (Stripe or similar) wired to `Workspace.plan`.
- **Emailing workspaces** (for example, "reconnect your account"). The panel
  shows who needs it; tell them directly or use the announcement banner.
- **Storage usage before this release.** File sizes are recorded from this
  release on, so older uploads aren't counted.
- **Uploads never attached to a post.** They're stored but not counted, since
  sizes are recorded when a post is saved.
