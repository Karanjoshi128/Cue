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
  const soon = new Date(Date.now() + 7 * 86_400_000);
  const scope = clientId ? { clientId } : {};
  const [clients, scheduled, published, failed, expiring, upcoming] =
    await Promise.all([
      clientId ? 1 : prisma.client.count(),
      prisma.post.count({ where: { status: "SCHEDULED", ...scope } }),
      prisma.postHistory.count({ where: scope }),
      prisma.postTarget.count({
        where: { status: "FAILED", ...(clientId ? { post: { clientId } } : {}) },
      }),
      prisma.socialAccount.count({
        where: { tokenExpires: { not: null, lte: soon }, ...scope },
      }),
      prisma.post.findMany({
        where: { status: "SCHEDULED", scheduledAt: { gte: new Date() }, ...scope },
        orderBy: { scheduledAt: "asc" },
        take: 8,
        include: { client: true, targets: true },
      }),
    ]);
  return { clients, scheduled, published, failed, expiring, upcoming };
}

export async function getCalendarPosts(
  from: Date,
  to: Date,
  clientId?: string,
) {
  return prisma.post.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
      ...(clientId ? { clientId } : {}),
    },
    orderBy: { scheduledAt: "asc" },
    include: { client: true, targets: true },
  });
}
