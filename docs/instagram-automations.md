# Engage features: launch playbook

Everything on branch `feature/instagram-automations` that isn't live yet:
Instagram automations, the Reply Desk, link-in-bio pages, the Claude and
ChatGPT connector, AI helpers and email alerts. This page covers what each
one needs before it can go live, the order to deploy in, and the App Review
text.

---

## 0. Status

| Date | State |
| ---- | ----- |
| 14 Oct 2026 | Comment automations built on the branch. |
| 28 Oct 2026 | Branch rebased on main and extended with everything in §1. Committed locally only, not pushed. Each feature tested end to end against a local database with the outside services faked (227 checks in `scripts/e2e-*.ts`), and in a browser against a local server. |
| Next | Push and merge when Karan decides. Run `pnpm prisma db push` **before** the code deploys (§4). Flags stay off. |
| After Meta round 2 is approved | Test automations with tester accounts (§8), record the round 3 video, request the two permissions (§9). |
| After round 3 is approved | Turn `NEXT_PUBLIC_IG_AUTOMATIONS` on, add the webhook fields in the App Dashboard (§6), redeploy. |
| After round 3 and Google's approval of `youtube.force-ssl` | Turn `NEXT_PUBLIC_REPLY_DESK` on (§7). |

---

## 1. What's on the branch

| Feature | What it does | Needs from Meta or Google | Switch |
| ------- | ------------ | ------------------------- | ------ |
| **Instagram automations** | A keyword in a comment, a story reply or a DM gets a public reply and a DM, usually with a link. Optional: followers only, ask for an email or phone first (leads, CSV export), a nudge if they go quiet, several DM wordings, hold words and AI moderation, typo tolerance, pacing. | Round 3: `instagram_business_manage_comments`, `instagram_business_manage_messages`, webhooks | `NEXT_PUBLIC_IG_AUTOMATIONS`, workspace feature "Instagram automations" |
| **Reply Desk** (`/replies`) | One inbox of comments across clients' Instagram and YouTube posts, questions first. Reply from Cue as the client. | `instagram_business_manage_comments` (round 3), `youtube.force-ssl` (Google) | `NEXT_PUBLIC_REPLY_DESK`, workspace feature "Reply Desk" |
| **Link in bio** (`/bio`, public `/b/<name>`) | A page per client for their Instagram bio: links and the latest posts, with view and tap counts and its own share image. | Nothing new: reads posts with `instagram_business_basic` | Workspace feature "Link-in-bio pages" |
| **Claude and ChatGPT connector** (`/api/mcp`) | An MCP server: an assistant lists clients and posts, writes drafts, schedules or deletes posts, and (with the Reply Desk on) answers comments, as the member who connected it. OAuth sign-in, or a Cue API key. | Nothing | Workspace feature "API access" |
| **AI helpers** | DM wordings, reply drafts, AI moderation, sorting Reply Desk comments, and "Describe it": an automation from one sentence, typed or spoken. | Nothing | `ANTHROPIC_API_KEY`, workspace feature "AI helpers" |
| **Email alerts** | Admins get an email for failed posts, accounts that need reconnecting, and automation spikes. Each admin can turn them off in Settings → Account. | Nothing | `RESEND_API_KEY` |

Platform admins can switch each feature off for one workspace: Admin → Workspaces → Features.

---

## 2. What Instagram allows (and what Cue does with it)

| Rule | Source |
| ---- | ------ |
| One private reply (DM) per comment, within **7 days** of the comment | Meta: Private Replies |
| Further messages only within **24 hours** of the person's last message or button tap | Meta: Messaging window |
| Comment and message webhooks need the app **Live**, **Advanced Access** and **Business Verification**; the account must be public | Meta: Webhooks |
| With Standard Access (Development mode), DMs only reach **Instagram Testers** | Reported by developers (error 100/2534001), not in Meta's docs |
| Whether someone follows the account: `is_user_follow_business` on their profile, readable once they've messaged or tapped | Meta: User Profile API |

Cue starts a conversation only in reply to the person's own comment, story
reply or message. It sends follow-ups only inside the 24-hour window after
they last wrote or tapped, and never broadcasts. It reads only messages that
arrive by webhook for an account with an automation.

---

## 3. How automations work

```
comment ─► webhook or the every-minute check ─┐
story reply / DM ─► messages webhook ─────────┤
                                              ▼
           first matching rule (keyword, typo-tolerant) ─► AutomationRun
                                              ▼
           hold?  hold words, or AI moderation ─► HELD (shown for review)
                                              ▼
           first message, one of:
             • followers only: "Tap below and I'll send it" + button
             • ask for an email or phone
             • the DM with the link (a wording picked by rotation)
           then the public reply under the comment
                                              ▼
           tap or answer (messages webhook) ─► follow check / save the lead
                                              ▼
           the link ─► a nudge later if they go quiet (inside 24 h)
```

- **Two ways in for comments.** Webhooks are instant but only arrive after round 3. The
  every-minute check reads comments itself (the watched post, or the 10 newest posts) and
  stays on afterwards as a safety net. Story replies, DM keywords, taps and answers only
  arrive by webhook.
- **Pacing.** At most `IG_DM_HOURLY_CAP` (default 200) first DMs per account per hour; the
  rest wait their turn.
- **Retries.** Throttling and outages retry after 2, 5, 15 and 60 minutes, up to 5 attempts,
  never past Instagram's windows. Anything else is final, with Instagram's reason in plain words.
- **Once per person** (on by default): a second match from the same person is logged as "Already sent".
- **Retention.** The activity log is deleted after 30 days. Leads stay until the team deletes them,
  the account is disconnected or the client is deleted.

---

## 4. Deploying (schema first)

The new code reads new tables and columns, so the database must change first.

New tables: `AutomationRule`, `AutomationRun`, `Lead`, `InboxComment`, `BioPage`, `BioClick`,
`AlertLog`, `OAuthClient`, `OAuthCode`, `OAuthGrant`, with their enums. New columns:
`User.emailAlerts` (defaults to true), `SocialAccount.webhooksSubscribedAt`,
`commentsCheckedAt` and `inboxSyncedAt` (nullable). All additive.

1. Merge, but don't let it deploy yet.
2. `pnpm prisma db push` against production.
3. Check: `select to_regclass('public."AutomationRule"'), to_regclass('public."BioPage"'), to_regclass('public."OAuthGrant"');`
4. Deploy.
5. Add the cron jobs (§5).

With every flag off, production behaves as before, plus three things that need no approval
and go live with the merge: **Link in bio**, the **connector** (Settings → Claude and
ChatGPT), and **email alerts** once `RESEND_API_KEY` is set. Turn their workspace features
off first if they shouldn't launch yet.

### Environment variables

| Env var | Value |
| ------- | ----- |
| `NEXT_PUBLIC_IG_AUTOMATIONS` | `1` turns on Automations: the page, the nav item, the two extra permissions in the Instagram connect dialog, the cron and the webhook. Inlined at build time, so **redeploy** after changing it. |
| `NEXT_PUBLIC_REPLY_DESK` | `1` turns on the Reply Desk page, nav item and cron. Also inlined at build time. |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | Any random string. The same value goes in the App Dashboard (§6). |
| `META_WEBHOOK_SECRET` | Optional, if webhook signatures fail with `META_APP_SECRET` (Instagram app secret vs Meta app secret). |
| `IG_DM_HOURLY_CAP` | Optional. First DMs per account per hour. Default 200. |
| `REPLY_DESK_YT_MINUTES` | Optional. How often YouTube comments are read, to spare quota. Default 30. |
| `ANTHROPIC_API_KEY` | Turns on the AI helpers. Model: Claude Opus 5.5 at low effort, with Anthropic's server-side refusal fallback. |
| `RESEND_API_KEY` | Turns on email alerts. |
| `ALERTS_FROM` | Optional. Default `Cue <alerts@trycue.space>`; the domain must be verified in Resend. |
| `ALERT_SPIKE_THRESHOLD` | Optional. Automation runs in 15 minutes that count as a spike. Default 50. |

---

## 5. Cron jobs (pg_cron)

Copy the header style of the existing `cue-publish-due-posts` job
(`select jobname, schedule, command from cron.job;`).

```sql
-- Automations: every minute. Does nothing while the flag is off.
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

-- Reply Desk: every 5 minutes. Does nothing while the flag is off.
select cron.schedule(
  'cue-reply-desk',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://trycue.space/api/cron/reply-desk',
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

The existing publish job now also sends failed-post and reconnect alerts and cleans up old
OAuth records; it needs no change. Heartbeats `automations` and `reply-desk` show in
Admin → Platform.

---

## 6. Meta App Dashboard

1. **Permissions.** Instagram use case → API setup with Instagram login → add
   `instagram_business_manage_comments` and `instagram_business_manage_messages`. That gives
   Standard Access (testers only) straight away. Don't attach them to the round 2 submission.
2. **Webhooks** (Instagram use case → API setup → Configure webhooks):
   - Callback URL: `https://trycue.space/api/webhooks/instagram`
   - Verify token: the `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` value
   - Subscribe to **comments**, **messages** and **messaging_postbacks**.
3. **Per account.** An account connected with the new permissions is subscribed to the same
   three fields automatically (`webhooksSubscribedAt`). Accounts connected earlier show
   Reconnect on the Automations page.
4. **Business Verification** for the Karan Joshi (Udyam) business, or Meta sends no webhooks
   even after approval.

---

## 7. Google: `youtube.force-ssl`

The Reply Desk reads and answers YouTube comments with `youtube.force-ssl`, the scope first
comments already ask for when someone opts in (`&comments=1`). It isn't verified, so it
stays opt-in, and the Reply Desk flag stays off. To launch it:

1. Add `youtube.force-ssl` to the consent screen's scopes in the shorts-automation-509405
   project. This starts a new verification (see `docs/google-youtube-verification.md`).
2. Justification: "Cue's Reply Desk lists comments on the channel's videos so the
   channel's team can answer them from Cue, and posts the reply they write as the channel.
   The first-comment feature posts one comment, written by the user, under each video they
   publish through Cue. Cue doesn't edit or delete comments."
3. Demo video: connect a channel with comment access, the comment showing in the Reply Desk,
   a reply typed and posted, the reply under the video on YouTube.

---

## 8. Testing automations in Development mode

1. Locally, set `NEXT_PUBLIC_IG_AUTOMATIONS=1` and restart the dev server.
2. Two Instagram accounts, both **Instagram Testers** on the app: **A**, the professional
   account the automation runs on, and **B**, to comment from.
3. Connect A from Automations → Reconnect (the dialog lists four permissions).
4. Create an automation on one of A's posts: keyword `LINK`, a reply, a DM with a link button.
5. From B, comment `LINK please`. Click "Check comments now" or wait a minute. The activity
   log shows **Sent**; B has the reply and the DM (maybe in message requests).
6. Followers only, story replies, DM keywords, email capture and nudges need the messages
   webhook, so they can only be tested once the app is Live with webhooks (after round 3)
   or with a local tunnel to `/api/webhooks/instagram`.

---

## 9. App Review round 3 (draft)

Request **Advanced Access** for `instagram_business_manage_comments` and
`instagram_business_manage_messages`. As in round 1: show the login, the consent screen and the
end-to-end result, with captions naming each permission.

**instagram_business_manage_comments**

> Cue is a social media management tool for agencies. Cue uses
> instagram_business_manage_comments in two places. In comment automations, an agency user
> chooses a client's post (or all posts) and keywords; Cue reads new comments on the
> account's posts, posts a public reply under a comment that matches, and sends the commenter
> one private reply about their comment. In the Reply Desk, Cue lists recent comments on the
> account's posts so the agency can answer them, and posts the reply the user writes. The
> user can pause or delete each automation, and every comment Cue acted on is listed in the app.

**instagram_business_manage_messages**

> Cue uses instagram_business_manage_messages for conversations that a person starts with the
> account: a private reply to their comment, a reply to someone who answered the account's
> story or messaged it a keyword the account chose, and the next messages in that
> conversation when the person taps the message's button or answers its question (for
> example, to check that they follow the account before sending a link, or to ask for an
> email address they choose to share). Every message is written by the account owner. Cue
> only sends within Instagram's windows (7 days after a comment, 24 hours after the person's
> last message or tap), never broadcasts, and only reads messages that arrive for an
> automation.

**Screencast shot list**

1. Cue signed in. Automations → **Reconnect** on the account.
2. Instagram login (force_reauth). The permission dialog **lists all four**. Hold 4 to 5 s, then Allow.
3. Back on Automations, the account is ready. Caption: instagram_business_basic.
4. **New automation**: the account, one post, keyword `LINK`, a public reply, a DM with a link
   button, **Only followers get it** on. Show the live preview, then Create.
5. Second (tester) account: comment `LINK please` on that post.
6. Cue: **Check comments now**. The activity log shows the run.
7. Instagram: the public reply under the comment. Caption: instagram_business_manage_comments.
8. The commenter's inbox: "Tap below and I'll send it". Tap the button. Caption:
   instagram_business_manage_messages.
9. The link arrives (the commenter follows the account). Caption: follow check, then the link.
10. Reply Desk: the comment is listed; type a reply and post it; show it on Instagram.
    Caption: instagram_business_manage_comments.
11. Pause the automation and delete it.

---

## 10. Known limits

- Without webhooks, "any post" rules watch the 10 newest posts, up to 150 comments each.
- A comment webhook carries no time, so the notification's time is used.
- Instagram's image links expire after a few days: an old rule card can show a placeholder,
  and link pages reread the grid when it's more than a day old.
- Reply Desk: Instagram is read every run, YouTube every 30 minutes; comments older than 30
  days aren't shown.
- The connector can't attach media: Instagram and YouTube posts made by an assistant are
  drafts to finish in Cue.

---

## 11. Files

| What | Where |
| ---- | ----- |
| Automations: flag, scopes, limits, copy | `src/lib/automations/config.ts` |
| Matching, typo tolerance | `src/lib/automations/match.ts` |
| Instagram API calls and error wording | `src/lib/automations/instagram-api.ts` |
| First message, retries, polling | `src/lib/automations/engine.ts` |
| Taps, answers, story and DM triggers, nudges | `src/lib/automations/conversation.ts` |
| Cron, webhook parsing | `src/lib/automations/cron.ts`, `webhook.ts` |
| Automations UI and actions | `src/components/automations/`, `src/lib/automation-actions.ts` |
| Reply Desk | `src/lib/reply-desk/`, `src/components/reply-desk-view.tsx`, `src/app/(app)/replies` |
| Link in bio | `src/lib/bio/`, `src/components/bio/`, `src/app/b/[slug]`, `src/app/(app)/bio` |
| Connector (MCP + OAuth) | `src/lib/connector/`, `src/app/api/mcp`, `src/app/api/oauth`, `src/app/oauth/authorize` |
| AI helpers | `src/lib/ai.ts` |
| Email alerts | `src/lib/alerts.ts` |
| End-to-end checks | `scripts/e2e-*.ts` (local database only; see each file's header) |
