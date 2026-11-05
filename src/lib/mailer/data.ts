import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/admin-guard";
import { parseAudience } from "@/lib/mailer/audience";
import { getMailerSettings } from "@/lib/mailer/settings";
import { PAGE_SIZE } from "@/lib/admin-data";

// Read side of /admin/mailer. Every loader re-checks the platform admin.

// Same as the rest of the admin panel, so the shared Pager counts pages right.
export const MAILER_PAGE_SIZE = PAGE_SIZE;

/** Every tag in use, with how many contacts have it. */
export async function tagCounts(): Promise<{ tag: string; count: number }[]> {
  const rows = await prisma.$queryRaw<{ tag: string; count: bigint }[]>`
    SELECT t AS tag, count(*) AS count FROM "MailerContact", unnest(tags) AS t GROUP BY t ORDER BY t`;
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}

/** Extra spreadsheet fields that contacts have, for the editor's merge-field menu. */
export async function customFieldKeys(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ key: string }[]>`
    SELECT DISTINCT jsonb_object_keys(fields) AS key FROM "MailerContact"
    WHERE fields IS NOT NULL AND jsonb_typeof(fields) = 'object' ORDER BY 1 LIMIT 50`;
  return rows.map((r) => r.key);
}

export async function getMailerHome() {
  await requirePlatformAdmin();
  const [campaigns, accounts, contacts, suppressed, settings, heartbeat] = await Promise.all([
    prisma.mailerCampaign.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { account: { select: { name: true } } },
    }),
    prisma.mailerAccount.count(),
    prisma.mailerContact.count(),
    prisma.mailerSuppression.count(),
    getMailerSettings(),
    prisma.cronHeartbeat.findUnique({ where: { name: "mailer" } }),
  ]);
  return { campaigns, accounts, contacts, suppressed, settings, heartbeat };
}

export async function getCampaignEditor(campaignId?: string, templateId?: string) {
  await requirePlatformAdmin();
  const [accounts, templates, tags, fields, campaign, template] = await Promise.all([
    prisma.mailerAccount.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, fromName: true, fromEmail: true, replyTo: true, active: true, lastVerifiedAt: true },
    }),
    prisma.mailerTemplate.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, subject: true, preheader: true, bodyHtml: true },
    }),
    tagCounts(),
    customFieldKeys(),
    campaignId ? prisma.mailerCampaign.findUnique({ where: { id: campaignId } }) : null,
    templateId ? prisma.mailerTemplate.findUnique({ where: { id: templateId } }) : null,
  ]);
  return {
    accounts,
    templates,
    tags,
    fields,
    campaign: campaign && { ...campaign, audience: parseAudience(campaign.audience) },
    template,
  };
}

export const SEND_FILTERS = ["all", "sent", "delivered", "failed", "skipped", "waiting", "bounced", "complained", "opened"] as const;
export type SendFilter = (typeof SEND_FILTERS)[number];

function sendWhere(f: SendFilter): Prisma.MailerSendWhereInput {
  switch (f) {
    case "sent":
      return { status: "SENT" };
    case "delivered":
      return { deliveredAt: { not: null } };
    case "failed":
      return { status: "FAILED" };
    case "skipped":
      return { status: "SKIPPED" };
    case "waiting":
      return { status: { in: ["PENDING", "SENDING"] } };
    case "bounced":
      return { bouncedAt: { not: null } };
    case "complained":
      return { complainedAt: { not: null } };
    case "opened":
      return { openedAt: { not: null } };
    default:
      return {};
  }
}

export async function getCampaignReport(campaignId: string, opts: { filter: SendFilter; q?: string; page: number }) {
  await requirePlatformAdmin();
  const campaign = await prisma.mailerCampaign.findUnique({
    where: { id: campaignId },
    include: { account: { select: { name: true, fromName: true, fromEmail: true, webhookSecret: true } } },
  });
  if (!campaign) return null;
  // Only whether delivery tracking is set up; the secret itself stays here.
  const tracking = !!campaign.account?.webhookSecret;
  if (campaign.account) campaign.account.webhookSecret = null;
  const where: Prisma.MailerSendWhereInput = {
    campaignId,
    ...sendWhere(opts.filter),
    ...(opts.q ? { email: { contains: opts.q.toLowerCase() } } : {}),
  };
  const [sends, total, waiting] = await Promise.all([
    prisma.mailerSend.findMany({
      where,
      orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { email: "asc" }],
      skip: (opts.page - 1) * MAILER_PAGE_SIZE,
      take: MAILER_PAGE_SIZE,
    }),
    prisma.mailerSend.count({ where }),
    prisma.mailerSend.count({ where: { campaignId, status: { in: ["PENDING", "SENDING"] } } }),
  ]);
  return { campaign: { ...campaign, audience: parseAudience(campaign.audience) }, sends, total, waiting, tracking };
}

export async function getContactsPage(opts: { q?: string; tag?: string; page: number }) {
  await requirePlatformAdmin();
  const where: Prisma.MailerContactWhereInput = {
    ...(opts.tag ? { tags: { has: opts.tag } } : {}),
    ...(opts.q
      ? {
          OR: [
            { email: { contains: opts.q.toLowerCase() } },
            { name: { contains: opts.q, mode: "insensitive" } },
            { company: { contains: opts.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [contacts, total, all, tags] = await Promise.all([
    prisma.mailerContact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * MAILER_PAGE_SIZE,
      take: MAILER_PAGE_SIZE,
    }),
    prisma.mailerContact.count({ where }),
    prisma.mailerContact.count(),
    tagCounts(),
  ]);
  const off = new Map(
    (
      await prisma.mailerSuppression.findMany({
        where: { email: { in: contacts.map((c) => c.email) } },
        select: { email: true, reason: true },
      })
    ).map((s) => [s.email, s.reason]),
  );
  return {
    contacts: contacts.map((c) => ({ ...c, suppressed: off.get(c.email) ?? null })),
    total,
    all,
    tags,
  };
}

export async function getSendingPage() {
  await requirePlatformAdmin();
  const [accounts, settings, heartbeat] = await Promise.all([
    prisma.mailerAccount.findMany({ orderBy: { name: "asc" } }),
    getMailerSettings(),
    prisma.cronHeartbeat.findUnique({ where: { name: "mailer" } }),
  ]);
  const since = new Date(Date.now() - 24 * 3_600_000);
  const sentToday = await Promise.all(
    accounts.map((a) => prisma.mailerSend.count({ where: { campaign: { accountId: a.id }, sentAt: { gte: since } } })),
  );
  return {
    // Secrets never leave the server: only whether they're set.
    accounts: accounts.map(({ apiKey, webhookSecret, ...a }, i) => ({
      ...a,
      hasApiKey: !!apiKey,
      hasWebhookSecret: !!webhookSecret,
      sentToday: sentToday[i],
    })),
    settings,
    heartbeat,
    // pg_cron runs it every minute; 5 quiet minutes means it isn't running.
    workerStale: !heartbeat || Date.now() - heartbeat.lastRunAt.getTime() > 5 * 60_000,
  };
}

export async function getTemplatesPage() {
  await requirePlatformAdmin();
  return prisma.mailerTemplate.findMany({ orderBy: { updatedAt: "desc" } });
}

export async function getTemplateEditor(templateId: string | null) {
  await requirePlatformAdmin();
  const [template, fields] = await Promise.all([
    templateId ? prisma.mailerTemplate.findUnique({ where: { id: templateId } }) : null,
    customFieldKeys(),
  ]);
  return { template, fields };
}

export async function getSuppressionPage(opts: { q?: string; page: number }) {
  await requirePlatformAdmin();
  const where: Prisma.MailerSuppressionWhereInput = opts.q ? { email: { contains: opts.q.toLowerCase() } } : {};
  const [rows, total, byReason] = await Promise.all([
    prisma.mailerSuppression.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * MAILER_PAGE_SIZE,
      take: MAILER_PAGE_SIZE,
    }),
    prisma.mailerSuppression.count({ where }),
    prisma.mailerSuppression.groupBy({ by: ["reason"], _count: { _all: true } }),
  ]);
  return {
    rows,
    total,
    byReason: Object.fromEntries(byReason.map((r) => [r.reason, r._count._all])) as Record<string, number>,
  };
}
