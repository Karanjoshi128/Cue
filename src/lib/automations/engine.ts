import {
  Prisma,
  type AutomationRunStatus,
  type AutomationSource,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureFreshAccessToken } from "@/lib/tokens";
import { isPublishingPaused } from "@/lib/platform-settings";
import { hasFeature } from "@/lib/plans";
import {
  automationsEnabled,
  hasAutomationScopes,
  PRIVATE_REPLY_WINDOW_MS,
  RUN_RETENTION_DAYS,
} from "./config";
import { matchesKeywords } from "./match";
import {
  InstagramApiError,
  listComments,
  listRecentMedia,
  replyToComment,
  sendPrivateReply,
  type InstagramComment,
} from "./instagram-api";

/*
 * Instagram comment automations. A comment reaches ingestComments() from a
 * webhook (instant, once Meta grants Advanced Access) or from pollAccount()
 * (the every-minute check, which is all that works in Development mode, and
 * a safety net after). Either way it becomes at most one AutomationRun, which
 * processRun() sends: the DM first, then the public reply, because a reply
 * saying "check your DMs" is wrong when the DM didn't go.
 */

const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [2, 5, 15, 60];
// Taking a run reserves it this long, so a second worker skips it.
const LEASE_MS = 5 * 60 * 1000;
// "Any post" rules watch this many of the account's newest posts when polling.
// Webhooks cover every post.
const ANY_POST_MEDIA = 10;

export interface IncomingComment {
  id: string;
  text: string;
  mediaId: string;
  fromId: string | null;
  fromUsername: string | null;
  parentId: string | null;
  timestamp: Date;
}

const accountSelect = {
  id: true,
  platform: true,
  externalId: true,
  displayName: true,
  scopes: true,
  accessToken: true,
  refreshToken: true,
  tokenExpires: true,
  client: {
    select: {
      workspace: { select: { suspendedAt: true, disabledFeatures: true } },
    },
  },
} satisfies Prisma.SocialAccountSelect;

type AutomationAccount = Prisma.SocialAccountGetPayload<{
  select: typeof accountSelect;
}>;

/** Null when the account may run automations, otherwise why not. */
export function automationBlocker(account: AutomationAccount): string | null {
  const ws = account.client.workspace;
  if (account.platform !== "INSTAGRAM") return "Not an Instagram account.";
  if (ws.suspendedAt) return "The workspace is suspended.";
  if (!hasFeature(ws, "instagram") || !hasFeature(ws, "ig_automations")) {
    return "Instagram automations are switched off for this workspace.";
  }
  if (!hasAutomationScopes(account.scopes)) {
    return "Reconnect this Instagram account and allow comment and message access.";
  }
  return null;
}

function asApiError(err: unknown): InstagramApiError {
  if (err instanceof InstagramApiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new InstagramApiError(message.slice(0, 400), 0, false);
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

function fill(template: string, username: string | null): string {
  return template.replaceAll("{username}", username ? `@${username}` : "there");
}

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
    where: { accountId: account.id, enabled: true },
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
        matchesKeywords(c.text, r.keywords, r.matchMode),
    );
    if (!rule) continue;

    const commenterId =
      c.fromId ?? (c.fromUsername ? `@${c.fromUsername}` : `comment:${c.id}`);
    const repeat =
      rule.oncePerPerson &&
      (await prisma.automationRun.count({
        where: {
          ruleId: rule.id,
          commenterId,
          status: { in: ["QUEUED", "SENT", "PARTIAL"] },
        },
      })) > 0;

    let runId: string;
    try {
      const run = await prisma.automationRun.create({
        data: {
          ruleId: rule.id,
          commentId: c.id,
          mediaId: c.mediaId,
          commenterId,
          commenterUsername: c.fromUsername,
          commentText: c.text.slice(0, 2200),
          commentedAt: c.timestamp,
          source,
          status: repeat ? "SKIPPED" : "QUEUED",
        },
        select: { id: true },
      });
      runId = run.id;
    } catch (err) {
      // The webhook and the poll saw the same comment at the same moment.
      if (isUniqueViolation(err)) continue;
      throw err;
    }

    matched++;
    await prisma.automationRule.update({
      where: { id: rule.id },
      data: { matchedCount: { increment: 1 }, lastTriggeredAt: new Date() },
    });
    if (!repeat) queued.push(runId);
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

/**
 * Sends one queued run. Returns its new status, or null when another worker
 * holds it or it isn't due. Never throws for Instagram's errors: they're
 * recorded on the run.
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
  const wantsDm = !!rule.dmText;
  const wantsReply = rule.replies.length > 0;

  let { dmMessageId, dmError, replyId, replyError } = run;
  const finish = async (status: AutomationRunStatus) => {
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
      },
    });
    return status;
  };
  const giveUp = (why: string) => {
    if (wantsDm && !dmMessageId && !dmError) dmError = why;
    if (wantsReply && !replyId && !replyError) replyError = why;
    return finish(settle({ wantsDm, wantsReply, dmMessageId, replyId }));
  };

  if (!rule.enabled) return giveUp("The automation was switched off before this went out.");
  const blocker = automationBlocker(rule.account);
  if (blocker) return giveUp(blocker);
  if (now.getTime() - run.commentedAt.getTime() > PRIVATE_REPLY_WINDOW_MS) {
    return giveUp("Missed Instagram's 7-day window for replying to this comment.");
  }
  if (await isPublishingPaused()) {
    // Not an attempt: give it back and try again shortly.
    await prisma.automationRun.update({
      where: { id: runId },
      data: {
        attempts: { decrement: 1 },
        nextAttemptAt: new Date(now.getTime() + 5 * 60 * 1000),
        lastError: "Publishing is paused across Cue. This goes out when it resumes.",
      },
    });
    return "QUEUED";
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

  if (wantsDm && !dmMessageId && !dmError) {
    const button =
      rule.dmButtonLabel && rule.dmButtonUrl
        ? { label: rule.dmButtonLabel, url: rule.dmButtonUrl }
        : null;
    try {
      dmMessageId = await sendPrivateReply(
        token,
        rule.account.externalId,
        run.commentId,
        fill(rule.dmText!, run.commenterUsername),
        button,
      );
      dmSent = true;
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
        replyId = await replyToComment(
          token,
          run.commentId,
          fill(text, run.commenterUsername),
        );
        replied = true;
      } catch (err) {
        ({ final: replyError, retry: retryWhy } = classify(err));
      }
    }
  }

  if (dmSent || replied) {
    await prisma.automationRule.update({
      where: { id: rule.id },
      data: {
        dmSentCount: { increment: dmSent ? 1 : 0 },
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
      },
    });
    return "QUEUED";
  }
  return finish(settle({ wantsDm, wantsReply, dmMessageId, replyId }));
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
    where: { accountId, enabled: true },
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
  if (!automationsEnabled()) return;
  for (const [igUserId, comments] of byAccount) {
    // The same Instagram account can be connected to more than one client.
    const accounts = await prisma.socialAccount.findMany({
      where: {
        platform: "INSTAGRAM",
        externalId: igUserId,
        automationRules: { some: { enabled: true } },
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

/**
 * The every-minute job: check comments on every account with a live rule,
 * send anything queued or due for a retry, and delete activity older than
 * RUN_RETENTION_DAYS. Stops starting new work once `budgetMs` is used.
 */
export async function runAutomations(budgetMs = 45_000) {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const summary = {
    accounts: 0,
    polled: 0,
    matched: 0,
    sent: 0,
    retried: 0,
    purged: 0,
    errors: 0,
  };
  if (!automationsEnabled()) return { ...summary, skipped: true };

  const accounts = await prisma.socialAccount.findMany({
    where: { platform: "INSTAGRAM", automationRules: { some: { enabled: true } } },
    select: { id: true },
    orderBy: { commentsCheckedAt: { sort: "asc", nulls: "first" } },
  });
  summary.accounts = accounts.length;
  for (const { id } of accounts) {
    if (elapsed() > budgetMs * 0.6) break;
    try {
      const r = await pollAccount(id);
      summary.polled++;
      summary.matched += r.matched;
      summary.sent += r.sent;
      if (r.error) summary.errors++;
    } catch (err) {
      summary.errors++;
      console.error(`[automations] poll of account ${id} failed:`, err);
    }
  }

  // Retries, and runs a webhook queued but couldn't finish (give those a
  // minute, in case the webhook's own send is still in flight).
  const due = await prisma.automationRun.findMany({
    where: {
      status: "QUEUED",
      OR: [
        { nextAttemptAt: { lte: new Date() } },
        { nextAttemptAt: null, createdAt: { lt: new Date(Date.now() - 60_000) } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  for (const { id } of due) {
    if (elapsed() > budgetMs) break;
    const status = await processRun(id);
    if (status) summary.retried++;
    if (status === "SENT" || status === "PARTIAL") summary.sent++;
  }

  const purged = await prisma.automationRun.deleteMany({
    where: {
      createdAt: { lt: new Date(Date.now() - RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000) },
    },
  });
  summary.purged = purged.count;
  return summary;
}
