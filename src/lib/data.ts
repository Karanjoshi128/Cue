import { prisma } from "@/lib/prisma";

export async function getUsers() {
  return prisma.user.findMany({ orderBy: { createdAt: "asc" } });
}

export async function getClients() {
  return prisma.client.findMany({
    orderBy: { name: "asc" },
    include: {
      accounts: true,
      _count: { select: { posts: true } },
    },
  });
}

export async function getClient(id: string) {
  return prisma.client.findUnique({
    where: { id },
    include: { accounts: true },
  });
}

export async function getPosts(filter?: {
  clientId?: string;
  status?: string;
}) {
  return prisma.post.findMany({
    where: {
      ...(filter?.clientId ? { clientId: filter.clientId } : {}),
      ...(filter?.status ? { status: filter.status as never } : {}),
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
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
  return prisma.post.findUnique({
    where: { id },
    include: {
      client: true,
      media: true,
      targets: { include: { account: true } },
    },
  });
}

export async function getDashboardStats(clientId?: string) {
  const now = new Date();
  const soon = new Date(Date.now() + 7 * 86_400_000);
  const scope = clientId ? { clientId } : {};
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
    clientId ? 1 : prisma.client.count(),
    prisma.post.count({ where: { status: "SCHEDULED", ...scope } }),
    prisma.postHistory.count({ where: scope }),
    prisma.postTarget.count({
      where: { status: "FAILED", ...(clientId ? { post: { clientId } } : {}) },
    }),
    prisma.socialAccount.count({
      where: { tokenExpires: { not: null, lte: soon }, ...scope },
    }),
    prisma.post.count({ where: { status: "DRAFT", ...scope } }),
    prisma.post.count({
      where: { approval: { in: ["PENDING", "CHANGES_REQUESTED"] }, ...scope },
    }),
    prisma.post.findMany({
      where: { status: "SCHEDULED", scheduledAt: { gte: now }, ...scope },
      orderBy: { scheduledAt: "asc" },
      take: 6,
      include: { client: true, targets: true },
    }),
    prisma.client.findMany({
      where: clientId ? { id: clientId } : {},
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
      take: 6,
    }),
    prisma.post.groupBy({
      by: ["clientId"],
      where: { status: "SCHEDULED", ...scope },
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
  platform?: "LINKEDIN" | "INSTAGRAM",
) {
  return prisma.post.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
      ...(clientId ? { clientId } : {}),
      ...(platform ? { targets: { some: { platform } } } : {}),
    },
    orderBy: { scheduledAt: "asc" },
    include: { client: true, targets: true },
  });
}
