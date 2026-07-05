import { prisma } from "@/lib/prisma";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { User } from "@prisma/client";

export interface AuthState {
  /** The workspace member, if the signed-in email belongs to one. */
  user: User | null;
  /** The authenticated email — set even when the person is not (yet) a member. */
  email: string | null;
}

/**
 * Resolves who is making the request.
 *
 * Access is membership-gated: anyone can authenticate with Supabase, but only
 * emails that have been added to the workspace (invited, or the very first
 * bootstrap admin) become a `User`. An authenticated-but-not-invited email
 * gets `{ user: null, email }` so the app can show a "no access" screen rather
 * than silently creating a member.
 */
export async function getAuth(): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    // No auth provider configured (bare local bootstrap): fall back to the
    // first user so the app is usable before Supabase is wired.
    return {
      user: await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }),
      email: null,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? null;
  if (!email) return { user: null, email: null };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { user: existing, email };

  // Bootstrap: the very first person to sign in owns the workspace as ADMIN.
  if ((await prisma.user.count()) === 0) {
    const created = await prisma.user.create({
      data: {
        email,
        name: user?.user_metadata?.name ?? email.split("@")[0],
        role: "ADMIN",
      },
    });
    return { user: created, email };
  }

  // Authenticated but not a member of the workspace → no access.
  return { user: null, email };
}

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
