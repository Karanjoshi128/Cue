# Instagram comment automations (playbook)

"Comment LINK and we'll DM it to you." When someone comments a keyword on a
client's Instagram post, Cue replies under the comment and sends them a DM. A
rule can do both, or only one: a public reply, or a DM.

The feature is built and tested, but **switched off in production**. It needs two
new Instagram permissions, and those need App Review (round 3, after the
publishing round is approved). Until then it runs only where
`NEXT_PUBLIC_IG_AUTOMATIONS=1`, with Instagram Tester accounts.

---

## 0. Status

| Date | State |
| ---- | ----- |
| 14 Oct 2026 | Built on branch `feature/instagram-automations`. Tested end to end against a local database with Instagram's API stubbed (60 checks), and through a local server (webhook, cron, page). Not merged. |
| Next | Merge, then run `pnpm prisma db push` **before** the code deploys (§4). Flag stays off. |
| After Meta round 2 is approved | Test with tester accounts (§6), record the round 3 video (§7), request the two permissions. |
| After round 3 is approved | Turn the flag on in Vercel, redeploy, add the webhook in the App Dashboard (§5). |

---

## 1. What Instagram allows (and what Cue does with it)

| Rule | Source |
| ---- | ------ |
| One private reply (DM) per comment, within **7 days** of the comment | Meta: Private Replies |
| Follow-up DMs only after the person replies, within 24 hours | Meta: Private Replies |
| 750 private replies per hour per account | Meta rate limits (vendors often quote 200; not in Meta's docs) |
| Comment webhooks need the app **Live**, **Advanced Access** and **Business Verification** | Meta: Webhooks |
| The account must be public for comment webhooks | Meta: Webhooks |
| With Standard Access (Development mode), DMs only reach **Instagram Testers** | Reported by developers (error 100/2534001), not in Meta's docs |

Cue sends **one DM per comment**, never follow-ups or broadcasts, and doesn't read
the inbox.

---

## 2. How it works

```
comment ──► webhook (/api/webhooks/instagram)  ─┐
        └─► every-minute check (/api/cron/automations) ─┤
                                                ▼
                      ingestComments: skip replies, own comments,
                      comments over 7 days old, and ones already seen
                                                ▼
                      first matching rule (one-post rules before
                      any-post rules) ──► AutomationRun (one per comment)
                                                ▼
                      processRun: DM first, then the public reply
                      (no "check your DMs" reply if the DM failed)
```

- **Two ways in.** Webhooks are instant but only arrive after round 3. The
  every-minute check reads comments itself: on the post a rule watches, or the
  10 newest posts for "any post" rules. It keeps running after approval as a
  safety net for missed webhooks. Duplicates are harmless because
  `AutomationRun.commentId` is unique.
- **Retries.** Throttling and outages (Meta codes 1, 2, 4, 17, 32, 341, 613, 429,
  5xx) keep the run QUEUED and retry after 2, 5, 15 and 60 minutes, up to 5
  attempts, and never past the 7-day window. Anything else is final, and the
  activity log shows Instagram's reason in plain words.
- **Link button.** The DM goes out as a button template. Meta doesn't say whether
  templates are allowed on a private reply, so if one is refused, Cue resends it
  as text with the link on its own line.
- **Once per person** (on by default). A second matching comment from the same
  person is logged as "Already sent".
- **Switching a rule back on** starts from that moment (`activeSince`), so it
  doesn't DM everyone who commented while it was off.
- **Scheduled Cue posts.** A rule can watch a post that hasn't published yet. It
  picks up the Instagram media id once the post's Instagram target is PUBLISHED.
- **Publishing paused** (admin panel) holds DMs too. They go out when it resumes.
- **Retention.** The activity log (commenter username and id, comment text) is
  deleted after 30 days by the cron. Each rule keeps lifetime totals.
  Disconnecting the account or deleting the rule or client removes it straight away.

---

## 3. Switching it on

| Env var | Value |
| ------- | ----- |
| `NEXT_PUBLIC_IG_AUTOMATIONS` | `1` turns on the Automations page and nav item, adds the two permissions to the Instagram connect dialog, and lets the cron and webhook act. It's inlined at build time, so **redeploy** after changing it. |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | Any random string. Paste the same value into the App Dashboard (§5). |
| `META_WEBHOOK_SECRET` | Optional. Webhooks are signed with an app secret. Cue accepts `META_APP_SECRET` and this one, so if signatures fail, put the other secret here (Instagram app secret vs Meta app secret). |

With the flag **off**, production behaves exactly as before. The connect dialog
asks for only `instagram_business_basic` and `instagram_business_content_publish`
(matching the round 2 screencast). `/automations` is a 404. The privacy and
data-deletion pages don't mention automations, and the cron does nothing.

Platform admins can also switch the feature off for one workspace:
Admin → Workspaces → Features → "Instagram automations".

---

## 4. Deploying the schema (do this before the code)

New: tables `AutomationRule` and `AutomationRun`, enums `AutomationScope`,
`KeywordMatch`, `AutomationSource` and `AutomationRunStatus`, and two nullable
columns on `SocialAccount` (`webhooksSubscribedAt`, `commentsCheckedAt`). All
additive.

1. Merge the branch, but don't let it deploy yet. The Prisma client in the new
   code selects the new `SocialAccount` columns, so the code must not reach
   production before the columns do.
2. `pnpm prisma db push` against production.
3. Check: `select to_regclass('public."AutomationRule"'), to_regclass('public."AutomationRun"');`
4. Deploy.

---

## 5. Meta App Dashboard

1. **Permissions.** Instagram use case → API setup with Instagram login → add
   `instagram_business_manage_comments` and `instagram_business_manage_messages`.
   Adding them gives Standard Access straight away (testers only). Don't attach
   them to the round 2 submission.
2. **Webhooks** (Instagram use case → API setup → Configure webhooks):
   - Callback URL: `https://trycue.space/api/webhooks/instagram`
   - Verify token: the `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` value
   - Subscribe to the **comments** field.
   - The **Test** button sends a sample comment, which checks the signature and
     route. Sample ids won't match a real account, so nothing is sent.
3. **Per account.** When an account connects with the new permissions, Cue calls
   `POST /me/subscribed_apps?subscribed_fields=comments` and records
   `webhooksSubscribedAt`. Accounts connected before the flag went on show
   "needs comment access" on the Automations page, with a Reconnect button.
4. **Business Verification** must be complete, or Meta sends no webhooks even
   after approval. Check it for the Karan Joshi (Udyam) business.

### pg_cron job (every minute)

Copy the header style of the existing `cue-publish-due-posts` job
(`select jobname, schedule, command from cron.job;`). Roughly:

```sql
select cron.schedule(
  'cue-instagram-automations',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://trycue.space/api/cron/automations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cue_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

Each run records a heartbeat named `automations` (Admin → Platform, shown while
the flag is on).

---

## 6. Testing in Development mode

1. Locally, set `NEXT_PUBLIC_IG_AUTOMATIONS=1` and restart the dev server.
2. Two Instagram accounts, both **Instagram Testers** on the app (App roles →
   Roles → Instagram Testers; each accepts in Instagram → Settings → Website
   permissions → Apps and websites → Tester invites):
   - **A**, the professional account the automation runs on (the review test account works).
   - **B**, any account, to comment from.
3. Connect A from Automations → Reconnect (the dialog now lists four permissions).
4. Create an automation on one of A's posts, keyword `LINK`, with a reply and a DM.
5. From B, comment `LINK please` on that post.
6. In Cue, click the refresh icon on the account ("Check comments now") or wait a
   minute for the cron. The activity log should show **Sent**, with the reply under
   the comment and the DM in B's inbox (it may land in message requests).
7. Expected while in Development mode: a comment from a non-tester gets the
   public reply step skipped and the DM fails with "DMs only reach Instagram
   Testers". If public replies to non-testers turn out to work, a reply-only rule
   can be used with real followers before approval.

Open question to settle in this test: Meta's private-replies page lists only
`instagram_business_manage_comments`, while developers report `_manage_messages`
is needed too. Cue requests both. The DM in the video demonstrates both.

---

## 7. App Review round 3 (draft)

Request **Advanced Access** for `instagram_business_manage_comments` and
`instagram_business_manage_messages`. Same lessons as round 1: show the login,
the consent screen, the end-to-end result, with captions naming each permission.

**instagram_business_manage_comments**

> Cue is a social media management tool for agencies. An agency user sets up a
> comment automation for a client's Instagram professional account: they pick a
> post (or all posts) and the keywords to watch for. Cue uses
> instagram_business_manage_comments to receive and read new comments on that
> account's posts, to post a public reply under a comment that matches, and to
> send the commenter a single private reply about their comment. The user can
> pause or delete each automation, and every comment Cue acted on is listed in
> the app.

**instagram_business_manage_messages**

> Cue uses instagram_business_manage_messages to send the private reply: one
> direct message, written by the account owner, to a person who commented a
> chosen keyword on one of the account's posts, within 7 days of the comment.
> Cue sends at most one message per comment. It does not send follow-ups or
> broadcasts, and does not read the account's inbox.

**Screencast shot list**

1. Cue signed in. Open **Automations** and click **Reconnect** on the account.
2. Instagram login (force_reauth). The **permission dialog lists all four**. Hold 4-5 s, then Allow.
3. Back on Automations, the account is ready. Caption: instagram_business_basic.
4. **New automation**: pick the account, "One post", "Choose from recent posts",
   keyword `LINK`, a public reply, a DM with a link button. Show the live preview,
   then Create.
5. Second (tester) account on a phone or another browser: comment `LINK please`
   on that post.
6. Cue: click **Check comments now**. The activity log shows **Sent** (DM and Reply).
7. Instagram: the public reply under the comment. Caption: instagram_business_manage_comments.
8. The commenter's inbox: the DM with the button. Caption: private reply, instagram_business_manage_messages.
9. Pause the automation and delete it.

---

## 8. Known limits

- Without webhooks, "any post" rules watch the 10 newest posts, and each check
  reads up to 150 comments per post. After round 3, webhooks cover every post.
- A webhook carries no comment time, so the notification's time is used.
- No inbox, follow-up flows or "follow to unlock". Those need the messages
  webhook, which Cue doesn't subscribe to yet.
- Instagram's CDN links for post thumbnails expire, so an old rule card can show a
  placeholder image.

---

## 9. Files

| What | Where |
| ---- | ----- |
| Flag, scopes, limits | `src/lib/automations/config.ts` |
| Keyword matching | `src/lib/automations/match.ts` |
| Instagram API calls + error wording | `src/lib/automations/instagram-api.ts` |
| Engine (ingest, send, retry, poll, cron) | `src/lib/automations/engine.ts` |
| Webhook signature + parsing | `src/lib/automations/webhook.ts` |
| Page data | `src/lib/automations/data.ts` |
| Server actions | `src/lib/automation-actions.ts` |
| Routes | `src/app/api/webhooks/instagram`, `src/app/api/cron/automations`, `src/app/(app)/automations` |
| UI | `src/components/automations/` |
| Connect flow (scopes, subscribe, return page) | `src/app/api/oauth/instagram/{start,callback}` |
