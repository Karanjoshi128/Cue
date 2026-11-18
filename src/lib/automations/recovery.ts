import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { ensureFreshAccessToken } from "@/lib/tokens";
import { isPublishingPaused } from "@/lib/platform-settings";
import { accountSelect, automationBlocker } from "./shared";
import { listComments, listRecentMedia } from "./instagram-api";
import { campaignActive, ruleMatch } from "./settings";
import { commentFromApi, createRun } from "./engine";
import { PRIVATE_REPLY_WINDOW_MS } from "./config";

/** Re-fetch at confirmation: a preview is never authority to send arbitrary comment IDs. */
export async function recoverableComments(workspaceId: string, ruleId: string, mediaId: string) {
  const rule = await prisma.automationRule.findFirst({ where: { id: ruleId, client: { workspaceId } }, include: { account: { select: accountSelect } } });
  if (!rule) throw new ApiError(404, "Automation not found.");
  const blocker = automationBlocker(rule.account);
  if (blocker) throw new ApiError(403, blocker);
  if (await isPublishingPaused()) throw new ApiError(409, "Sending is currently paused.");
  if (rule.trigger !== "COMMENT" || !campaignActive(rule)) throw new ApiError(400, "Choose an active comment automation.");
  if (rule.scope === "ONE_POST" && rule.mediaId !== mediaId) throw new ApiError(400, "Choose the post watched by this automation. A future post must publish first.");
  const token = await ensureFreshAccessToken(rule.account);
  // This ownership check deliberately bounds recovery to the 60 newest posts.
  const media = (await listRecentMedia(token, 60)).find((m) => m.id === mediaId);
  if (!media || media.media_product_type === "STORY") throw new ApiError(400, "Choose one of this account's recent feed posts or Reels.");
  const now = Date.now();
  const handle = rule.account.displayName.replace(/^@/, "").toLowerCase();
  const comments = (await listComments(token, mediaId, 1)).slice(0, 50).filter((c) => !!c.timestamp).map((c) => commentFromApi(c, mediaId)).filter((c) =>
    c.text.trim() && c.fromId && !c.parentId && c.fromId !== rule.account.externalId && c.fromUsername?.toLowerCase() !== handle &&
    c.timestamp.getTime() > now - PRIVATE_REPLY_WINDOW_MS && c.timestamp.getTime() <= now && campaignActive(rule, c.timestamp) && ruleMatch(c.text, rule).matched,
  );
  const known = new Set((await prisma.automationRun.findMany({ where: { commentId: { in: comments.map((c) => c.id) } }, select: { commentId: true } })).map((r) => r.commentId));
  return { rule, comments: comments.filter((c) => !known.has(c.id)) };
}

export async function queueRecoveredComments(workspaceId: string, ruleId: string, mediaId: string, ids: string[]) {
  const { rule, comments } = await recoverableComments(workspaceId, ruleId, mediaId);
  let queued = 0;
  let checked = 0;
  for (const c of comments.filter((c) => ids.includes(c.id))) {
    const run = await createRun({ account: rule.account, rule, eventId: c.id, mediaId, commenterId: c.fromId!, username: c.fromUsername, text: c.text, at: c.timestamp, source: "POLL" });
    checked++;
    if (run) queued++;
  }
  return { checked, queued };
}
