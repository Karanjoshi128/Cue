import type {
  AutomationRunStatus,
  AutomationSource,
  AutomationTrigger,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureFreshAccessToken } from "@/lib/tokens";
import { isPublishingPaused } from "@/lib/platform-settings";
import { featureAvailableAnywhere } from "@/lib/plans";
import { PRIVATE_REPLY_WINDOW_MS } from "./config";
import { matchesKeywords } from "./match";
import {
  listComments,
  listRecentMedia,
  replyToComment,
  sendMessage,
  type InstagramComment,
} from "./instagram-api";
import {
  accountSelect,
  asApiError,
  automationBlocker,
  fill,
  firstMessage,
  followUpAt,
  isUniqueViolation,
  MESSAGE_WINDOW_MS,
  type AutomationAccount,
} from "./shared";
import { recordLead } from "./leads";
import { holdReason } from "./moderation";
import { aiEnabled } from "@/lib/ai";

/*
 * Instagram automations, the first message. A comment reaches ingestComments()
 * from a webhook (instant; Meta sends them once the app is published) or
 * from pollAccount() (the check every 5 minutes, a safety net for anything a
 * webhook missed). Story replies and DM keywords
 * come in through conversation.ts. Either way each one becomes at most one
 * AutomationRun, which processRun() sends: the DM first, then the public
 * reply, because a reply saying "check your DMs" is wrong when the DM didn't
 * go. What follows the first DM (taps, answers, follow-ups) is in
 * conversation.ts.
 */

const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [2, 5, 15, 60];
// Taking a run reserves it this long, so a second worker skips it.
const LEASE_MS = 5 * 60 * 1000;
// "Any post" rules watch this many of the account's newest posts when polling.
// Webhooks cover every post.
const ANY_POST_MEDIA = 10;
// First DMs per account per hour. Meta allows 750 private replies an hour;
// staying well under it keeps a viral post from looking like a spam burst.
const HOURLY_CAP = Number(process.env.IG_DM_HOURLY_CAP) || 200;

export interface IncomingComment {
  id: string;
  text: string;
  mediaId: string;
  fromId: string | null;
  fromUsername: string | null;
  parentId: string | null;
  timestamp: Date;
}

export { automationBlocker };

export function commentFromApi(c: InstagramComment, mediaId: string): IncomingComment {
  return {
    id: c.id,
    text: c.text ?? "",
    mediaId,
    fromId: c.from?.id ?? null,
    fromUsername: c.from?.username ?? c.username ?? null,
    parentId: c.parent_id ?? null,
    timestamp: c.timestamp ? new Date(c.timestamp) : new Date(),
  };
}

/**
 * A rule set on a Cue post that hadn't published yet learns its Instagram
 * media id here, once the post's Instagram target has gone live.
 */
async function resolveScheduledPostRules(accountId: string) {
  const pending = await prisma.automationRule.findMany({
    where: { accountId, scope: "ONE_POST", mediaId: null, postId: { not: null } },
    select: { id: true, postId: true },
  });
  for (const rule of pending) {
    const target = await prisma.postTarget.findFirst({
      where: {
        postId: rule.postId!,
        accountId,
        status: "PUBLISHED",
        externalPostId: { not: null },
      },
      select: { externalPostId: true, permalink: true },
    });
    if (target) {
      await prisma.automationRule.update({
        where: { id: rule.id },
        data: { mediaId: target.externalPostId, mediaPermalink: target.permalink },
      });
    }
  }
}

/**
 * Creates the run for a matched comment or message, deciding first whether
 * it's a repeat (once per person) or should be held. Returns the run id when
 * it's queued to send, null when skipped, held or already handled.
 */
export async function createRun(p: {
  account: AutomationAccount;
  rule: {
    id: string;
    name: string;
    trigger: AutomationTrigger;
    oncePerPerson: boolean;
    holdWords: string[];
    aiModeration: boolean;
  };
  eventId: string;
  mediaId: string | null;
  commenterId: string;
  username: string | null;
  text: string;
  at: Date;
  source: AutomationSource;
  recipientId?: string | null;
}): Promise<string | null> {
  const { rule } = p;
  const repeat =
    rule.oncePerPerson &&
    (await prisma.automationRun.count({
      where: {
        ruleId: rule.id,
        commenterId: p.commenterId,
        status: { in: ["QUEUED", "SENT", "PARTIAL"] },
      },
    })) > 0;
  const aiAllowed = aiEnabled() && !p.account.client.workspace.disabledFeatures.includes("ai");
  const held = repeat ? null : await holdReason(rule, p.text, aiAllowed);
  const status: AutomationRunStatus = repeat ? "SKIPPED" : held ? "HELD" : "QUEUED";

  let runId: string;
  try {
    const run = await prisma.automationRun.create({
      data: {
        ruleId: rule.id,
        commentId: p.eventId,
        trigger: rule.trigger,
        mediaId: p.mediaId,
        commenterId: p.commenterId,
        commenterUsername: p.username,
        commentText: p.text.slice(0, 2200),
        commentedAt: p.at,
        source: p.source,
        status,
        heldReason: held,
        // A story reply or DM opens Instagram's 24-hour window right away.
        recipientId: p.recipientId ?? null,
        lastUserAt: p.recipientId ? p.at : null,
      },
      select: { id: true },
    });
    runId = run.id;
  } catch (err) {
    // The webhook and the poll saw the same comment at the same moment.
    if (isUniqueViolation(err)) return null;
    throw err;
  }

  await prisma.automationRule.update({
    where: { id: rule.id },
    data: {
      matchedCount: { increment: 1 },
      heldCount: { increment: held ? 1 : 0 },
      lastTriggeredAt: new Date(),
    },
  });
  await recordLead({
    clientId: p.account.clientId,
    accountId: p.account.id,
    igsid: p.commenterId,
    username: p.username,
    source: rule.trigger,
    ruleName: rule.name,
  });
  return status === "QUEUED" ? runId : null;
}

/**
 * Turns new comments into runs and sends them. Safe to call with comments it
 * has seen before (polling re-reads them; Meta re-sends webhooks): each comment
 * becomes at most one run.
 */
export async function ingestComments(
  account: AutomationAccount,
  comments: IncomingComment[],
  source: AutomationSource,
): Promise<{ matched: number; sent: number }> {
  const handle = account.displayName.replace(/^@/, "").toLowerCase();
  const oldest = Date.now() - PRIVATE_REPLY_WINDOW_MS;
  const fresh = comments.filter(
    (c) =>
      c.text.trim() &&
      // Replies, including Cue's own public replies, never trigger a rule.
      !c.parentId &&
      c.fromId !== account.externalId &&
      c.fromUsername?.toLowerCase() !== handle &&
      c.timestamp.getTime() > oldest,
  );
  if (!fresh.length) return { matched: 0, sent: 0 };

  const known = await prisma.automationRun.findMany({
    where: { commentId: { in: fresh.map((c) => c.id) } },
    select: { commentId: true },
  });
  const seen = new Set(known.map((r) => r.commentId));
  const unseen = fresh
    .filter((c) => !seen.has(c.id))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  if (!unseen.length) return { matched: 0, sent: 0 };

  await resolveScheduledPostRules(account.id);
  const rules = await prisma.automationRule.findMany({
    where: { accountId: account.id, enabled: true, trigger: "COMMENT" },
    orderBy: { createdAt: "asc" },
  });
  // A rule for one post outranks a rule for every post.
  rules.sort(
    (a, b) => Number(a.scope !== "ONE_POST") - Number(b.scope !== "ONE_POST"),
  );

  let matched = 0;
  const queued: string[] = [];
  for (const c of unseen) {
    const rule = rules.find(
      (r) =>
        (r.scope === "ANY_POST" || r.mediaId === c.mediaId) &&
        r.activeSince <= c.timestamp &&
        matchesKeywords(c.text, r.keywords, r.matchMode, r.fuzzy),
    );
    if (!rule) continue;

    const runId = await createRun({
      account,
      rule,
      eventId: c.id,
      mediaId: c.mediaId,
      commenterId: c.fromId ?? (c.fromUsername ? `@${c.fromUsername}` : `comment:${c.id}`),
      username: c.fromUsername,
      text: c.text,
      at: c.timestamp,
      source,
    });
    matched++;
    if (runId) queued.push(runId);
  }

  let sent = 0;
  for (const id of queued) {
    const status = await processRun(id);
    if (status === "SENT" || status === "PARTIAL") sent++;
  }
  return { matched, sent };
}

function settle(p: {
  wantsDm: boolean;
  wantsReply: boolean;
  dmMessageId: string | null;
  replyId: string | null;
}): AutomationRunStatus {
  const dmOk = !p.wantsDm || !!p.dmMessageId;
  const replyOk = !p.wantsReply || !!p.replyId;
  if (dmOk && replyOk) return "SENT";
  if ((p.wantsDm && p.dmMessageId) || (p.wantsReply && p.replyId)) return "PARTIAL";
  return "FAILED";
}

/** First DMs this account sent in the last hour, for pacing. */
async function firstDmsLastHour(accountId: string): Promise<number> {
  return prisma.automationRun.count({
    where: { rule: { accountId }, dmSentAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
}

/**
 * Sends one queued run's first DM (and, for a comment, the public reply).
 * Returns its new status, or null when another worker holds it or it isn't
 * due. Never throws for Instagram's errors: they're recorded on the run.
 */
export async function processRun(runId: string): Promise<AutomationRunStatus | null> {
  const now = new Date();
  const claim = await prisma.automationRun.updateMany({
    where: {
      id: runId,
      status: "QUEUED",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    data: {
      nextAttemptAt: new Date(now.getTime() + LEASE_MS),
      attempts: { increment: 1 },
    },
  });
  if (claim.count === 0) return null;

  const run = await prisma.automationRun.findUniqueOrThrow({
    where: { id: runId },
    include: { rule: { include: { account: { select: accountSelect } } } },
  });
  const { rule } = run;
  const isComment = run.trigger === "COMMENT";
  const wantsDm = !!rule.dmText;
  const wantsReply = isComment && rule.replies.length > 0;

  let { dmMessageId, dmError, replyId, replyError } = run;
  const finish = async (status: AutomationRunStatus, extra: object = {}) => {
    await prisma.automationRun.update({
      where: { id: runId },
      data: {
        status,
        dmMessageId,
        dmError,
        replyId,
        replyError,
        lastError: null,
        nextAttemptAt: null,
        ...extra,
      },
    });
    return status;
  };
  const giveUp = (why: string) => {
    if (wantsDm && !dmMessageId && !dmError) dmError = why;
    if (wantsReply && !replyId && !replyError) replyError = why;
    return finish(settle({ wantsDm, wantsReply, dmMessageId, replyId }), { stage: "DONE" });
  };
  // Not an attempt: give it back and try again shortly.
  const later = async (why: string, minutes: number) => {
    await prisma.automationRun.update({
      where: { id: runId },
      data: {
        attempts: { decrement: 1 },
        nextAttemptAt: new Date(now.getTime() + minutes * 60 * 1000),
        lastError: why,
      },
    });
    return "QUEUED" as const;
  };

  if (!rule.enabled) return giveUp("The automation was switched off before this went out.");
  const blocker = automationBlocker(rule.account);
  if (blocker) return giveUp(blocker);
  if (isComment && now.getTime() - run.commentedAt.getTime() > PRIVATE_REPLY_WINDOW_MS) {
    return giveUp("Missed Instagram's 7-day window for replying to this comment.");
  }
  if (!isComment && (!run.lastUserAt || now.getTime() - run.lastUserAt.getTime() > MESSAGE_WINDOW_MS)) {
    return giveUp("Missed Instagram's 24-hour window for replying to this message.");
  }
  if (await isPublishingPaused()) {
    return later("Publishing is paused across Cue. This goes out when it resumes.", 5);
  }
  if (wantsDm && !dmMessageId && (await firstDmsLastHour(rule.accountId)) >= HOURLY_CAP) {
    return later(`Pacing: this account sent ${HOURLY_CAP} DMs in the last hour. This one goes out shortly.`, 3);
  }

  let token: string;
  try {
    token = await ensureFreshAccessToken(rule.account);
  } catch (err) {
    return giveUp(asApiError(err).message);
  }

  // A throttle or outage is retried (the run stays QUEUED); anything else, or
  // the last attempt, is final for that part.
  const canRetry = run.attempts < MAX_ATTEMPTS;
  const classify = (err: unknown) => {
    const e = asApiError(err);
    return e.retryable && canRetry
      ? { final: null, retry: e.message }
      : { final: e.message, retry: null };
  };
  let retryWhy: string | null = null;
  let dmSent = false;
  let replied = false;
  let conversation: object = {};

  if (wantsDm && !dmMessageId && !dmError) {
    const first = firstMessage(rule, run.id, run.commenterUsername);
    try {
      const res = await sendMessage(
        token,
        rule.account.externalId,
        isComment ? { comment_id: run.commentId } : { id: run.recipientId! },
        first.msg,
      );
      dmMessageId = res.messageId;
      dmSent = true;
      const delivered = first.stage === "DONE";
      conversation = {
        dmSentAt: new Date(),
        recipientId: res.recipientId ?? run.recipientId,
        stage: first.stage,
        ...(delivered ? { deliveredAt: new Date() } : {}),
        followUpAt: delivered ? null : followUpAt(rule, run.lastUserAt),
      };
    } catch (err) {
      ({ final: dmError, retry: retryWhy } = classify(err));
    }
  }

  if (wantsReply && !replyId && !replyError && !retryWhy) {
    if (wantsDm && dmError) {
      replyError = "Not posted, because the DM didn't go.";
    } else if (!wantsDm || dmMessageId) {
      const text = rule.replies[Math.floor(Math.random() * rule.replies.length)];
      try {
        replyId = await replyToComment(token, run.commentId, fill(text, run.commenterUsername));
        replied = true;
      } catch (err) {
        ({ final: replyError, retry: retryWhy } = classify(err));
      }
    }
  }

  if (dmSent || replied) {
    const delivered = dmSent && "deliveredAt" in conversation;
    await prisma.automationRule.update({
      where: { id: rule.id },
      data: {
        dmSentCount: { increment: dmSent ? 1 : 0 },
        deliveredCount: { increment: delivered ? 1 : 0 },
        replyCount: { increment: replied ? 1 : 0 },
      },
    });
  }

  if (retryWhy) {
    const wait = BACKOFF_MINUTES[Math.min(run.attempts, BACKOFF_MINUTES.length) - 1];
    await prisma.automationRun.update({
      where: { id: runId },
      data: {
        dmMessageId,
        dmError,
        replyId,
        replyError,
        lastError: retryWhy,
        nextAttemptAt: new Date(Date.now() + wait * 60 * 1000),
        ...conversation,
      },
    });
    return "QUEUED";
  }
  const status = settle({ wantsDm, wantsReply, dmMessageId, replyId });
  return finish(status, {
    ...conversation,
    // Nothing more will happen on a run whose DM failed or that has no DM.
    ...(!dmMessageId ? { stage: "DONE" } : {}),
  });
}

export interface PollResult {
  comments: number;
  matched: number;
  sent: number;
  error?: string;
}

/**
 * Reads the comments on the posts an account's rules watch and runs them
 * through ingestComments(). This is how automations work before Meta sends
 * webhooks, and it catches any webhook that never arrived after.
 */
export async function pollAccount(accountId: string): Promise<PollResult> {
  const account = await prisma.socialAccount.findUnique({
    where: { id: accountId },
    select: accountSelect,
  });
  if (!account) return { comments: 0, matched: 0, sent: 0, error: "Account not found." };
  const blocker = automationBlocker(account);
  if (blocker) return { comments: 0, matched: 0, sent: 0, error: blocker };

  await resolveScheduledPostRules(account.id);
  const rules = await prisma.automationRule.findMany({
    where: { accountId, enabled: true, trigger: "COMMENT" },
    select: { scope: true, mediaId: true },
  });
  if (!rules.length) return { comments: 0, matched: 0, sent: 0 };

  let error: string | undefined;
  const comments: IncomingComment[] = [];
  try {
    const token = await ensureFreshAccessToken(account);
    const mediaIds = new Set(
      rules.flatMap((r) => (r.scope === "ONE_POST" && r.mediaId ? [r.mediaId] : [])),
    );
    if (rules.some((r) => r.scope === "ANY_POST")) {
      for (const m of await listRecentMedia(token, ANY_POST_MEDIA)) mediaIds.add(m.id);
    }
    for (const mediaId of mediaIds) {
      try {
        const list = await listComments(token, mediaId);
        comments.push(...list.map((c) => commentFromApi(c, mediaId)));
      } catch (err) {
        // A deleted post shouldn't stop the others being checked.
        error ??= asApiError(err).message;
      }
    }
  } catch (err) {
    error = asApiError(err).message;
  }

  const result = await ingestComments(account, comments, "POLL");
  await prisma.socialAccount.update({
    where: { id: account.id },
    data: { commentsCheckedAt: new Date() },
  });
  return { comments: comments.length, ...result, error };
}

/**
 * Comments delivered by Meta's webhook, grouped by the Instagram account
 * (entry.id) they belong to.
 */
export async function handleWebhookComments(
  byAccount: Map<string, IncomingComment[]>,
): Promise<void> {
  // Each account is checked below (automationBlocker): launched, or unlocked early.
  if (!(await featureAvailableAnywhere("ig_automations"))) return;
  for (const [igUserId, comments] of byAccount) {
    // The same Instagram account can be connected to more than one client.
    const accounts = await prisma.socialAccount.findMany({
      where: {
        platform: "INSTAGRAM",
        externalId: igUserId,
        automationRules: { some: { enabled: true, trigger: "COMMENT" } },
      },
      select: accountSelect,
    });
    for (const account of accounts) {
      if (automationBlocker(account)) continue;
      try {
        await ingestComments(account, comments, "WEBHOOK");
      } catch (err) {
        console.error(`[automations] webhook for ${igUserId} failed:`, err);
      }
    }
  }
}
