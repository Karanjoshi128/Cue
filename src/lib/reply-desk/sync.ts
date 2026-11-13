import type { Platform, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureFreshAccessToken } from "@/lib/tokens";
import { hasFeature } from "@/lib/plans";
import { IG_COMMENT_SCOPE } from "@/lib/automations/config";
import { listComments, listRecentMedia } from "@/lib/automations/instagram-api";
import { aiEnabled, classifyComments } from "@/lib/ai";
import { classifyComment } from "./classify";
import { listChannelComments, myChannelId, videoTitles } from "./youtube";

/*
 * Fills the Reply Desk: reads recent comments on clients' Instagram and
 * YouTube accounts that were connected with comment access, and stores new
 * ones (InboxComment). Instagram is read every run; YouTube only every
 * YOUTUBE_EVERY_MIN, because each read spends daily quota uploads need too.
 */

export const YT_COMMENT_SCOPE = "youtube.force-ssl";
const YOUTUBE_EVERY_MIN = Number(process.env.REPLY_DESK_YT_MINUTES) || 30;
const IG_POSTS = 10; // newest posts read per Instagram account
const KEEP_DAYS = 30;
const AI_SORT_MAX = 40; // new comments sorted by Claude per account per run

/** Whether an account was connected with the access the Reply Desk needs. */
export function canReadComments(platform: Platform, scopes: string | null): boolean {
  if (platform === "INSTAGRAM") return !!scopes?.includes(IG_COMMENT_SCOPE);
  if (platform === "YOUTUBE") return !!scopes?.includes(YT_COMMENT_SCOPE);
  return false;
}

const accountSelect = {
  id: true,
  clientId: true,
  platform: true,
  externalId: true,
  displayName: true,
  scopes: true,
  accessToken: true,
  refreshToken: true,
  tokenExpires: true,
  inboxSyncedAt: true,
  client: { select: { workspace: { select: { suspendedAt: true, disabledFeatures: true } } } },
} satisfies Prisma.SocialAccountSelect;
type DeskAccount = Prisma.SocialAccountGetPayload<{ select: typeof accountSelect }>;

type NewComment = Omit<Prisma.InboxCommentCreateManyInput, "accountId" | "clientId" | "platform" | "kind">;

async function readInstagram(account: DeskAccount, token: string): Promise<NewComment[]> {
  const handle = account.displayName.replace(/^@/, "").toLowerCase();
  const out: NewComment[] = [];
  for (const m of await listRecentMedia(token, IG_POSTS)) {
    for (const c of await listComments(token, m.id, 1)) {
      const author = c.from?.username ?? c.username ?? null;
      if (!c.text || c.from?.id === account.externalId || author?.toLowerCase() === handle) continue;
      out.push({
        externalId: c.id,
        mediaId: m.id,
        mediaTitle: m.caption?.slice(0, 120) ?? null,
        mediaUrl: m.permalink ?? null,
        author,
        authorId: c.from?.id ?? null,
        text: c.text,
        postedAt: c.timestamp ? new Date(c.timestamp) : new Date(),
      });
    }
  }
  return out;
}

async function readYouTube(token: string): Promise<NewComment[]> {
  const channelId = await myChannelId(token);
  if (!channelId) return [];
  const comments = (await listChannelComments(token, channelId)).filter(
    (c) => c.authorChannelId !== channelId,
  );
  const titles = await videoTitles(token, [...new Set(comments.map((c) => c.videoId))]);
  return comments.map((c) => ({
    externalId: c.id,
    mediaId: c.videoId,
    mediaTitle: titles.get(c.videoId)?.slice(0, 120) ?? null,
    mediaUrl: `https://www.youtube.com/watch?v=${c.videoId}&lc=${c.id}`,
    author: c.author,
    authorId: c.authorChannelId,
    text: c.text,
    postedAt: new Date(c.publishedAt),
  }));
}

/**
 * Claude's sorting for new comments, when AI helpers are on for the workspace:
 * it catches questions and abuse Cue's own rules miss. Emoji-only and
 * tag-only comments are noise either way and aren't sent. On any failure the
 * rules decide.
 */
async function sortWithAi(account: DeskAccount, comments: NewComment[]) {
  const ws = account.client.workspace;
  if (!aiEnabled() || !hasFeature(ws, "ai")) return new Map<string, Prisma.InboxCommentCreateManyInput["kind"]>();
  const worth = comments
    .filter((c) => classifyComment(c.text) !== "NOISE")
    .slice(0, AI_SORT_MAX)
    .map((c) => ({ id: c.externalId, text: c.text }));
  try {
    return await classifyComments(worth);
  } catch (e) {
    console.error(`[reply-desk] AI sorting skipped for ${account.id}:`, e instanceof Error ? e.message : e);
    return new Map();
  }
}

/** Reads one account's new comments into the desk. Returns how many were new. */
export async function syncAccount(account: DeskAccount): Promise<number> {
  const token = await ensureFreshAccessToken(account);
  const found = account.platform === "INSTAGRAM" ? await readInstagram(account, token) : await readYouTube(token);
  const oldest = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const fresh = found.filter((c) => new Date(c.postedAt).getTime() > oldest);
  // Only comments not stored yet, so each is sorted (and paid for) once.
  const known = new Set(
    (
      await prisma.inboxComment.findMany({
        where: { platform: account.platform, externalId: { in: fresh.map((c) => c.externalId) } },
        select: { externalId: true },
      })
    ).map((r) => r.externalId),
  );
  const incoming = fresh.filter((c) => !known.has(c.externalId));
  const sorted = await sortWithAi(account, incoming);
  const { count } = await prisma.inboxComment.createMany({
    data: incoming.map((c) => ({
      ...c,
      accountId: account.id,
      clientId: account.clientId,
      platform: account.platform,
      kind: sorted.get(c.externalId) ?? classifyComment(c.text),
    })),
    skipDuplicates: true,
  });
  await prisma.socialAccount.update({ where: { id: account.id }, data: { inboxSyncedAt: new Date() } });
  return count;
}

function due(account: DeskAccount, now = Date.now()): boolean {
  if (!account.inboxSyncedAt) return true;
  const every = account.platform === "YOUTUBE" ? YOUTUBE_EVERY_MIN : 4;
  return now - account.inboxSyncedAt.getTime() >= every * 60 * 1000;
}

function allowed(account: DeskAccount): boolean {
  const ws = account.client.workspace;
  return !ws.suspendedAt && hasFeature(ws, "reply_desk") && canReadComments(account.platform, account.scopes);
}

/**
 * The cron's sync: every eligible, due account, until `budgetMs` is used, then
 * deletes comments older than 30 days. `workspaceId` limits it to one
 * workspace (the page's Refresh), which also ignores the YouTube spacing.
 */
export async function syncReplyDesk(opts: { budgetMs?: number; workspaceId?: string } = {}) {
  const started = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const accounts = await prisma.socialAccount.findMany({
    where: {
      platform: { in: ["INSTAGRAM", "YOUTUBE"] },
      ...(opts.workspaceId ? { client: { workspaceId: opts.workspaceId } } : {}),
    },
    select: accountSelect,
    orderBy: { inboxSyncedAt: { sort: "asc", nulls: "first" } },
  });
  const summary = { accounts: 0, added: 0, errors: [] as string[] };
  for (const account of accounts) {
    if (Date.now() - started > budget) break;
    if (!allowed(account)) continue;
    if (!opts.workspaceId && !due(account)) continue;
    summary.accounts++;
    try {
      summary.added += await syncAccount(account);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${account.displayName}: ${why}`.slice(0, 200));
    }
  }
  if (!opts.workspaceId) {
    await prisma.inboxComment.deleteMany({
      where: { postedAt: { lt: new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000) } },
    });
  }
  return summary;
}
