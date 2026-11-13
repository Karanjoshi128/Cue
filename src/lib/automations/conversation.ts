import type { AutomationRule, AutomationRun, RunStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureFreshAccessToken } from "@/lib/tokens";
import { featureAvailableAnywhere } from "@/lib/plans";
import { findEmail, findPhone, matchesKeywords } from "./match";
import { getUserProfile, sendMessage, type OutgoingMessage } from "./instagram-api";
import {
  accountSelect,
  asApiError,
  automationBlocker,
  COPY,
  deliveryMessage,
  fill,
  followUpAt,
  MESSAGE_WINDOW_MS,
  runFromPayload,
  tapPayload,
  type AutomationAccount,
} from "./shared";
import { recordLead } from "./leads";
import { createRun, processRun } from "./engine";

/*
 * Everything after the first DM, driven by Instagram's message webhooks:
 *
 *   tap "Send me the link"  -> follow gate: follows? else "follow first"
 *                           -> question: "what's your email?"
 *                           -> the link
 *   reply to the question   -> checked, saved as a lead, then the link
 *   story reply / DM        -> a new run (STORY_REPLY / DM_KEYWORD rules)
 *
 * A tap or reply opens Instagram's 24-hour window, which is what allows each
 * next message and the one follow-up. These events only arrive by webhook,
 * so none of this runs until Meta delivers message webhooks (app Live).
 */

export interface IncomingMessage {
  igUserId: string; // the business account (entry.id)
  senderId: string; // the person's Instagram-scoped id
  mid: string;
  text: string | null;
  payload: string | null; // set for a button tap
  storyId: string | null; // set when it's a reply to a story
  isEcho: boolean;
  at: Date;
}

type RunWithRule = AutomationRun & { rule: AutomationRule };

const WAITING: RunStage[] = ["WAIT_TAP", "WAIT_FOLLOW", "WAIT_ANSWER"];

/** Sends one message in an open window, recording a failure on the run. */
async function say(
  account: AutomationAccount,
  run: RunWithRule,
  token: string,
  msg: OutgoingMessage,
): Promise<boolean> {
  try {
    await sendMessage(token, account.externalId, { id: run.recipientId! }, msg);
    return true;
  } catch (err) {
    await prisma.automationRun.update({
      where: { id: run.id },
      data: { lastError: asApiError(err).message },
    });
    return false;
  }
}

/** Sends the link and closes the conversation. */
async function deliver(account: AutomationAccount, run: RunWithRule, token: string) {
  if (!(await say(account, run, token, deliveryMessage(run.rule, run.commenterUsername)))) return;
  await prisma.automationRun.update({
    where: { id: run.id },
    data: { stage: "DONE", deliveredAt: new Date(), followUpAt: null, lastError: null },
  });
  await prisma.automationRule.update({
    where: { id: run.rule.id },
    data: { deliveredCount: { increment: 1 } },
  });
}

/** Moves a run to a waiting stage, with its follow-up timed from now. */
async function waitFor(run: RunWithRule, stage: RunStage) {
  await prisma.automationRun.update({
    where: { id: run.id },
    data: { stage, followUpAt: followUpAt(run.rule, new Date()), followUpSentAt: null, lastError: null },
  });
}

/**
 * They tapped "Send me the link" (or replied to it, if Instagram refused the
 * button). Checks the follow gate, then asks the question or sends the link.
 */
async function onTap(account: AutomationAccount, run: RunWithRule, senderId: string) {
  if (run.recipientId && run.recipientId !== senderId) return;
  const now = new Date();
  await prisma.automationRun.update({
    where: { id: run.id },
    data: { recipientId: senderId, lastUserAt: now },
  });
  run = { ...run, recipientId: senderId, lastUserAt: now };
  const token = await ensureFreshAccessToken(account);

  if (run.stage === "DONE") {
    // Tapped again after getting it: send it again, it's harmless.
    if (run.deliveredAt) await say(account, run, token, deliveryMessage(run.rule, run.commenterUsername));
    return;
  }
  if (run.stage === "WAIT_ANSWER") {
    await say(account, run, token, { text: fill(run.rule.askText || COPY.ask[run.rule.collect ?? "EMAIL"], run.commenterUsername) });
    return;
  }

  if (run.rule.followGate) {
    let follows: boolean | null = null;
    try {
      const profile = await getUserProfile(token, senderId);
      follows = profile.follows;
      if (profile.username && profile.username !== run.commenterUsername) {
        await prisma.automationRun.update({
          where: { id: run.id },
          data: { commenterUsername: profile.username },
        });
        run = { ...run, commenterUsername: profile.username };
      }
    } catch (err) {
      // If Instagram won't say, let them through rather than lock them out.
      console.error("[automations] follow check failed:", asApiError(err).message);
    }
    if (follows === false) {
      const text = fill(COPY.notFollowing, run.commenterUsername).replace("{handle}", account.displayName);
      const tap = { label: COPY.tapLabel, payload: tapPayload(run.id) };
      if (await say(account, run, token, { text, tap })) await waitFor(run, "WAIT_FOLLOW");
      return;
    }
  }

  if (run.rule.collect) {
    if (await say(account, run, token, { text: fill(run.rule.askText || COPY.ask[run.rule.collect], run.commenterUsername) })) {
      await waitFor(run, "WAIT_ANSWER");
    }
    return;
  }
  await deliver(account, run, token);
}

/** They replied to the email or phone question. */
async function onAnswer(account: AutomationAccount, run: RunWithRule, text: string, senderId: string) {
  const field = run.rule.collect ?? "EMAIL";
  const value = field === "EMAIL" ? findEmail(text) : findPhone(text);
  await prisma.automationRun.update({
    where: { id: run.id },
    data: { lastUserAt: new Date() },
  });
  run = { ...run, lastUserAt: new Date() };
  const token = await ensureFreshAccessToken(account);
  if (!value) {
    if (await say(account, run, token, { text: COPY.invalid[field] })) await waitFor(run, "WAIT_ANSWER");
    return;
  }
  await recordLead({
    clientId: account.clientId,
    accountId: account.id,
    igsid: senderId,
    username: run.commenterUsername,
    source: run.trigger,
    ruleName: run.rule.name,
    ...(field === "EMAIL" ? { email: value } : { phone: value }),
  });
  await prisma.automationRule.update({
    where: { id: run.rule.id },
    data: { leadCount: { increment: 1 } },
  });
  await deliver(account, run, token);
}

/** A story reply or DM that may start a STORY_REPLY or DM_KEYWORD rule. */
async function triggerFromMessage(account: AutomationAccount, ev: IncomingMessage) {
  const trigger = ev.storyId ? "STORY_REPLY" : "DM_KEYWORD";
  const rules = await prisma.automationRule.findMany({
    where: { accountId: account.id, enabled: true, trigger },
    orderBy: { createdAt: "asc" },
  });
  const text = ev.text ?? "";
  const rule = rules.find(
    (r) =>
      r.activeSince <= ev.at &&
      (r.matchMode === "ANY_COMMENT" || matchesKeywords(text, r.keywords, r.matchMode, r.fuzzy)),
  );
  if (!rule) return;

  let username: string | null = null;
  try {
    username = (await getUserProfile(await ensureFreshAccessToken(account), ev.senderId)).username;
  } catch {
    // The username is only for {username} and the leads list.
  }
  const runId = await createRun({
    account,
    rule,
    eventId: ev.mid,
    mediaId: ev.storyId,
    commenterId: ev.senderId,
    username,
    text: text || (ev.storyId ? "(replied to a story)" : ""),
    at: ev.at,
    source: "WEBHOOK",
    recipientId: ev.senderId,
  });
  if (runId) await processRun(runId);
}

async function handleOne(account: AutomationAccount, ev: IncomingMessage) {
  const tapped = runFromPayload(ev.payload);
  if (tapped) {
    const run = await prisma.automationRun.findUnique({ where: { id: tapped }, include: { rule: true } });
    if (run && run.rule.accountId === account.id) await onTap(account, run, ev.senderId);
    return;
  }
  // A conversation already waiting on this person takes the message first.
  const waiting = await prisma.automationRun.findFirst({
    where: {
      recipientId: ev.senderId,
      stage: { in: WAITING },
      rule: { accountId: account.id },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { updatedAt: "desc" },
    include: { rule: true },
  });
  if (waiting && ev.text) {
    if (waiting.stage === "WAIT_ANSWER") await onAnswer(account, waiting, ev.text, ev.senderId);
    else await onTap(account, waiting, ev.senderId); // a reply counts as the tap
    return;
  }
  if (ev.text || ev.storyId) await triggerFromMessage(account, ev);
}

/** Message and button-tap webhooks, as parsed by webhook.ts. */
export async function handleIncomingMessages(events: IncomingMessage[]): Promise<void> {
  // Each account is checked below (automationBlocker): launched, or unlocked early.
  if (!(await featureAvailableAnywhere("ig_automations"))) return;
  for (const ev of events) {
    // Echoes are the account's own messages, Cue's included.
    if (ev.isEcho || ev.senderId === ev.igUserId) continue;
    const accounts = await prisma.socialAccount.findMany({
      where: { platform: "INSTAGRAM", externalId: ev.igUserId, automationRules: { some: { enabled: true } } },
      select: accountSelect,
    });
    for (const account of accounts) {
      if (automationBlocker(account)) continue;
      try {
        await handleOne(account, ev);
      } catch (err) {
        console.error(`[automations] message for ${ev.igUserId} failed:`, err);
      }
    }
  }
}

/**
 * The one nudge a waiting run gets, while Instagram's window is still open.
 * Returns how many were sent.
 */
export async function sendFollowUps(limit = 50): Promise<number> {
  const now = new Date();
  const due = await prisma.automationRun.findMany({
    where: {
      stage: { in: WAITING },
      followUpAt: { lte: now },
      followUpSentAt: null,
      lastUserAt: { gte: new Date(now.getTime() - MESSAGE_WINDOW_MS) },
      rule: { enabled: true, followUpText: { not: null } },
    },
    include: { rule: { include: { account: { select: accountSelect } } } },
    orderBy: { followUpAt: "asc" },
    take: limit,
  });
  let sent = 0;
  for (const run of due) {
    const account = run.rule.account;
    if (automationBlocker(account) || !run.recipientId) continue;
    // Mark first, so a slow send can't be picked up twice.
    const claim = await prisma.automationRun.updateMany({
      where: { id: run.id, followUpSentAt: null },
      data: { followUpSentAt: now },
    });
    if (!claim.count) continue;
    const text = fill(run.rule.followUpText!, run.commenterUsername);
    const msg: OutgoingMessage =
      run.stage === "WAIT_ANSWER"
        ? { text }
        : { text, tap: { label: COPY.tapLabel, payload: tapPayload(run.id) } };
    try {
      await sendMessage(await ensureFreshAccessToken(account), account.externalId, { id: run.recipientId }, msg);
      sent++;
    } catch (err) {
      await prisma.automationRun.update({
        where: { id: run.id },
        data: { lastError: `Follow-up failed: ${asApiError(err).message}` },
      });
    }
  }
  return sent;
}
