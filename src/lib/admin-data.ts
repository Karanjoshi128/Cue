import { notFound } from "next/navigation";
import { Prisma, type Platform, type TargetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/admin-guard";
import { getWorkspaceUsage } from "@/lib/plans";
import { getPlatformSettings } from "@/lib/platform-settings";
import { platformAdminEmails } from "@/lib/platform-admin";
import { MAX_ATTEMPTS, staleProcessingWhere } from "@/lib/publish";

// Read side of the platform admin panel. Every loader checks for a platform
// admin itself (not just the layout), and selects fields explicitly so tokens
// and secrets never reach a page.

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
export const PAGE_SIZE = 25;
/** A due post the publisher hasn't taken after this long is "overdue". */
const OVERDUE_AFTER_MS = 10 * MIN;
/** A claimed target older than this belongs to a run that died. */
export const STUCK_AFTER_MS = 10 * MIN;
/** The publisher runs every 5 minutes; silence past this is a problem. */
export const HEARTBEAT_STALE_MS = 15 * MIN;

function pageOf(page: number | undefined) {
  const p = Math.max(1, Math.floor(page ?? 1));
  return { skip: (p - 1) * PAGE_SIZE, take: PAGE_SIZE, page: p };
}

function startOfMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getAdminOverview() {
  await requirePlatformAdmin();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - DAY);
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const dayAhead = new Date(now.getTime() + DAY);

  const [
    workspaces,
    suspended,
    users,
    banned,
    clients,
    accounts,
    newWorkspaces,
    newUsers,
    published24,
    failed24,
    upcoming24,
    overdue,
    stuck,
    heartbeat,
    settings,
    byPlatform,
    recentWorkspaces,
    recentAudit,
  ] = await Promise.all([
    prisma.workspace.count(),
    prisma.workspace.count({ where: { suspendedAt: { not: null } } }),
    prisma.user.count(),
    prisma.user.count({ where: { bannedAt: { not: null } } }),
    prisma.client.count(),
    prisma.socialAccount.count(),
    prisma.workspace.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.postTarget.count({ where: { status: "PUBLISHED", publishedAt: { gte: dayAgo } } }),
    prisma.postTarget.count({
      where: { status: "FAILED", post: { scheduledAt: { gte: dayAgo, lte: now } } },
    }),
    prisma.postTarget.count({
      where: {
        status: "SCHEDULED",
        post: { scheduledAt: { gt: now, lte: dayAhead }, status: { in: ["SCHEDULED", "PUBLISHING"] } },
      },
    }),
    prisma.postTarget.count({ where: overdueWhere(now, true) }),
    prisma.postTarget.count({ where: stuckWhere(now) }),
    prisma.cronHeartbeat.findUnique({ where: { name: "publish" } }),
    getPlatformSettings(),
    prisma.postTarget.groupBy({
      by: ["platform", "status"],
      where: {
        status: { in: ["PUBLISHED", "FAILED"] },
        post: { scheduledAt: { gte: weekAgo, lte: now } },
      },
      _count: { _all: true },
    }),
    prisma.workspace.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        createdAt: true,
        users: { select: { email: true }, orderBy: [{ role: "asc" }, { createdAt: "asc" }], take: 1 },
      },
    }),
    prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  const platforms = (["LINKEDIN", "INSTAGRAM", "YOUTUBE"] as Platform[]).map((platform) => {
    const count = (status: TargetStatus) =>
      byPlatform.find((r) => r.platform === platform && r.status === status)?._count._all ?? 0;
    const published = count("PUBLISHED");
    const failed = count("FAILED");
    return { platform, published, failed, total: published + failed };
  });

  return {
    totals: { workspaces, suspended, users, banned, clients, accounts },
    signups: { workspaces: newWorkspaces, users: newUsers },
    posts: { published24, failed24, upcoming24 },
    publisher: {
      heartbeat,
      stale: !heartbeat || now.getTime() - heartbeat.lastRunAt.getTime() > HEARTBEAT_STALE_MS,
      overdue,
      stuck,
      paused: settings.publishingPaused,
    },
    platforms,
    recentWorkspaces: recentWorkspaces.map((w) => ({
      id: w.id,
      name: w.name,
      createdAt: w.createdAt,
      owner: w.users[0]?.email ?? null,
    })),
    recentAudit,
  };
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export async function listWorkspaces(opts: {
  q?: string;
  status?: "active" | "suspended";
  page?: number;
}) {
  await requirePlatformAdmin();
  const q = opts.q?.trim();
  const where: Prisma.WorkspaceWhereInput = {
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { id: q },
        { users: { some: { email: { contains: q.toLowerCase() } } } },
      ],
    }),
    ...(opts.status === "suspended" && { suspendedAt: { not: null } }),
    ...(opts.status === "active" && { suspendedAt: null }),
  };
  const { skip, take, page } = pageOf(opts.page);
  const [total, rows] = await Promise.all([
    prisma.workspace.count({ where }),
    prisma.workspace.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        name: true,
        plan: true,
        createdAt: true,
        suspendedAt: true,
        storage: { select: { provider: true } },
        users: { select: { email: true }, orderBy: [{ role: "asc" }, { createdAt: "asc" }], take: 1 },
        _count: { select: { users: true, clients: true } },
      },
    }),
  ]);

  const ids = rows.map((r) => r.id);
  const [seen, posts] = ids.length
    ? await Promise.all([
        prisma.user.groupBy({
          by: ["workspaceId"],
          where: { workspaceId: { in: ids } },
          _max: { lastSeenAt: true },
        }),
        prisma.$queryRaw<{ workspaceId: string; n: number }[]>`
          SELECT c."workspaceId", COUNT(*)::int AS n
          FROM "Post" p JOIN "Client" c ON c.id = p."clientId"
          WHERE p."createdAt" >= ${startOfMonthUtc()} AND c."workspaceId" = ANY(${ids})
          GROUP BY c."workspaceId"`,
      ])
    : [[], []];

  return {
    total,
    page,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      plan: r.plan,
      createdAt: r.createdAt,
      suspended: !!r.suspendedAt,
      owner: r.users[0]?.email ?? null,
      members: r._count.users,
      clients: r._count.clients,
      storage: r.storage?.provider ?? null,
      lastSeenAt: seen.find((s) => s.workspaceId === r.id)?._max.lastSeenAt ?? null,
      postsThisMonth: posts.find((p) => p.workspaceId === r.id)?.n ?? 0,
    })),
  };
}

export async function getWorkspaceDetail(id: string) {
  await requirePlatformAdmin();
  const ws = await prisma.workspace.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      plan: true,
      createdAt: true,
      suspendedAt: true,
      suspendedReason: true,
      disabledFeatures: true,
      users: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          lastSeenAt: true,
          bannedAt: true,
          bannedReason: true,
          _count: { select: { posts: true } },
        },
      },
      clients: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          color: true,
          _count: { select: { posts: true } },
          accounts: { select: accountSelect },
        },
      },
      apiKeys: {
        orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
        select: apiKeySelect,
      },
      storage: { select: storageSelect },
    },
  });
  if (!ws) notFound();

  const accountIds = ws.clients.flatMap((c) => c.accounts.map((a) => a.id));
  const [usage, recentPosts, auditLog, lastOutcomes] = await Promise.all([
    getWorkspaceUsage(id),
    prisma.post.findMany({
      where: { client: { workspaceId: id } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        body: true,
        title: true,
        status: true,
        approval: true,
        scheduledAt: true,
        createdAt: true,
        client: { select: { name: true, color: true } },
        targets: {
          select: { id: true, platform: true, status: true, error: true, attempts: true, permalink: true },
        },
      },
    }),
    prisma.adminAuditLog.findMany({
      where: { workspaceId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    lastOutcomeByAccount(accountIds),
  ]);

  return {
    ...ws,
    clients: ws.clients.map((c) => ({
      ...c,
      accounts: c.accounts.map((a) => withHealth(a, lastOutcomes.get(a.id))),
    })),
    usage,
    recentPosts,
    auditLog,
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function listUsers(opts: { q?: string; status?: "banned"; page?: number }) {
  await requirePlatformAdmin();
  const q = opts.q?.trim();
  const where: Prisma.UserWhereInput = {
    ...(q && {
      OR: [
        { email: { contains: q.toLowerCase() } },
        { name: { contains: q, mode: "insensitive" } },
        { id: q },
      ],
    }),
    ...(opts.status === "banned" && { bannedAt: { not: null } }),
  };
  const { skip, take, page } = pageOf(opts.page);
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        lastSeenAt: true,
        bannedAt: true,
        bannedReason: true,
        workspace: { select: { id: true, name: true, suspendedAt: true } },
        _count: { select: { posts: true } },
      },
    }),
  ]);
  return { total, page, rows };
}

// ---------------------------------------------------------------------------
// Connected accounts
// ---------------------------------------------------------------------------

const accountSelect = {
  id: true,
  platform: true,
  displayName: true,
  tokenExpires: true,
  createdAt: true,
  // Only whether one exists. The token itself never leaves the server.
  refreshToken: true,
} satisfies Prisma.SocialAccountSelect;

export type AccountHealth = "ok" | "renews" | "expiring" | "expired" | "reconnect" | "unknown";

const AUTH_ERROR = /reconnect|revoked|expired|invalid_grant|unauthori[sz]ed|\b401\b|access token|session/i;

async function lastOutcomeByAccount(ids: string[]) {
  const map = new Map<string, { status: TargetStatus; error: string | null; at: Date | null }>();
  if (!ids.length) return map;
  const rows = await prisma.$queryRaw<
    { accountId: string; status: TargetStatus; error: string | null; at: Date | null }[]
  >`
    SELECT DISTINCT ON (t."accountId") t."accountId", t.status, t.error,
      COALESCE(t."publishedAt", p."scheduledAt") AS at
    FROM "PostTarget" t JOIN "Post" p ON p.id = t."postId"
    WHERE t.status IN ('PUBLISHED', 'FAILED') AND t."accountId" = ANY(${ids})
    ORDER BY t."accountId", COALESCE(t."publishedAt", p."scheduledAt") DESC NULLS LAST`;
  for (const r of rows) map.set(r.accountId, r);
  return map;
}

function withHealth(
  a: Prisma.SocialAccountGetPayload<{ select: typeof accountSelect }>,
  last: { status: TargetStatus; error: string | null; at: Date | null } | undefined,
) {
  const { refreshToken, ...rest } = a;
  const now = Date.now();
  const expires = a.tokenExpires?.getTime() ?? null;
  // YouTube's access token lives an hour by design; the refresh token is what
  // matters, so expiry alone says nothing there.
  const refreshes = !!refreshToken;
  let health: AccountHealth;
  if (last?.status === "FAILED" && last.error && AUTH_ERROR.test(last.error)) health = "reconnect";
  else if (a.platform === "YOUTUBE" && refreshes) health = "renews";
  else if (expires === null) health = "unknown";
  else if (expires < now) health = "expired";
  else if (expires < now + 7 * DAY) health = refreshes ? "renews" : "expiring";
  else health = "ok";
  return {
    ...rest,
    refreshes,
    health,
    lastStatus: last?.status ?? null,
    lastError: last?.status === "FAILED" ? last.error : null,
    lastAt: last?.at ?? null,
  };
}

export async function listAccounts(opts: { filter?: "attention"; q?: string }) {
  await requirePlatformAdmin();
  const q = opts.q?.trim();
  const accounts = await prisma.socialAccount.findMany({
    where: q
      ? {
          OR: [
            { displayName: { contains: q, mode: "insensitive" } },
            { client: { name: { contains: q, mode: "insensitive" } } },
            { client: { workspace: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      ...accountSelect,
      client: {
        select: { id: true, name: true, color: true, workspace: { select: { id: true, name: true } } },
      },
    },
  });
  const outcomes = await lastOutcomeByAccount(accounts.map((a) => a.id));
  const rows = accounts.map((a) => {
    const { client, ...acct } = a;
    return { ...withHealth(acct, outcomes.get(a.id)), client };
  });
  const needsAttention = (h: AccountHealth) => h === "reconnect" || h === "expired" || h === "expiring";
  return {
    rows: opts.filter === "attention" ? rows.filter((r) => needsAttention(r.health)) : rows,
    attention: rows.filter((r) => needsAttention(r.health)).length,
    total: rows.length,
  };
}

// ---------------------------------------------------------------------------
// Posts and publishing
// ---------------------------------------------------------------------------

function overdueWhere(now: Date, publishable: boolean): Prisma.PostTargetWhereInput {
  return {
    status: "SCHEDULED",
    post: {
      scheduledAt: { lt: new Date(now.getTime() - OVERDUE_AFTER_MS) },
      status: { in: ["SCHEDULED", "PUBLISHING"] },
      // "publishable": what the publisher should have taken by now. Without
      // it, also the posts held back on purpose (approval, suspension).
      ...(publishable && {
        approval: "APPROVED",
        client: { workspace: { suspendedAt: null } },
      }),
    },
    ...(publishable && { attempts: { lt: MAX_ATTEMPTS } }),
  };
}

/** Claimed over 10 minutes ago; a publisher run is cut off after 5. */
function stuckWhere(now: Date): Prisma.PostTargetWhereInput {
  return staleProcessingWhere(now, STUCK_AFTER_MS);
}

const targetRowSelect = {
  id: true,
  platform: true,
  status: true,
  error: true,
  attempts: true,
  publishedAt: true,
  permalink: true,
  account: { select: { displayName: true } },
  post: {
    select: {
      id: true,
      body: true,
      title: true,
      status: true,
      approval: true,
      scheduledAt: true,
      updatedAt: true,
      client: {
        select: {
          id: true,
          name: true,
          color: true,
          workspace: { select: { id: true, name: true, suspendedAt: true } },
        },
      },
    },
  },
} satisfies Prisma.PostTargetSelect;

export type PostsTab = "failed" | "stuck" | "overdue" | "upcoming";

export async function listTargets(tab: PostsTab, page?: number) {
  await requirePlatformAdmin();
  const now = new Date();
  const where: Prisma.PostTargetWhereInput =
    tab === "failed"
      ? { status: "FAILED" }
      : tab === "stuck"
        ? stuckWhere(now)
        : tab === "overdue"
          ? overdueWhere(now, false)
          : {
              status: "SCHEDULED",
              post: {
                scheduledAt: { gte: now, lte: new Date(now.getTime() + DAY) },
                status: { in: ["SCHEDULED", "PUBLISHING"] },
              },
            };
  const orderBy: Prisma.PostTargetOrderByWithRelationInput =
    tab === "failed" ? { post: { updatedAt: "desc" } } : { post: { scheduledAt: "asc" } };
  const { skip, take, page: p } = pageOf(page);
  const [total, rows, settings, counts] = await Promise.all([
    prisma.postTarget.count({ where }),
    prisma.postTarget.findMany({ where, orderBy, skip, take, select: targetRowSelect }),
    getPlatformSettings(),
    Promise.all([
      prisma.postTarget.count({ where: { status: "FAILED" } }),
      prisma.postTarget.count({ where: stuckWhere(now) }),
      prisma.postTarget.count({ where: overdueWhere(now, false) }),
      prisma.postTarget.count({
        where: {
          status: "SCHEDULED",
          post: {
            scheduledAt: { gte: now, lte: new Date(now.getTime() + DAY) },
            status: { in: ["SCHEDULED", "PUBLISHING"] },
          },
        },
      }),
    ]),
  ]);

  return {
    total,
    page: p,
    counts: { failed: counts[0], stuck: counts[1], overdue: counts[2], upcoming: counts[3] },
    rows: rows.map((r) => ({
      ...r,
      // Why an overdue post hasn't gone out, in the order the publisher checks.
      heldBecause:
        tab !== "overdue"
          ? null
          : settings.publishingPaused
            ? "Publishing is paused"
            : r.post.client.workspace.suspendedAt
              ? "Workspace suspended"
              : r.post.approval !== "APPROVED"
                ? "Waiting for approval"
                : r.attempts >= MAX_ATTEMPTS
                  ? "Out of attempts"
                  : "Publisher hasn't picked it up",
    })),
  };
}

// ---------------------------------------------------------------------------
// API keys, storage, audit, platform
// ---------------------------------------------------------------------------

const apiKeySelect = {
  id: true,
  name: true,
  prefix: true,
  lastUsedAt: true,
  useCount: true,
  revokedAt: true,
  createdAt: true,
  user: { select: { email: true } },
} satisfies Prisma.ApiKeySelect;

export async function listApiKeys(opts: { q?: string; status?: "active" | "revoked"; page?: number }) {
  await requirePlatformAdmin();
  const q = opts.q?.trim();
  const where: Prisma.ApiKeyWhereInput = {
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { prefix: { startsWith: q } },
        { workspace: { name: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q.toLowerCase() } } },
      ],
    }),
    ...(opts.status === "active" && { revokedAt: null }),
    ...(opts.status === "revoked" && { revokedAt: { not: null } }),
  };
  const { skip, take, page } = pageOf(opts.page);
  const [total, rows] = await Promise.all([
    prisma.apiKey.count({ where }),
    prisma.apiKey.findMany({
      where,
      orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { lastUsedAt: { sort: "desc", nulls: "last" } }],
      skip,
      take,
      select: { ...apiKeySelect, workspace: { select: { id: true, name: true } } },
    }),
  ]);
  return { total, page, rows };
}

const storageSelect = {
  provider: true,
  bucket: true,
  endpoint: true,
  region: true,
  jurisdiction: true,
  publicUrl: true,
  verifiedAt: true,
  updatedAt: true,
} satisfies Prisma.StorageConfigSelect;

export async function listStorageConfigs() {
  await requirePlatformAdmin();
  return prisma.storageConfig.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      ...storageSelect,
      workspace: { select: { id: true, name: true, disabledFeatures: true } },
    },
  });
}

export async function listAudit(opts: { q?: string; page?: number }) {
  await requirePlatformAdmin();
  const q = opts.q?.trim();
  const where: Prisma.AdminAuditLogWhereInput = q
    ? {
        OR: [
          { action: { contains: q } },
          { actorEmail: { contains: q.toLowerCase() } },
          { workspaceId: q },
          { targetId: q },
          { reason: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const { skip, take, page } = pageOf(opts.page);
  const [total, rows] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
  ]);
  const wsIds = [...new Set(rows.map((r) => r.workspaceId).filter(Boolean) as string[])];
  const names = wsIds.length
    ? await prisma.workspace.findMany({ where: { id: { in: wsIds } }, select: { id: true, name: true } })
    : [];
  return {
    total,
    page,
    rows: rows.map((r) => ({
      ...r,
      workspaceName: names.find((n) => n.id === r.workspaceId)?.name ?? null,
    })),
  };
}

export async function getPlatformPage() {
  await requirePlatformAdmin();
  const [settings, heartbeat] = await Promise.all([
    getPlatformSettings(),
    prisma.cronHeartbeat.findUnique({ where: { name: "publish" } }),
  ]);
  return { settings, heartbeat, admins: platformAdminEmails() };
}
