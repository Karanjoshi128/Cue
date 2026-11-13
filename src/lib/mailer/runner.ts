import type { MailerAccount, MailerCampaign } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { parseAudience, queueCampaignSends, refreshCampaignCounts } from "@/lib/mailer/audience";
import { contactVars, type MergeVars } from "@/lib/mailer/merge";
import { renderEmail } from "@/lib/mailer/render";
import { fromHeader, sendBatch, sendOne, type OutgoingEmail } from "@/lib/mailer/resend";
import { getMailerSettings } from "@/lib/mailer/settings";
import { unsubscribeOneClickUrl, unsubscribePageUrl } from "@/lib/mailer/suppression";

/*
 * The mailer's worker, called every minute by /api/cron/mailer (Supabase
 * pg_cron). Each run:
 *   1. starts scheduled campaigns whose time has come (queues their sends),
 *   2. puts rows stuck in SENDING for 10 minutes back in the queue,
 *   3. sends for up to ~45 s, in batches of up to 100, within each sending
 *      account's per-minute and per-day limits,
 *   4. closes campaigns with nothing left waiting.
 * Rows are claimed with FOR UPDATE SKIP LOCKED, so two overlapping runs
 * never send the same email.
 */

export const MAX_ATTEMPTS = 3;
const BUDGET_MS = 45_000;
const STUCK_MS = 10 * 60_000;
const BATCH = 100;
/** Wait before try 2 and try 3 after a temporary failure. */
const BACKOFF_MS = [2 * 60_000, 15 * 60_000];

export interface MailerRunSummary {
  paused?: boolean;
  started: number;
  sent: number;
  failed: number;
  retrying: number;
  skipped: number;
  finished: number;
}

type ClaimedRow = { id: string; email: string; name: string | null; vars: unknown; attempts: number };

function senderFor(account: MailerAccount) {
  const contactEmail = account.replyTo || account.fromEmail;
  return {
    from: fromHeader(account.fromName, account.fromEmail),
    replyTo: account.replyTo,
    contactEmail,
  };
}

/** The email for one person: rendered, with one-click unsubscribe headers. */
export function buildEmail(
  campaign: Pick<MailerCampaign, "id" | "subject" | "preheader" | "bodyHtml">,
  account: MailerAccount,
  footer: { name: string; address: string | null },
  to: string,
  vars: MergeVars,
): OutgoingEmail {
  const s = senderFor(account);
  const rendered = renderEmail({
    subject: campaign.subject,
    preheader: campaign.preheader,
    bodyHtml: campaign.bodyHtml,
    vars,
    footer: { name: footer.name, address: footer.address, contactEmail: s.contactEmail },
    unsubscribeUrl: unsubscribePageUrl(to),
  });
  return {
    from: s.from,
    to,
    replyTo: s.replyTo,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: {
      "List-Unsubscribe": `<${unsubscribeOneClickUrl(to)}>, <mailto:${s.contactEmail}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: [{ name: "campaign", value: campaign.id.replace(/[^A-Za-z0-9_-]/g, "") }],
  };
}

/** How many more this account may send right now, under its per-minute and per-day limits. */
async function allowance(account: MailerAccount, now: Date): Promise<number> {
  const [lastMinute, lastDay] = await Promise.all([
    prisma.mailerSend.count({
      where: { campaign: { accountId: account.id }, sentAt: { gte: new Date(now.getTime() - 60_000) } },
    }),
    prisma.mailerSend.count({
      where: { campaign: { accountId: account.id }, sentAt: { gte: new Date(now.getTime() - 24 * 3_600_000) } },
    }),
  ]);
  return Math.max(0, Math.min(account.perMinute - lastMinute, account.perDay - lastDay));
}

// Prisma stores DateTime as UTC in "timestamp without time zone" columns, so
// compare against UTC explicitly: a bare now() would be read in the database
// session's time zone.
async function claim(campaignId: string, limit: number): Promise<ClaimedRow[]> {
  return prisma.$queryRaw<ClaimedRow[]>`
    UPDATE "MailerSend" SET status = 'SENDING', "claimedAt" = (now() AT TIME ZONE 'UTC'), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "MailerSend"
      WHERE "campaignId" = ${campaignId} AND status = 'PENDING'
        AND "nextAttemptAt" <= (now() AT TIME ZONE 'UTC')
      ORDER BY "createdAt", id
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, email, name, vars, attempts`;
}

/** Fails everything still waiting in a campaign (its account is gone or switched off). */
async function failWaiting(campaignId: string, error: string) {
  await prisma.mailerSend.updateMany({
    where: { campaignId, status: { in: ["PENDING", "SENDING"] } },
    data: { status: "FAILED", error, claimedAt: null },
  });
}

async function sendSome(
  campaign: MailerCampaign & { account: MailerAccount | null },
  footer: { name: string; address: string | null },
  now: Date,
  summary: MailerRunSummary,
): Promise<boolean> {
  const account = campaign.account;
  if (!account) {
    await failWaiting(campaign.id, "The sending account was deleted.");
    return false;
  }
  if (!account.active) {
    await failWaiting(campaign.id, "The sending account is switched off.");
    return false;
  }
  const room = await allowance(account, now);
  if (room <= 0) return false;
  const rows = await claim(campaign.id, Math.min(BATCH, room));
  if (rows.length === 0) return false;

  // Someone may have unsubscribed since the campaign was queued.
  const off = new Set(
    (
      await prisma.mailerSuppression.findMany({
        where: { email: { in: rows.map((r) => r.email) } },
        select: { email: true },
      })
    ).map((s) => s.email),
  );
  const skip = rows.filter((r) => off.has(r.email));
  if (skip.length) {
    await prisma.mailerSend.updateMany({
      where: { id: { in: skip.map((r) => r.id) } },
      data: { status: "SKIPPED", error: "Unsubscribed before it was sent", claimedAt: null },
    });
    summary.skipped += skip.length;
  }
  const go = rows.filter((r) => !off.has(r.email));
  if (go.length === 0) return true;

  let apiKey: string;
  try {
    apiKey = decrypt(account.apiKey);
  } catch {
    await failWaiting(campaign.id, "The sending account's API key can't be read. Enter it again.");
    return false;
  }

  const emails = go.map((r) => {
    const vars =
      r.vars && typeof r.vars === "object" ? (r.vars as MergeVars) : contactVars({ email: r.email, name: r.name });
    return buildEmail(campaign, account, footer, r.email, vars);
  });
  const outcomes = await sendBatch(apiKey, emails, go.map((r) => r.id));

  const sentAt = new Date();
  await Promise.all(
    go.map((r, i) => {
      const o = outcomes[i];
      if (o.ok) {
        summary.sent++;
        return prisma.mailerSend.update({
          where: { id: r.id },
          data: { status: "SENT", providerMessageId: o.id, sentAt, error: null, claimedAt: null },
        });
      }
      if (o.transient && r.attempts < MAX_ATTEMPTS) {
        summary.retrying++;
        return prisma.mailerSend.update({
          where: { id: r.id },
          data: {
            status: "PENDING",
            error: o.error,
            claimedAt: null,
            nextAttemptAt: new Date(sentAt.getTime() + BACKOFF_MS[Math.min(r.attempts - 1, BACKOFF_MS.length - 1)]),
          },
        });
      }
      summary.failed++;
      return prisma.mailerSend.update({
        where: { id: r.id },
        data: { status: "FAILED", error: o.error, claimedAt: null },
      });
    }),
  );
  return true;
}

export async function runMailer(now = new Date()): Promise<MailerRunSummary> {
  const summary: MailerRunSummary = { started: 0, sent: 0, failed: 0, retrying: 0, skipped: 0, finished: 0 };
  const settings = await getMailerSettings();
  if (settings.paused) return { ...summary, paused: true };
  const footer = { name: settings.footerName, address: settings.footerAddress };

  // 1. Scheduled campaigns whose time has come. The status change is the
  // claim: only the run that flips SCHEDULED → SENDING queues the sends.
  const due = await prisma.mailerCampaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    select: { id: true, audience: true },
  });
  for (const c of due) {
    const flipped = await prisma.mailerCampaign.updateMany({
      where: { id: c.id, status: "SCHEDULED" },
      data: { status: "SENDING", startedAt: now },
    });
    if (flipped.count !== 1) continue;
    await queueCampaignSends(c.id, parseAudience(c.audience));
    await refreshCampaignCounts(c.id);
    summary.started++;
  }

  // 2. Rows a crashed run left in SENDING go back in the queue. Worst case
  // one person gets a duplicate; the batch idempotency key usually stops even that.
  await prisma.mailerSend.updateMany({
    where: { status: "SENDING", claimedAt: { lt: new Date(now.getTime() - STUCK_MS) } },
    data: { status: "PENDING", claimedAt: null },
  });

  // 3. Send, oldest campaign first, until there's nothing to do or time's up.
  const begin = Date.now();
  while (Date.now() - begin < BUDGET_MS) {
    const live = await prisma.mailerCampaign.findMany({
      where: { status: "SENDING" },
      orderBy: { startedAt: "asc" },
      include: { account: true },
    });
    let progressed = false;
    for (const c of live) {
      if (Date.now() - begin >= BUDGET_MS) break;
      if (await sendSome(c, footer, new Date(), summary)) progressed = true;
    }
    if (!progressed) break;
  }

  // 4. Close campaigns with nothing left waiting.
  const open = await prisma.mailerCampaign.findMany({ where: { status: "SENDING" }, select: { id: true } });
  for (const c of open) {
    const counts = await refreshCampaignCounts(c.id);
    if (counts.waiting > 0) continue;
    await prisma.mailerCampaign.updateMany({
      where: { id: c.id, status: "SENDING" },
      data: { status: counts.sent === 0 && counts.failed > 0 ? "FAILED" : "SENT", completedAt: new Date() },
    });
    summary.finished++;
  }
  return summary;
}

/** A test email of a campaign (or draft) to one address, filled in with a contact's values or samples. */
export async function sendTestEmail(opts: {
  account: MailerAccount;
  campaign: Pick<MailerCampaign, "id" | "subject" | "preheader" | "bodyHtml">;
  to: string;
  vars: MergeVars;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = await getMailerSettings();
  const email = buildEmail(
    { ...opts.campaign, subject: `[Test] ${opts.campaign.subject}` },
    opts.account,
    { name: settings.footerName, address: settings.footerAddress },
    opts.to,
    opts.vars,
  );
  let apiKey: string;
  try {
    apiKey = decrypt(opts.account.apiKey);
  } catch {
    return { ok: false, error: "The account's API key can't be read. Enter it again." };
  }
  const r = await sendOne(apiKey, email);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
