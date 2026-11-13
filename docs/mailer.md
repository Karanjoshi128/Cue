# Mailer

`/admin/mailer` sends marketing and announcement email to contacts that a
platform admin adds or imports. It's separate from Cue's own email (sign-in
codes, invites). Only platform admins can open it, and every action is in the
admin audit log.

| Tab | What it does |
| --- | --- |
| Campaigns | Write an email, choose who gets it, then send a test, save a draft, schedule it or send now. Each campaign has a report: counts and a per-person log. |
| Templates | Saved emails. A campaign copies a template, so later edits to the template never change a sent campaign. |
| Contacts | Add people by hand, paste a list, or import a CSV. Tags make groups. Extra CSV columns become merge fields. |
| Sending | Resend accounts, the per-minute and per-day limits, the footer, and the **Pause all email** switch. |
| Do-not-email | Everyone who unsubscribed, bounced or complained, plus addresses added by hand. They're never emailed again. |

## Deploy order (important)

The Mailer adds **new tables only** (`Mailer*`); nothing existing changes.
Push them to production **before** merging, or `/admin/mailer` and the worker
fail. The rest of the app doesn't read these tables, so it keeps working either way.

```bash
pnpm prisma db push
```

## One-time setup

1. **A separate Resend account for marketing.** Don't use the account that sends sign-in codes. If people mark marketing email as spam and Resend pauses that account, sign-in keeps working.
2. **Verify the domain** in that Resend account (Domains → Add domain → `trycue.space`), and add its SPF, DKIM and DMARC records in Cloudflare.
3. **API key** (Resend → API Keys, Sending access). In `/admin/mailer/sending`, click **Add sending account**, then **Send test**.
4. **Delivery tracking** (recommended):
   - In Resend → Webhooks, add the account's webhook URL (shown on its row): `https://trycue.space/api/mailer/webhook/<accountId>`.
   - Choose the events `email.delivered`, `email.bounced`, `email.complained`, `email.opened` and `email.clicked`.
   - Paste the signing secret (`whsec_...`) into the account.
5. **The worker.** Run this once in the Supabase SQL editor. It reuses the vault secret the publisher already uses:

   ```sql
   select cron.schedule(
     'cue-mailer',
     '* * * * *',
     $$
     select net.http_post(
       url := 'https://trycue.space/api/cron/mailer',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (
           select decrypted_secret from vault.decrypted_secrets
           where name = 'cue_cron_secret')
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 120000
     );
     $$
   );
   ```

   The Sending tab shows when it last ran. To stop it: `select cron.unschedule('cue-mailer');`

6. **Replies:** the sender address (or the reply-to) must be a real mailbox in Zoho.

## How sending works

- **Send now** or a schedule turns the audience into one row per person in `MailerSend`. Addresses on the do-not-email list get a **Skipped** row.
- **Each worker run** (every minute):
  - Starts any scheduled campaigns that are due.
  - Puts rows stuck for 10 minutes back in the queue.
  - Sends for about 45 seconds:
    - Batches of up to 100, each with an idempotency key.
    - Rows are claimed with `FOR UPDATE SKIP LOCKED`, so overlapping runs never double-send.
    - Each account's per-minute and per-day limits are respected.
  - Closes campaigns that have nothing left waiting.
- **Failures:**
  - Temporary errors (429, 5xx, network) are retried after 2 and then 15 minutes, up to 3 tries in all.
  - Other errors fail straight away.
  - If one bad address makes Resend reject a whole batch, that batch is sent one email at a time, so only the bad one fails.
- **Every email has:**
  - Merge fields filled in. Contact values are HTML-escaped.
  - The footer: name, reply address, optional postal address, and the unsubscribe link.
  - A plain-text version.
  - One-click unsubscribe headers (`List-Unsubscribe` + `List-Unsubscribe-Post`), as Gmail and Yahoo require for bulk senders.
- **Unsubscribe:**
  - The link opens `/unsubscribe/<token>`, which asks first. Link scanners must never unsubscribe anyone. It offers an undo.
  - Mail apps' own unsubscribe buttons POST to `/api/mailer/unsubscribe/<token>`.
  - Tokens are an HMAC of the address, so they can't be guessed or edited to unsubscribe someone else.
- **Bounces and complaints** from the webhook put the address on the do-not-email list straight away.

## Limits and costs

- **Resend free plan:** 100 emails a day, 3,000 a month. Pro: about $20 a month for 50,000. Set each account's **Per day** to match its plan.
- **Opens are approximate:** Apple Mail preloads images, so it counts as opened.
- **CSV import:** up to 10,000 rows per file, sent to the server in chunks of 1,000. Excel and Google Sheets files must be saved as CSV first.
- **Images** go to Cue's R2 bucket under `mailer/` and are served from its public URL. Keep them under 5 MB; smaller is better.

## Testing locally

Point everything at the throwaway database and a fake Resend, so nothing real is sent:

```bash
node scripts/fake-resend.mjs 3399
MAILER_RESEND_BASE_URL=http://127.0.0.1:3399 pnpm tsx --env-file=.env scripts/e2e-mailer.ts
```

The fake rejects addresses starting with `bad422` and returns 503 for addresses starting with `flaky`, to exercise those paths.

Running the dev server with the same `MAILER_RESEND_BASE_URL` sends everything to the fake. To run the worker by hand, POST to `/api/cron/mailer` with `Authorization: Bearer <CRON_SECRET>`.

## Not included

- **Sending from other providers (SMTP).** Resend only, by decision.
- **Sending to Cue's own users** as built-in audiences: only imported or added contacts.
- **A/B tests, automations and drip sequences.**
