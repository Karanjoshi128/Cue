import { prisma } from "@/lib/prisma";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { User } from "@prisma/client";

/**
 * Returns the current team member.
 *
 * - When Supabase Auth is configured, reads the session and upserts a matching
 *   User row (internal team, so any authenticated email is a MANAGER by default;
 *   the first user becomes ADMIN).
 * - In local dev without Supabase env, falls back to the seeded default admin so
 *   the app is fully usable before credentials are wired.
 */
export async function getCurrentUser(): Promise<User | null> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      // Dev-only convenience: no Supabase session locally → use the seeded admin
      // so the app is browsable without email magic-links. Never in production.
      if (process.env.NODE_ENV !== "production") {
        return prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
      }
      return null;
    }

    const existing = await prisma.user.findUnique({
      where: { email: user.email },
    });
    if (existing) return existing;

    const count = await prisma.user.count();
    return prisma.user.create({
      data: {
        email: user.email,
        name: user.user_metadata?.name ?? user.email.split("@")[0],
        role: count === 0 ? "ADMIN" : "MANAGER",
      },
    });
  }

  // Dev fallback — first user in the DB (created by the seed).
  return prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
