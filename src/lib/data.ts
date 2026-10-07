import { prisma } from "@/lib/prisma";
import { requireAdmin, requireWorkspaceId } from "@/lib/auth";

// Every function here self-scopes to the caller's workspace via
// requireWorkspaceId(), so a page can never accidentally read another tenant's
// data. Posts / accounts are reached through their Client's workspaceId.

export async function getWorkspace() {
  const workspaceId = await requireWorkspaceId();
  return prisma.workspace.findUnique({ where: { id: workspaceId } });
}

/**
 * API keys for Settings (admins only). Selects explicitly so the hash never
 * leaves the database - the display prefix is all the UI needs.
 */
export async function getApiKeys() {
  const admin = await requireAdmin();
  return prisma.apiKey.findMany({
    where: { workspaceId: admin.workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
  });
}

export async function getUsers() {
  const workspaceId = await requireWorkspaceId();
  return prisma.user.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getClients() {
  const workspaceId = await requireWorkspaceId();
  return prisma.client.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    include: {
      accounts: true,
      _count: { select: { posts: true } },
    },
  });
}

/**
 * Minimal client list for the topbar switcher, which renders on every page.
 * Deliberately not getClients(): that pulls each client's social accounts
 * (including their encrypted tokens) and post counts, none of which the
 * switcher uses.
 */
export async function getClientOptions() {
  const workspaceId = await requireWorkspaceId();
  return prisma.client.findMany({
    where: { workspaceId },
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  });
}

export async function getClient(id: string) {
  const workspaceId = await requireWorkspaceId();
  return prisma.client.findFirst({
    where: { id, workspaceId },
    include: { accounts: true },
  });
}

export async function getPosts(filter?: {
  clientId?: string;
  status?: string;
}) {
  const workspaceId = await requireWorkspaceId();
  return prisma.post.findMany({
    where: {
      client: { workspaceId },
      ...(filter?.clientId ? { clientId: filter.clientId } : {}),
      ...(filter?.status ? { status: filter.status as never } : {}),
    },
    // Queue shows newest first - the most recently created posts on top.
    orderBy: { createdAt: "desc" },
    include: {
      client: true,
      media: true,
      targets: { include: { account: true } },
      comments: {
        include: { author: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function getPost(id: string) {
  const workspaceId = await requireWorkspaceId();
  return prisma.post.findFirst({
    where: { id, client: { workspaceId } },
    include: {
      client: true,
      media: true,
      targets: { include: { account: true } },
    },
  });
}

export async function getDashboardStats(clientId?: string) {
  const workspaceId = await requireWorkspaceId();
  const now = new Date();
  const soon = new Date(Date.now() + 7 * 86_400_000);
  // The dashboard's two-week strip. Starts a day back so "today" is always
  // fully covered whatever the viewer's time zone.
  const horizonFrom = new Date(Date.now() - 86_400_000);
  const horizonTo = new Date(Date.now() + 15 * 86_400_000);

  // Post scope: always the workspace, optionally narrowed to one client.
  const postScope = {
    client: { workspaceId },
    ...(clientId ? { clientId } : {}),
  };

  const [
    clients,
    scheduled,
    published,
    failed,
    expiring,
    drafts,
    pending,
    upcoming,
    clientRows,
    grouped,
    horizon,
    accounts,
  ] = await Promise.all([
    clientId ? 1 : prisma.client.count({ where: { workspaceId } }),
    prisma.post.count({ where: { status: "SCHEDULED", ...postScope } }),
    prisma.postHistory.count({
      where: { workspaceId, ...(clientId ? { clientId } : {}) },
    }),
    prisma.postTarget.count({
      where: { status: "FAILED", post: postScope },
    }),
    prisma.socialAccount.count({
      where: {
        client: { workspaceId },
        ...(clientId ? { clientId } : {}),
        // YouTube's hour-long access tokens are renewed at publish time, so for
        // it only a dropped refresh token (dead connection) counts.
        OR: [
          {
            platform: { not: "YOUTUBE" },
            tokenExpires: { not: null, lte: soon },
          },
          { platform: "YOUTUBE", refreshToken: null },
        ],
      },
    }),
    prisma.post.count({ where: { status: "DRAFT", ...postScope } }),
    prisma.post.count({
      where: {
        approval: { in: ["PENDING", "CHANGES_REQUESTED"] },
        ...postScope,
      },
    }),
    prisma.post.findMany({
      where: { status: "SCHEDULED", scheduledAt: { gte: now }, ...postScope },
      orderBy: { scheduledAt: "asc" },
      take: 6,
      include: { client: true, targets: true },
    }),
    prisma.client.findMany({
      where: { workspaceId, ...(clientId ? { id: clientId } : {}) },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
      take: 6,
    }),
    prisma.post.groupBy({
      by: ["clientId"],
      where: { status: "SCHEDULED", ...postScope },
      _count: { _all: true },
    }),
    prisma.post.findMany({
      where: {
        status: { in: ["SCHEDULED", "PUBLISHED", "PARTIAL", "FAILED"] },
        scheduledAt: { gte: horizonFrom, lt: horizonTo },
        ...postScope,
      },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        client: { select: { name: true, color: true } },
      },
    }),
    prisma.socialAccount.count({
      where: {
        client: { workspaceId },
        ...(clientId ? { clientId } : {}),
      },
    }),
  ]);

  const countByClient = new Map(grouped.map((g) => [g.clientId, g._count._all]));
  const clientList = clientRows.map((c) => ({
    ...c,
    scheduled: countByClient.get(c.id) ?? 0,
  }));

  return {
    clients,
    scheduled,
    published,
    failed,
    expiring,
    drafts,
    pending,
    upcoming,
    clientList,
    horizon,
    accounts,
  };
}

/**
 * The next scheduled post, for the "next cue" countdown in the app shell.
 * One indexed row, so it's cheap enough to run on every page.
 */
export async function getNextCue(clientId?: string) {
  const workspaceId = await requireWorkspaceId();
  return prisma.post.findFirst({
    where: {
      status: "SCHEDULED",
      scheduledAt: { gte: new Date() },
      client: { workspaceId },
      ...(clientId ? { clientId } : {}),
    },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      body: true,
      title: true,
      scheduledAt: true,
      client: { select: { name: true, color: true } },
      targets: { select: { platform: true } },
    },
  });
}

export async function getCalendarPosts(
  from: Date,
  to: Date,
  clientId?: string,
  platform?: "LINKEDIN" | "INSTAGRAM" | "YOUTUBE",
) {
  const workspaceId = await requireWorkspaceId();
  return prisma.post.findMany({
    where: {
      client: { workspaceId },
      scheduledAt: { gte: from, lte: to },
      ...(clientId ? { clientId } : {}),
      ...(platform ? { targets: { some: { platform } } } : {}),
    },
    orderBy: { scheduledAt: "asc" },
    include: { client: true, targets: true },
  });
}
