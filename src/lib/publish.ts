import { prisma } from "@/lib/prisma";
import { COMMENT_PLATFORMS, getAdapter } from "@/lib/platforms";
import { ensureFreshAccessToken } from "@/lib/tokens";
import { isPublishingPaused, PAUSED_MESSAGE } from "@/lib/platform-settings";
import { ApiError } from "@/lib/api";
import type { Platform, Post, PostTarget, Prisma } from "@prisma/client";
import type {
  PublishArticle,
  PublishPoll,
  YouTubePrivacy,
} from "@/lib/platforms/types";

export const MAX_ATTEMPTS = 3;

// A target still PROCESSING this long after its post was due belongs to a run
// that died mid-publish (function timeout or crash). Nothing else would ever
// pick it up again, because only SCHEDULED targets are claimed.
const STALE_PROCESSING_MS = 20 * 60 * 1000;

// Stop claiming new targets once a run has used this much of its time, so the
// one in hand can finish and record its result before the function is killed.
const RUN_BUDGET_MS = 200 * 1000;

export const MAX_COMMENT_ATTEMPTS = 3;

// A first comment waits this long after its post went live: YouTube can refuse
// comments on a video it is still processing.
const COMMENT_DELAY_MS = 60 * 1000;

// A comment attempt claims its target by stamping claimedAt, which nothing
// else reads once a target is PUBLISHED. Other runs leave a claimed target
// alone for this long, longer than any run can live (300 s), so two
// overlapping runs never post the same comment twice. A failed attempt is
// retried once this has passed.
const COMMENT_CLAIM_MS = 6 * 60 * 1000;

// The scope each platform needs for comments, as SocialAccount.scopes records
// it. Accounts connected before first comments existed lack it until they
// reconnect, so their failures get RECONNECT_FOR_COMMENTS in front.
export const COMMENT_SCOPES: Partial<Record<Platform, string>> = {
  YOUTUBE: "youtube.force-ssl",
  INSTAGRAM: "instagram_business_manage_comments",
};
const RECONNECT_FOR_COMMENTS = "Reconnect this account to allow comments: ";
// Google's 403 for a token without the scope, e.g. when the user unticked it
// on the consent screen although the stored scopes list it.
const MISSING_SCOPE_ERROR =
  /insufficientPermissions|insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i;

// The link/poll columns are JSON - normalize them into typed publish inputs.
function linkToArticle(link: unknown): PublishArticle | undefined {
  if (!link || typeof link !== "object") return undefined;
  const l = link as { url?: string; title?: string; description?: string };
  return l.url
    ? { source: l.url, title: l.title, description: l.description }
    : undefined;
}
function jsonToPoll(poll: unknown): PublishPoll | undefined {
  if (!poll || typeof poll !== "object") return undefined;
  const p = poll as {
    question?: string;
    options?: string[];
    duration?: PublishPoll["duration"];
  };
  return p.question && p.options?.length
    ? {
        question: p.question,
        options: p.options,
        duration: p.duration ?? "THREE_DAYS",
      }
    : undefined;
}

/**
 * Core publishing engine. Finds due targets, publishes each, records results,
 * writes permanent PostHistory, and rolls up parent Post status. Then, with
 * whatever is left of the run budget, posts first comments (postFirstComments)
 * unless `firstComments` is false.
 * Idempotent: targets are flipped to PROCESSING before sending.
 */
export async function publishDueTargets(
  now = new Date(),
  { firstComments = true }: { firstComments?: boolean } = {},
): Promise<{
  processed: number;
  published: number;
  failed: number;
  /** First comments posted / failed; absent when the comment step didn't run. */
  commented?: number;
  commentsFailed?: number;
  /** True when a platform admin has paused publishing; nothing was sent. */
  paused?: boolean;
}> {
  // Paused from the admin panel: due posts stay SCHEDULED and go out on the
  // first run after it resumes.
  if (await isPublishingPaused()) {
    return { processed: 0, published: 0, failed: 0, paused: true };
  }
  const startedAt = Date.now();
  await releaseStaleTargets(now);

  const due = await prisma.postTarget.findMany({
    where: {
      status: "SCHEDULED",
      attempts: { lt: MAX_ATTEMPTS },
      // Only publish posts that are due, approved, and not a lingering draft.
      // Posts in review (PENDING / CHANGES_REQUESTED) are held back.
      // A suspended workspace's posts wait until it's unsuspended.
      post: {
        scheduledAt: { lte: now },
        approval: "APPROVED",
        status: { in: ["SCHEDULED", "PUBLISHING"] },
        client: { workspace: { suspendedAt: null } },
      },
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
    // Out of time: leave the rest SCHEDULED for the next run.
    if (Date.now() - startedAt > RUN_BUDGET_MS) break;

    // Claim the target (optimistic lock on status).
    const claim = await prisma.postTarget.updateMany({
      where: { id: target.id, status: "SCHEDULED" },
      data: { status: "PROCESSING", attempts: { increment: 1 }, claimedAt: new Date() },
    });
    if (claim.count === 0) continue; // someone else grabbed it

    try {
      const adapter = getAdapter(target.platform);
      const result = await adapter.publish({
        body: target.bodyOverride ?? target.post.body,
        title: target.post.title ?? undefined,
        privacy:
          (target.post.youtubePrivacy as YouTubePrivacy | null) ?? undefined,
        tags: target.post.youtubeTags.length
          ? target.post.youtubeTags
          : undefined,
        categoryId: target.post.youtubeCategoryId ?? undefined,
        media: target.post.media.map((m) => ({
          type: m.type,
          url: m.url,
          title: m.title ?? undefined,
        })),
        article: linkToArticle(target.post.link),
        poll: jsonToPoll(target.post.poll),
        // Refreshes short-lived tokens (YouTube/Google ~1h) right before use.
        accessToken: await ensureFreshAccessToken(target.account),
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
          workspaceId: target.post.client.workspaceId,
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
      console.error(`[publish] target ${target.id} (${target.platform}): ${message}`);
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

  // Comments come last and only on time to spare. Nothing they throw may
  // escape: by now this run has published posts and must report them.
  let comments: Awaited<ReturnType<typeof postFirstComments>> | undefined;
  if (firstComments && Date.now() - startedAt < RUN_BUDGET_MS) {
    try {
      comments = await postFirstComments(startedAt + RUN_BUDGET_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[publish] first comments: ${message}`);
    }
  }

  return { processed: due.length, published, failed, ...comments };
}

/**
 * Posts each published target's first comment (Post.firstComment), stopping
 * once `deadline` (epoch ms) has passed. It runs at the end of every publish
 * sweep, so a comment goes out on the first sweep at least COMMENT_DELAY_MS
 * after its post went live.
 *
 * A target gets MAX_COMMENT_ATTEMPTS tries, across sweeps. A failure is only
 * written to commentError: the target and its post stay PUBLISHED.
 */
export async function postFirstComments(
  deadline = Date.now() + RUN_BUDGET_MS,
): Promise<{ commented: number; commentsFailed: number }> {
  const now = Date.now();
  const due = await prisma.postTarget.findMany({
    where: {
      status: "PUBLISHED",
      externalPostId: { not: null },
      platform: { in: COMMENT_PLATFORMS },
      commentedAt: null,
      commentAttempts: { lt: MAX_COMMENT_ATTEMPTS },
      publishedAt: { lte: new Date(now - COMMENT_DELAY_MS) },
      // Never tried, or the last attempt's claim has run out. (A first
      // attempt needs no claim check: the claim below can't succeed twice.)
      OR: [
        { commentAttempts: 0 },
        { claimedAt: { lt: new Date(now - COMMENT_CLAIM_MS) } },
      ],
      // A suspended workspace's comments wait, like its posts.
      post: {
        firstComment: { not: null },
        client: { workspace: { suspendedAt: null } },
      },
    },
    include: { post: { select: { firstComment: true } }, account: true },
    orderBy: { publishedAt: "asc" },
    take: 50,
  });

  let commented = 0;
  let commentsFailed = 0;

  for (const target of due) {
    if (Date.now() > deadline) break;
    const adapter = getAdapter(target.platform);
    const { externalPostId } = target;
    const text = target.post.firstComment;
    if (!adapter.comment || !externalPostId || !text) continue;

    // Count the attempt before sending anything. Matching on the attempt
    // count read above makes this the lock: if another run got here first,
    // the count has moved on and this claims nothing.
    const claim = await prisma.postTarget.updateMany({
      where: {
        id: target.id,
        status: "PUBLISHED",
        commentedAt: null,
        commentAttempts: target.commentAttempts,
      },
      data: { commentAttempts: { increment: 1 }, claimedAt: new Date() },
    });
    if (claim.count === 0) continue;

    let commentId: string;
    try {
      ({ commentId } = await adapter.comment({
        accessToken: await ensureFreshAccessToken(target.account),
        externalId: target.account.externalId,
        postExternalId: externalPostId,
        text,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[publish] comment on target ${target.id} (${target.platform}): ${message}`,
      );
      await prisma.postTarget.update({
        where: { id: target.id },
        data: {
          commentError: commentErrorFor(
            target.platform,
            target.account.scopes,
            message,
          ),
        },
      });
      commentsFailed++;
      continue;
    }

    await prisma.postTarget.update({
      where: { id: target.id },
      data: { commentId, commentedAt: new Date(), commentError: null },
    });
    commented++;
  }

  return { commented, commentsFailed };
}

/** The stored commentError: says to reconnect when a missing scope is why. */
function commentErrorFor(
  platform: Platform,
  scopes: string | null,
  message: string,
): string {
  const scope = COMMENT_SCOPES[platform];
  const missingScope =
    scope !== undefined &&
    (!scopes?.includes(scope) || MISSING_SCOPE_ERROR.test(message));
  return ((missingScope ? RECONNECT_FOR_COMMENTS : "") + message).slice(0, 500);
}

/**
 * Hands back targets a dead run left in PROCESSING: retried if they have
 * attempts left, FAILED otherwise. Without this a single killed invocation
 * strands the post forever - it shows as "scheduled" and never publishes.
 */
async function releaseStaleTargets(now: Date): Promise<void> {
  const stale = staleProcessingWhere(now, STALE_PROCESSING_MS);
  const error = "A previous publish attempt did not finish.";
  const failed = await prisma.postTarget.findMany({
    where: { ...stale, attempts: { gte: MAX_ATTEMPTS } },
    select: { postId: true },
  });
  await prisma.postTarget.updateMany({
    where: { ...stale, attempts: { gte: MAX_ATTEMPTS } },
    data: { status: "FAILED", error },
  });
  const retried = await prisma.postTarget.updateMany({
    where: { ...stale, attempts: { lt: MAX_ATTEMPTS } },
    data: { status: "SCHEDULED", error },
  });
  if (failed.length || retried.count) {
    console.warn(
      `[publish] released stale PROCESSING targets: ${retried.count} to retry, ${failed.length} failed`,
    );
  }
  for (const postId of new Set(failed.map((t) => t.postId))) {
    await rollUpPostStatus(postId);
  }
}

/**
 * PROCESSING targets claimed longer ago than `ageMs`. Judged by the claim
 * time, not the due time: a post held back by a pause or a suspension is
 * long overdue the moment a run picks it up, and must not look abandoned
 * while that run is still uploading it. Targets claimed before claimedAt
 * existed fall back to the due time.
 */
export function staleProcessingWhere(now: Date, ageMs: number): Prisma.PostTargetWhereInput {
  const before = new Date(now.getTime() - ageMs);
  return {
    status: "PROCESSING",
    OR: [
      { claimedAt: { lt: before } },
      { claimedAt: null, post: { scheduledAt: { lt: before } } },
    ],
  };
}

export async function rollUpPostStatus(postId: string): Promise<void> {
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
  if (await isPublishingPaused()) throw new ApiError(503, PAUSED_MESSAGE);
  // Never bypass the approval gate - otherwise the post flips to PUBLISHING but
  // publishDueTargets skips it, leaving it stuck with no recovery in the UI.
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { approval: true },
  });
  if (post && post.approval !== "APPROVED") {
    throw new ApiError(
      409,
      "This post is awaiting approval - approve it before publishing.",
    );
  }

  await prisma.post.update({
    where: { id: postId },
    data: { status: "PUBLISHING", scheduledAt: new Date() },
  });
  // Reset attempts so previously-FAILED targets actually re-enter the due set.
  await prisma.postTarget.updateMany({
    where: { postId, status: { in: ["SCHEDULED", "FAILED"] } },
    data: { status: "SCHEDULED", attempts: 0, error: null },
  });
  // No first comments here: this runs inside the user's request, and a post
  // just published isn't due for one yet. The next cron sweep posts it.
  await publishDueTargets(new Date(Date.now() + 1000), { firstComments: false });
}

export type DueTarget = PostTarget & { post: Post };
