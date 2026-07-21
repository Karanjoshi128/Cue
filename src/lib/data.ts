import { prisma } from "@/lib/prisma";
import { requireWorkspaceId } from "@/lib/auth";

// Every function here self-scopes to the caller's workspace via
// requireWorkspaceId(), so a page can never accidentally read another tenant's
// data. Posts / accounts are reached through their Client's workspaceId.

export async function getWorkspace() {
  const workspaceId = await requireWorkspaceId();
  return prisma.workspace.findUnique({ where: { id: workspaceId } });
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
        tokenExpires: { not: null, lte: soon },
        client: { workspaceId },
        ...(clientId ? { clientId } : {}),
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
  };
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
