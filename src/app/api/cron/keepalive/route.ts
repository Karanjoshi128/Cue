import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * Runs every ~5 days from GitHub Actions to:
 *  1. Keep the Supabase project warm (beats the 7-day inactivity pause).
 *  2. Refresh social tokens that are within ~10 days of expiry.
 */
export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Trivial query → counts as DB activity.
  const clientCount = await prisma.client.count();

  // 2. Refresh soon-to-expire tokens.
  const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const expiring = await prisma.socialAccount.findMany({
    where: { tokenExpires: { lte: soon }, refreshToken: { not: null } },
  });

  let refreshed = 0;
  for (const account of expiring) {
    try {
      const next = await refreshToken(account.platform, decrypt(account.refreshToken!));
      if (next) {
        await prisma.socialAccount.update({
          where: { id: account.id },
          data: {
            accessToken: encrypt(next.accessToken),
            tokenExpires: next.expiresAt,
            ...(next.refreshToken
              ? { refreshToken: encrypt(next.refreshToken) }
              : {}),
          },
        });
        refreshed++;
      }
    } catch {
      // Leave it; surfaced as a connection-health warning in the UI.
    }
  }

  return NextResponse.json({ ok: true, clientCount, refreshed });
}

async function refreshToken(
  platform: "LINKEDIN" | "INSTAGRAM",
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date } | null> {
  if (platform === "LINKEDIN") {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    });
    const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  // Instagram: long-lived token refresh (extends another ~60 days).
  const res = await fetch(
    `https://graph.facebook.com/v21.0/refresh_access_token?grant_type=ig_refresh_token&access_token=${refreshToken}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}
