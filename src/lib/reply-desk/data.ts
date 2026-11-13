import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceId } from "@/lib/auth";
import { hasFeature } from "@/lib/plans";
import { aiEnabled } from "@/lib/ai";
import { canReadComments } from "./sync";
import type { DeskFilter } from "./config";

// The Reply Desk page, self-scoped to the caller's workspace.

const WHERE: Record<DeskFilter, Prisma.InboxCommentWhereInput> = {
  questions: { state: "OPEN", kind: "QUESTION" },
  open: { state: "OPEN", kind: { in: ["QUESTION", "OTHER"] } },
  noise: { state: "OPEN", kind: { in: ["NOISE", "ABUSE"] } },
  replied: { state: "REPLIED" },
  done: { state: "DONE" },
};

export async function getReplyDeskPage(filter: DeskFilter, clientId?: string) {
  const workspaceId = await requireWorkspaceId();
  const inScope: Prisma.InboxCommentWhereInput = {
    account: { client: { workspaceId } },
    ...(clientId ? { clientId } : {}),
  };

  const [workspace, accounts, comments, groups] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { disabledFeatures: true } }),
    prisma.socialAccount.findMany({
      where: {
        platform: { in: ["INSTAGRAM", "YOUTUBE"] },
        client: { workspaceId, ...(clientId ? { id: clientId } : {}) },
      },
      select: {
        id: true,
        clientId: true,
        platform: true,
        displayName: true,
        scopes: true,
        inboxSyncedAt: true,
        client: { select: { name: true, color: true } },
      },
      orderBy: [{ client: { name: "asc" } }, { platform: "asc" }],
    }),
    prisma.inboxComment.findMany({
      where: { ...inScope, ...WHERE[filter] },
      orderBy: { postedAt: "desc" },
      take: 100,
      include: {
        account: { select: { displayName: true, client: { select: { name: true, color: true } } } },
      },
    }),
    prisma.inboxComment.groupBy({
      by: ["state", "kind"],
      where: inScope,
      _count: { _all: true },
    }),
  ]);

  const count = (where: Prisma.InboxCommentWhereInput) =>
    groups
      .filter((g) => {
        const st = where.state as string | undefined;
        const kind = where.kind as string | { in: string[] } | undefined;
        if (st && g.state !== st) return false;
        if (typeof kind === "string" && g.kind !== kind) return false;
        if (kind && typeof kind === "object" && !kind.in.includes(g.kind)) return false;
        return true;
      })
      .reduce((n, g) => n + g._count._all, 0);

  return {
    featureOn: !!workspace && hasFeature(workspace, "reply_desk"),
    aiOn: aiEnabled() && !!workspace && hasFeature(workspace, "ai"),
    counts: Object.fromEntries(
      (Object.keys(WHERE) as DeskFilter[]).map((f) => [f, count(WHERE[f])]),
    ) as Record<DeskFilter, number>,
    accounts: accounts.map((a) => ({
      id: a.id,
      clientId: a.clientId,
      clientName: a.client.name,
      clientColor: a.client.color,
      platform: a.platform,
      displayName: a.displayName,
      ready: canReadComments(a.platform, a.scopes),
      syncedAt: a.inboxSyncedAt?.toISOString() ?? null,
    })),
    comments: comments.map((c) => ({
      id: c.id,
      platform: c.platform,
      clientName: c.account.client.name,
      clientColor: c.account.client.color,
      accountName: c.account.displayName,
      author: c.author,
      text: c.text,
      kind: c.kind,
      state: c.state,
      mediaTitle: c.mediaTitle,
      mediaUrl: c.mediaUrl,
      postedAt: c.postedAt.toISOString(),
      replyText: c.replyText,
      repliedBy: c.repliedBy,
      repliedAt: c.repliedAt?.toISOString() ?? null,
    })),
  };
}

export type ReplyDeskData = Awaited<ReturnType<typeof getReplyDeskPage>>;
export type DeskComment = ReplyDeskData["comments"][number];
export type DeskAccount = ReplyDeskData["accounts"][number];
