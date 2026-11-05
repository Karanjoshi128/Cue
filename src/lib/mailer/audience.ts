import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { contactVars } from "@/lib/mailer/merge";

/*
 * Who a campaign goes to: everyone, or contacts with any of some tags, minus
 * contacts with any excluded tag. The do-not-email list always wins.
 */

const tag = z.string().trim().min(1).max(40);

export const audienceSchema = z.object({
  tags: z.array(tag).max(50).default([]),
  excludeTags: z.array(tag).max(50).default([]),
});
export type Audience = z.infer<typeof audienceSchema>;

export function parseAudience(raw: unknown): Audience {
  const r = audienceSchema.safeParse(raw ?? {});
  return r.success ? r.data : { tags: [], excludeTags: [] };
}

export function audienceWhere(a: Audience): Prisma.MailerContactWhereInput {
  return {
    ...(a.tags.length ? { tags: { hasSome: a.tags } } : {}),
    ...(a.excludeTags.length ? { NOT: { tags: { hasSome: a.excludeTags } } } : {}),
  };
}

/** How many contacts match, how many of those are on the do-not-email list, and so how many would get it. */
export async function countAudience(a: Audience): Promise<{ matched: number; suppressed: number; reachable: number }> {
  const rows = await prisma.$queryRaw<{ matched: bigint; suppressed: bigint }[]>`
    SELECT count(*) AS matched, count(s.email) AS suppressed
    FROM "MailerContact" c
    LEFT JOIN "MailerSuppression" s ON s.email = c.email
    WHERE (cardinality(${a.tags}::text[]) = 0 OR c.tags && ${a.tags}::text[])
      AND NOT (c.tags && ${a.excludeTags}::text[])`;
  const matched = Number(rows[0]?.matched ?? 0);
  const suppressed = Number(rows[0]?.suppressed ?? 0);
  return { matched, suppressed, reachable: matched - suppressed };
}

/**
 * Turns the audience into one send row per person, in pages so a big list
 * doesn't sit in memory. Suppressed addresses get a SKIPPED row, so the log
 * shows why they didn't get it. Safe to call twice: (campaignId, email) is unique.
 */
export async function queueCampaignSends(campaignId: string, a: Audience): Promise<{ queued: number; skipped: number }> {
  const where = audienceWhere(a);
  let cursor: string | undefined;
  let queued = 0;
  let skipped = 0;
  for (;;) {
    const page = await prisma.mailerContact.findMany({
      where,
      orderBy: { id: "asc" },
      take: 2000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, email: true, name: true, company: true, fields: true },
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    const suppressed = new Set(
      (
        await prisma.mailerSuppression.findMany({
          where: { email: { in: page.map((c) => c.email) } },
          select: { email: true },
        })
      ).map((s) => s.email),
    );
    const now = new Date();
    const res = await prisma.mailerSend.createMany({
      data: page.map((c) => {
        const off = suppressed.has(c.email);
        if (off) skipped++;
        else queued++;
        return {
          campaignId,
          contactId: c.id,
          email: c.email,
          name: c.name,
          vars: contactVars(c),
          status: off ? "SKIPPED" : "PENDING",
          error: off ? "On the do-not-email list" : null,
          nextAttemptAt: now,
        };
      }),
      skipDuplicates: true,
    });
    void res;
    if (page.length < 2000) break;
  }
  return { queued, skipped };
}

/** Recomputes a campaign's counts from its sends. */
export async function refreshCampaignCounts(campaignId: string) {
  const [byStatus, events] = await Promise.all([
    prisma.mailerSend.groupBy({ by: ["status"], where: { campaignId }, _count: { _all: true } }),
    prisma.$queryRaw<
      { delivered: bigint; bounced: bigint; complained: bigint; opened: bigint; clicked: bigint }[]
    >`SELECT count("deliveredAt") AS delivered, count("bouncedAt") AS bounced,
             count("complainedAt") AS complained, count("openedAt") AS opened, count("clickedAt") AS clicked
      FROM "MailerSend" WHERE "campaignId" = ${campaignId}`,
  ]);
  const n = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const e = events[0];
  const counts = {
    total: byStatus.reduce((t, b) => t + b._count._all, 0),
    sent: n("SENT"),
    failed: n("FAILED"),
    skipped: n("SKIPPED"),
    delivered: Number(e?.delivered ?? 0),
    bounced: Number(e?.bounced ?? 0),
    complained: Number(e?.complained ?? 0),
    opened: Number(e?.opened ?? 0),
    clicked: Number(e?.clicked ?? 0),
  };
  await prisma.mailerCampaign.update({ where: { id: campaignId }, data: counts });
  return { ...counts, waiting: n("PENDING") + n("SENDING") };
}
