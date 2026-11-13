import { Prisma, type AutomationRule, type RunStage } from "@prisma/client";
import { featureAvailable, hasFeature } from "@/lib/plans";
import { COPY, hasAutomationScopes } from "./config";
import { InstagramApiError, type OutgoingMessage } from "./instagram-api";

// Pieces the comment engine (engine.ts) and the conversation after the first
// DM (conversation.ts) both use.

export const accountSelect = {
  id: true,
  clientId: true,
  platform: true,
  externalId: true,
  displayName: true,
  scopes: true,
  accessToken: true,
  refreshToken: true,
  tokenExpires: true,
  client: {
    select: {
      workspace: { select: { id: true, suspendedAt: true, disabledFeatures: true, earlyFeatures: true } },
    },
  },
} satisfies Prisma.SocialAccountSelect;

export type AutomationAccount = Prisma.SocialAccountGetPayload<{
  select: typeof accountSelect;
}>;

/** Null when the account may run automations, otherwise why not. */
export function automationBlocker(account: AutomationAccount): string | null {
  const ws = account.client.workspace;
  if (account.platform !== "INSTAGRAM") return "Not an Instagram account.";
  if (ws.suspendedAt) return "The workspace is suspended.";
  // Launched, or unlocked early for this workspace (Admin → Users).
  if (!featureAvailable(ws, "ig_automations")) return "Instagram automations aren't available yet.";
  if (!hasFeature(ws, "instagram") || !hasFeature(ws, "ig_automations")) {
    return "Instagram automations are switched off for this workspace.";
  }
  if (!hasAutomationScopes(account.scopes)) {
    return "Reconnect this Instagram account and allow comment and message access.";
  }
  return null;
}

export function asApiError(err: unknown): InstagramApiError {
  if (err instanceof InstagramApiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new InstagramApiError(message.slice(0, 400), 0, false);
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

/** Fills {username} the way the editor's preview does. */
export function fill(template: string, username: string | null): string {
  return template.replaceAll("{username}", username ? `@${username}` : "there");
}

/** Instagram opens a 24-hour window after a person's message or tap. */
export const MESSAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

export { COPY };

/** The payload on a "Send me the link" button: which run it continues. */
export const tapPayload = (runId: string) => `cue:tap:${runId}`;
export function runFromPayload(payload: string | null | undefined): string | null {
  return payload?.startsWith("cue:tap:") ? payload.slice("cue:tap:".length) : null;
}

/**
 * The DM that carries the link. Its wording rotates through dmText and the
 * variants, moving on every `rotateEvery` deliveries, so Instagram doesn't see
 * the same message thousands of times.
 */
export function deliveryText(
  rule: Pick<AutomationRule, "dmText" | "dmVariants" | "rotateEvery" | "deliveredCount">,
): string {
  const all = [rule.dmText ?? "", ...rule.dmVariants].filter((t) => t.trim());
  if (!all.length) return "";
  const step = Math.max(1, rule.rotateEvery);
  return all[Math.floor(rule.deliveredCount / step) % all.length];
}

type MessageRule = Pick<
  AutomationRule,
  | "dmText"
  | "dmVariants"
  | "rotateEvery"
  | "deliveredCount"
  | "dmButtonLabel"
  | "dmButtonUrl"
  | "followGate"
  | "gateText"
  | "collect"
  | "askText"
>;

/** The DM with the link (and its button, when the rule has one). */
export function deliveryMessage(rule: MessageRule, username: string | null): OutgoingMessage {
  const text = fill(deliveryText(rule), username);
  return rule.dmButtonLabel && rule.dmButtonUrl
    ? { text, link: { label: rule.dmButtonLabel, url: rule.dmButtonUrl } }
    : { text };
}

/** The "Send me the link" message the follow gate starts with. */
export function gateMessage(rule: MessageRule, runId: string, username: string | null): OutgoingMessage {
  return {
    text: fill(rule.gateText || COPY.gate, username),
    tap: { label: COPY.tapLabel, payload: tapPayload(runId) },
  };
}

/**
 * The first DM and the stage it leaves the run at: the follow gate's tap
 * button, else the question, else the link itself.
 */
export function firstMessage(
  rule: MessageRule,
  runId: string,
  username: string | null,
): { msg: OutgoingMessage; stage: RunStage } {
  if (rule.followGate) return { msg: gateMessage(rule, runId, username), stage: "WAIT_TAP" };
  if (rule.collect) {
    return { msg: { text: fill(rule.askText || COPY.ask[rule.collect], username) }, stage: "WAIT_ANSWER" };
  }
  return { msg: deliveryMessage(rule, username), stage: "DONE" };
}

/**
 * When to send the follow-up for a run that's waiting: after the rule's delay,
 * but inside the 24-hour window that opened at `lastUserAt`. Null when the
 * window isn't open (nobody has tapped or replied yet) or there's no nudge.
 */
export function followUpAt(
  rule: Pick<AutomationRule, "followUpText" | "followUpMinutes">,
  lastUserAt: Date | null,
): Date | null {
  if (!rule.followUpText || !lastUserAt) return null;
  const at = Date.now() + Math.max(1, rule.followUpMinutes) * 60_000;
  const closes = lastUserAt.getTime() + MESSAGE_WINDOW_MS - 30 * 60_000;
  return at < closes ? new Date(at) : null;
}
