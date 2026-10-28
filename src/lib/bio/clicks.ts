import { prisma } from "@/lib/prisma";

// Daily view and click counts for link pages. Crawlers and link previews
// (WhatsApp, iMessage, Slack, Meta's own) fetch pages too and aren't counted.

const BOTS =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|meta-externalagent|whatsapp|telegram|discord|skype|slack|embedly|headless|lighthouse|curl|wget|python|go-http|okhttp|java\//i;

export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOTS.test(userAgent);
}

/** Adds one to today's (UTC) count for a target: "view", a link id or a post id. */
export async function countHit(pageId: string, target: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "BioClick" ("id", "pageId", "target", "day", "count")
    VALUES (gen_random_uuid()::text, ${pageId}, ${target}, (now() AT TIME ZONE 'utc')::date, 1)
    ON CONFLICT ("pageId", "target", "day") DO UPDATE SET "count" = "BioClick"."count" + 1`;
}
