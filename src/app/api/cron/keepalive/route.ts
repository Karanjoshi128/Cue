import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/tokens";

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
    // YouTube (Google) tokens are short-lived and refreshed at publish time,
    // not on this ~5-day cycle, so skip them here.
    where: {
      tokenExpires: { lte: soon },
      refreshToken: { not: null },
      platform: { not: "YOUTUBE" },
    },
  });

  let refreshed = 0;
  for (const account of expiring) {
    try {
      const next = await refreshAccessToken(
        account.platform,
        decrypt(account.refreshToken!),
      );
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
