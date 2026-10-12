import type { Plan, Workspace } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cueMediaBases } from "@/lib/storage";

// Plans, limits and per-workspace feature switches. The platform admin panel
// assigns a plan and switches features off; everything else in the app asks
// this module whether something is allowed. Every workspace starts on
// UNLIMITED with every feature on, so nothing changes until an admin acts.

const GB = 1024 * 1024 * 1024;

export interface PlanLimits {
  clients: number | null;
  members: number | null;
  postsPerMonth: number | null;
  apiKeys: number | null;
  /** Media stored in Cue's own bucket. A workspace's own bucket is uncapped. */
  storageBytes: number | null;
}

export type LimitKey = keyof PlanLimits;

export const PLANS: Record<Plan, { label: string; limits: PlanLimits }> = {
  FREE: {
    label: "Free",
    limits: { clients: 2, members: 2, postsPerMonth: 30, apiKeys: 1, storageBytes: 1 * GB },
  },
  PRO: {
    label: "Pro",
    limits: { clients: 10, members: 5, postsPerMonth: 300, apiKeys: 5, storageBytes: 20 * GB },
  },
  AGENCY: {
    label: "Agency",
    limits: { clients: 50, members: 25, postsPerMonth: 2000, apiKeys: 20, storageBytes: 100 * GB },
  },
  UNLIMITED: {
    label: "Unlimited",
    limits: { clients: null, members: null, postsPerMonth: null, apiKeys: null, storageBytes: null },
  },
};

export const PLAN_ORDER: Plan[] = ["FREE", "PRO", "AGENCY", "UNLIMITED"];

export const LIMIT_LABELS: Record<LimitKey, string> = {
  clients: "Clients",
  members: "Team members",
  postsPerMonth: "Posts this month",
  apiKeys: "Active API keys",
  storageBytes: "Storage on Cue",
};

/** Features an admin can switch off per workspace. All are on by default. */
export const FEATURES = {
  api: {
    label: "API access",
    description: "API keys and the /api/v1 endpoints.",
  },
  custom_storage: {
    label: "Own storage",
    description: "Connecting the workspace's own R2 or S3 bucket.",
  },
  linkedin: {
    label: "LinkedIn",
    description: "Connecting LinkedIn accounts.",
  },
  instagram: {
    label: "Instagram",
    description: "Connecting Instagram accounts.",
  },
  youtube: {
    label: "YouTube",
    description: "Connecting YouTube channels.",
  },
} as const;

export type FeatureKey = keyof typeof FEATURES;

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export function isFeatureKey(v: string): v is FeatureKey {
  return v in FEATURES;
}

export function hasFeature(
  workspace: Pick<Workspace, "disabledFeatures">,
  feature: FeatureKey,
): boolean {
  return !workspace.disabledFeatures.includes(feature);
}

/** Looks the workspace up and reports whether a feature is on. */
export async function workspaceHasFeature(
  workspaceId: string,
  feature: FeatureKey,
): Promise<boolean> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { disabledFeatures: true },
  });
  return !!ws && hasFeature(ws, feature);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 10 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

function startOfMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface WorkspaceUsage {
  clients: number;
  members: number;
  postsPerMonth: number;
  apiKeys: number;
  storageBytes: number;
  /** All-time API requests across the workspace's keys (not a limit). */
  apiCalls: number;
}

const USAGE: Record<LimitKey, (workspaceId: string) => Promise<number>> = {
  clients: (workspaceId) => prisma.client.count({ where: { workspaceId } }),
  members: (workspaceId) => prisma.user.count({ where: { workspaceId } }),
  postsPerMonth: (workspaceId) =>
    prisma.post.count({
      where: { client: { workspaceId }, createdAt: { gte: startOfMonthUtc() } },
    }),
  apiKeys: (workspaceId) =>
    prisma.apiKey.count({ where: { workspaceId, revokedAt: null } }),
  // Only what's in Cue's own bucket. Summed as bigint: an Int sum would
  // overflow once a workspace passes about 2 GB.
  storageBytes: async (workspaceId) => {
    const patterns = cueMediaBases().map((b) => `${b}/%`);
    if (!patterns.length) return 0;
    const [row] = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(m."sizeBytes"), 0)::bigint AS total
      FROM "MediaAsset" m
      JOIN "Post" p ON p.id = m."postId"
      JOIN "Client" c ON c.id = p."clientId"
      WHERE c."workspaceId" = ${workspaceId} AND m.url LIKE ANY(${patterns})`;
    return Number(row?.total ?? 0);
  },
};

export async function getWorkspaceUsage(workspaceId: string): Promise<WorkspaceUsage> {
  const [clients, members, postsPerMonth, apiKeys, storageBytes, calls] = await Promise.all([
    USAGE.clients(workspaceId),
    USAGE.members(workspaceId),
    USAGE.postsPerMonth(workspaceId),
    USAGE.apiKeys(workspaceId),
    USAGE.storageBytes(workspaceId),
    prisma.apiKey.aggregate({ _sum: { useCount: true }, where: { workspaceId } }),
  ]);
  return {
    clients,
    members,
    postsPerMonth,
    apiKeys,
    storageBytes,
    apiCalls: calls._sum.useCount ?? 0,
  };
}

const LIMIT_NOUNS: Record<LimitKey, (n: number) => string> = {
  clients: (n) => `${n} client${n === 1 ? "" : "s"}`,
  members: (n) => `${n} team member${n === 1 ? "" : "s"}`,
  postsPerMonth: (n) => `${n} posts a month`,
  apiKeys: (n) => `${n} active API key${n === 1 ? "" : "s"}`,
  storageBytes: (n) => `${formatBytes(n)} of storage on Cue`,
};

/**
 * Null when the workspace can add `adding` more of something, otherwise the
 * message to show. `adding` is a count, or bytes for storage.
 */
export async function limitProblem(
  workspaceId: string,
  key: LimitKey,
  adding = 1,
): Promise<string | null> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  });
  if (!ws) return "Workspace not found.";
  const plan = PLANS[ws.plan];
  const limit = plan.limits[key];
  if (limit === null) return null;
  if ((await USAGE[key](workspaceId)) + adding <= limit) return null;
  return `Your ${plan.label} plan includes ${LIMIT_NOUNS[key](limit)}, and this would go over it. Contact Cue support to raise the limit.`;
}
