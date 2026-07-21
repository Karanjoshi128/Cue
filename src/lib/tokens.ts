import type { Platform, SocialAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";

export interface RefreshedToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

/**
 * Exchanges a stored refresh token for a fresh access token. Returns null on
 * any failure (caller keeps using the existing token / surfaces a warning).
 * Shared by the keepalive cron (proactive, ~5-day cycle) and publish-time
 * refresh (YouTube's Google tokens live ~1h, so they're renewed here).
 */
export async function refreshAccessToken(
  platform: Platform,
  refreshToken: string,
): Promise<RefreshedToken | null> {
  if (platform === "LINKEDIN") {
    const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
        client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
      }),
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

  if (platform === "INSTAGRAM") {
    // Instagram Login long-lived tokens refresh themselves (the token IS the
    // refresh credential) on graph.instagram.com, extending another ~60 days.
    const res = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${refreshToken}`,
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

  if (platform === "YOUTUBE") {
    // Google access tokens expire in ~1h; the refresh token is long-lived and
    // usually not re-issued, so we keep the stored one when none comes back.
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      }),
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

  return null;
}

type RefreshableAccount = Pick<
  SocialAccount,
  "id" | "platform" | "accessToken" | "refreshToken" | "tokenExpires"
>;

/**
 * Returns a valid access token for `account`, refreshing + persisting it first
 * when it's within `bufferMs` of expiry and a refresh token exists. Falls back
 * to the stored token when refresh isn't possible or fails. This is the hook
 * that keeps short-lived YouTube (Google) tokens usable at publish time.
 */
export async function ensureFreshAccessToken(
  account: RefreshableAccount,
  bufferMs = 5 * 60 * 1000,
): Promise<string> {
  const expiringSoon =
    account.tokenExpires !== null &&
    account.tokenExpires.getTime() - Date.now() < bufferMs;

  if (expiringSoon && account.refreshToken) {
    const next = await refreshAccessToken(
      account.platform,
      decrypt(account.refreshToken),
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
      return next.accessToken;
    }
  }

  return decrypt(account.accessToken);
}
