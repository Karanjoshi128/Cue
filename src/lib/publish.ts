import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getAdapter } from "@/lib/platforms";
import type { Post, PostTarget } from "@prisma/client";

const MAX_ATTEMPTS = 3;

/**
 * Core publishing engine. Finds due targets, publishes each, records results,
 * writes permanent PostHistory, and rolls up parent Post status.
 * Idempotent: targets are flipped to PROCESSING before sending.
 */
export async function publishDueTargets(now = new Date()): Promise<{
  processed: number;
  published: number;
  failed: number;
}> {
  const due = await prisma.postTarget.findMany({
    where: {
      status: "SCHEDULED",
      attempts: { lt: MAX_ATTEMPTS },
      post: { scheduledAt: { lte: now } },
    },
    include: {
      post: { include: { media: true, client: true } },
      account: true,
    },
    take: 50,
  });

  let published = 0;
  let failed = 0;

  for (const target of due) {
    // Claim the target (optimistic lock on status).
    const claim = await prisma.postTarget.updateMany({
      where: { id: target.id, status: "SCHEDULED" },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
    if (claim.count === 0) continue; // someone else grabbed it

    try {
      const adapter = getAdapter(target.platform);
      const result = await adapter.publish({
        body: target.bodyOverride ?? target.post.body,
        media: target.post.media.map((m) => ({ type: m.type, url: m.url })),
        accessToken: decrypt(target.account.accessToken),
        externalId: target.account.externalId,
      });

      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          externalPostId: result.externalPostId,
          permalink: result.permalink,
          error: null,
        },
      });

      await prisma.postHistory.create({
        data: {
          clientId: target.post.clientId,
          clientName: target.post.client.name,
          platform: target.platform,
          externalPostId: result.externalPostId,
          permalink: result.permalink,
          publishedAt: new Date(),
        },
      });

      published++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Back to SCHEDULED for retry unless we've exhausted attempts.
      const exhausted = target.attempts + 1 >= MAX_ATTEMPTS;
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          status: exhausted ? "FAILED" : "SCHEDULED",
          error: message.slice(0, 500),
        },
      });
      failed++;
    }
  }

  // Roll up parent post statuses for any posts touched.
  const postIds = [...new Set(due.map((t) => t.postId))];
  for (const postId of postIds) {
    await rollUpPostStatus(postId);
  }

  return { processed: due.length, published, failed };
}

async function rollUpPostStatus(postId: string): Promise<void> {
  const targets = await prisma.postTarget.findMany({ where: { postId } });
  if (targets.length === 0) return;

  const statuses = targets.map((t) => t.status);
  const allPublished = statuses.every((s) => s === "PUBLISHED");
  const anyPublished = statuses.some((s) => s === "PUBLISHED");
  const anyPending = statuses.some(
    (s) => s === "SCHEDULED" || s === "PROCESSING",
  );

  let status: Post["status"];
  if (allPublished) status = "PUBLISHED";
  else if (anyPending) status = "PUBLISHING";
  else if (anyPublished) status = "PARTIAL";
  else status = "FAILED";

  await prisma.post.update({ where: { id: postId }, data: { status } });
}

/** Publish a single post immediately ("Post now"). */
export async function publishPostNow(postId: string): Promise<void> {
  await prisma.post.update({
    where: { id: postId },
    data: { status: "PUBLISHING", scheduledAt: new Date() },
  });
  await prisma.postTarget.updateMany({
    where: { postId, status: { in: ["SCHEDULED", "FAILED"] } },
    data: { status: "SCHEDULED" },
  });
  await publishDueTargets(new Date(Date.now() + 1000));
}

export type DueTarget = PostTarget & { post: Post };
