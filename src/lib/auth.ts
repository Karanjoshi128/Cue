import { cache } from "react";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { isPlatformAdminEmail, readViewAsCookie } from "@/lib/platform-admin";
import { ApiError } from "@/lib/api";
import type { User } from "@prisma/client";

export interface ViewAsState {
  workspaceId: string;
  workspaceName: string;
  /** Epoch ms. */
  expiresAt: number;
  adminEmail: string;
}

export interface AuthState {
  /** The workspace member, if the signed-in email belongs to one. */
  user: User | null;
  /** The authenticated email - set even before the person has a workspace. */
  email: string | null;
  /** Authenticated but in no workspace (yet, or any more) → the onboarding screen. */
  needsOnboarding: boolean;
  /** Signed in, but locked out by a ban or a suspended workspace. */
  blocked?: { kind: "banned" | "suspended"; reason: string | null };
  /**
   * A platform admin viewing a workspace read-only (src/app/admin). `user` is
   * then that workspace's admin, and `email` stays the platform admin's own.
   */
  viewAs?: ViewAsState;
}

// lastSeenAt is for the admin panel's "last active"; writing it on every
// request would be wasteful, so it's refreshed at most this often.
const SEEN_EVERY_MS = 5 * 60 * 1000;

/** Local dev only: lets tests sign in as any seeded user (see resolveDevUser). */
export const DEV_USER_COOKIE = "cue_dev_user";

/**
 * Resolves who is making the request. Read-only and memoized per request via
 * React `cache`, so every self-scoping data function can call it cheaply.
 *
 * Multi-tenant: anyone can authenticate with Supabase. A first-time email has
 * no `User` row yet → `{ user: null, email, needsOnboarding: true }`, and the
 * onboarding flow creates their Workspace + admin User. Invited emails are
 * pre-created as members of the inviter's workspace, so they resolve to a User.
 */
export const getAuth = cache(async (): Promise<AuthState> => {
  let email: string | null;
  if (!isSupabaseConfigured()) {
    // Fail CLOSED in production: never impersonate a tenant when the auth
    // provider is absent, so a mis-deployed build can't become an open door.
    if (process.env.NODE_ENV === "production") {
      return { user: null, email: null, needsOnboarding: false };
    }
    // Local dev only: fall back to a seeded user so the app is usable before
    // Supabase is wired up.
    email = (await resolveDevUser())?.email ?? null;
    if (!email) return { user: null, email: null, needsOnboarding: false };
  } else {
    const supabase = await createClient();
    // Verifies the session token locally against the project's signing key,
    // instead of asking Supabase's Auth server on every render and prefetch
    // (which ran into its rate limit). src/proxy.ts keeps the token fresh.
    const { data } = await supabase.auth.getClaims();
    const claimed = data?.claims.email;
    // Normalize to lowercase so invited rows (stored lowercased) always match.
    email = typeof claimed === "string" && claimed ? claimed.toLowerCase() : null;
    if (!email) return { user: null, email: null, needsOnboarding: false };
  }

  // A platform admin viewing a workspace sees it as that workspace's admin.
  if (isPlatformAdminEmail(email)) {
    const viewAs = await resolveViewAs(email);
    if (viewAs) return { ...viewAs, email, needsOnboarding: false };
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        orderBy: { createdAt: "asc" },
        select: {
          workspaceId: true,
          role: true,
          workspace: { select: { suspendedAt: true, suspendedReason: true } },
        },
      },
    },
  });
  if (!existing) {
    // Authenticated, but not a member of any workspace yet → onboarding.
    return { user: null, email, needsOnboarding: true };
  }

  const { memberships, ...stored } = existing;
  if (stored.bannedAt) {
    return {
      user: null,
      email,
      needsOnboarding: false,
      blocked: { kind: "banned", reason: stored.bannedReason },
    };
  }
  // Removed from every workspace: back to the onboarding screen, which offers
  // their pending invites or a workspace of their own.
  if (memberships.length === 0) return { user: null, email, needsOnboarding: true };

  // The active workspace is User.workspaceId while they still belong to it and
  // it isn't suspended; otherwise their next usable one.
  const usable = memberships.filter((m) => !m.workspace.suspendedAt);
  const active = usable.find((m) => m.workspaceId === stored.workspaceId) ?? usable[0];
  if (!active) {
    const current =
      memberships.find((m) => m.workspaceId === stored.workspaceId) ?? memberships[0];
    return {
      user: null,
      email,
      needsOnboarding: false,
      blocked: { kind: "suspended", reason: current.workspace.suspendedReason },
    };
  }
  if (active.workspaceId !== stored.workspaceId || active.role !== stored.role) {
    // Keep the stored pointer and role in step (removed, suspended, re-roled).
    void prisma.user
      .update({
        where: { id: stored.id },
        data: { workspaceId: active.workspaceId, role: active.role },
      })
      .catch(() => {});
  }
  // Role comes from the membership, so every check reads the right one.
  const user: User = { ...stored, workspaceId: active.workspaceId, role: active.role };

  if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > SEEN_EVERY_MS) {
    // Telemetry only; never fail or slow a request over it.
    void prisma.user
      .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }
  return { user, email, needsOnboarding: false };
});

/**
 * Local dev without Supabase: the user named by the cue_dev_user cookie, else
 * the first user. Never reached in production (getAuth fails closed there).
 */
async function resolveDevUser() {
  const wanted = (await cookies()).get(DEV_USER_COOKIE)?.value;
  if (wanted) {
    const match = await prisma.user.findUnique({ where: { email: wanted } });
    if (match) return match;
  }
  return prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
}

async function resolveViewAs(
  adminEmail: string,
): Promise<{ user: User; viewAs: ViewAsState } | null> {
  const token = await readViewAsCookie();
  if (!token || token.adminEmail !== adminEmail) return null;
  const workspace = await prisma.workspace.findUnique({
    where: { id: token.workspaceId },
    select: {
      id: true,
      name: true,
      // Their admin, so every page renders as the workspace's owner sees it.
      memberships: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        take: 1,
        include: { user: true },
      },
    },
  });
  const member = workspace?.memberships[0];
  if (!workspace || !member) return null;
  return {
    user: { ...member.user, workspaceId: workspace.id, role: member.role },
    viewAs: {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      expiresAt: token.expiresAt,
      adminEmail,
    },
  };
}

export async function getCurrentUser(): Promise<User | null> {
  return (await getAuth()).user;
}

const READ_ONLY_MESSAGE =
  "You're viewing this workspace read-only as Cue support. Exit view mode to make changes.";

/**
 * The signed-in member. While a platform admin is viewing a workspace, every
 * Server Action is refused here: they all call this (or requireAdmin) first,
 * and page renders, which only read, are not Server Actions.
 */
export async function requireUser(): Promise<User> {
  const auth = await getAuth();
  if (!auth.user) throw new Error("UNAUTHENTICATED");
  if (auth.viewAs && (await isActionRequest())) {
    throw new ApiError(403, READ_ONLY_MESSAGE);
  }
  return auth.user;
}

/**
 * A Server Action call, by either route Next accepts: the Next-Action header
 * (client calls), or a form post (a form submitted before the page has
 * hydrated carries the action in its body, with no header). Page renders are
 * GETs and carry neither.
 */
async function isActionRequest(): Promise<boolean> {
  const h = await headers();
  if (h.has("next-action")) return true;
  const type = h.get("content-type") ?? "";
  return type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded");
}

/**
 * For route handlers that change something (uploads, connecting accounts):
 * like requireUser, but refuses view mode outright, since a route handler
 * isn't a Server Action and so isn't caught by the check above.
 */
export async function requireWritableUser(): Promise<User> {
  const auth = await getAuth();
  if (!auth.user) throw new Error("UNAUTHENTICATED");
  if (auth.viewAs) throw new ApiError(403, READ_ONLY_MESSAGE);
  return auth.user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Admins only.");
  return user;
}

/**
 * The workspace the current request belongs to. Every tenant-scoped query
 * funnels through this so a missing scope can't silently leak another
 * customer's data. Throws if the caller isn't a workspace member.
 */
export async function requireWorkspaceId(): Promise<string> {
  return (await requireUser()).workspaceId;
}

/** Every workspace this person belongs to, for the switcher. */
export async function getMyWorkspaces(userId: string) {
  const rows = await prisma.membership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      workspace: { select: { id: true, name: true, suspendedAt: true } },
    },
  });
  return rows.map((r) => ({
    id: r.workspace.id,
    name: r.workspace.name,
    role: r.role,
    suspended: !!r.workspace.suspendedAt,
  }));
}
