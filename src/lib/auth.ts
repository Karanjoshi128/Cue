import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { User } from "@prisma/client";

export interface AuthState {
  /** The workspace member, if the signed-in email belongs to one. */
  user: User | null;
  /** The authenticated email - set even before the person has a workspace. */
  email: string | null;
  /** Authenticated but has no workspace yet → must run onboarding. */
  needsOnboarding: boolean;
}

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
  if (!isSupabaseConfigured()) {
    // Fail CLOSED in production: never impersonate a tenant when the auth
    // provider is absent, so a mis-deployed build can't become an open door.
    if (process.env.NODE_ENV === "production") {
      return { user: null, email: null, needsOnboarding: false };
    }
    // Local dev only: fall back to the first user so the app is usable before
    // Supabase is wired up.
    return {
      user: await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }),
      email: null,
      needsOnboarding: false,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Normalize to lowercase so invited rows (stored lowercased) always match.
  const email = user?.email?.toLowerCase() ?? null;
  if (!email) return { user: null, email: null, needsOnboarding: false };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { user: existing, email, needsOnboarding: false };

  // Authenticated, but not a member of any workspace yet → onboarding.
  return { user: null, email, needsOnboarding: true };
});

export async function getCurrentUser(): Promise<User | null> {
  return (await getAuth()).user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
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
