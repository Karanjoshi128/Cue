import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(new URL("/clients?error=instagram_denied", req.url));
  }

  const { clientId } = JSON.parse(
    Buffer.from(state, "base64url").toString("utf8"),
  ) as { clientId: string };

  const redirectUri = `${process.env.APP_URL ?? req.nextUrl.origin}/api/oauth/instagram/callback`;

  // 1. Short-lived token.
  const shortRes = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.META_APP_ID ?? "",
      client_secret: process.env.META_APP_SECRET ?? "",
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!shortRes.ok) {
    return NextResponse.redirect(new URL("/clients?error=instagram_token", req.url));
  }
  const short = (await shortRes.json()) as { access_token: string; user_id: number };

  // 2. Exchange for a long-lived token (~60 days).
  const longRes = await fetch(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.META_APP_SECRET}&access_token=${short.access_token}`,
  );
  if (!longRes.ok) {
    return NextResponse.redirect(new URL("/clients?error=instagram_token", req.url));
  }
  const long = (await longRes.json()) as {
    access_token: string;
    expires_in: number;
  };

  // 3. Profile (username + id).
  const meRes = await fetch(
    `https://graph.instagram.com/me?fields=user_id,username&access_token=${long.access_token}`,
  );
  if (!meRes.ok) {
    return NextResponse.redirect(new URL("/clients?error=instagram_profile", req.url));
  }
  const me = (await meRes.json()) as { user_id: string; username: string };

  await prisma.socialAccount.upsert({
    where: {
      clientId_platform_externalId: {
        clientId,
        platform: "INSTAGRAM",
        externalId: String(me.user_id),
      },
    },
    update: {
      accessToken: encrypt(long.access_token),
      refreshToken: encrypt(long.access_token), // IG refreshes the same token
      tokenExpires: new Date(Date.now() + long.expires_in * 1000),
      displayName: `@${me.username}`,
    },
    create: {
      clientId,
      platform: "INSTAGRAM",
      externalId: String(me.user_id),
      displayName: `@${me.username}`,
      accessToken: encrypt(long.access_token),
      refreshToken: encrypt(long.access_token),
      tokenExpires: new Date(Date.now() + long.expires_in * 1000),
      scopes: "instagram_business_basic,instagram_business_content_publish",
    },
  });

  return NextResponse.redirect(new URL("/clients?connected=instagram", req.url));
}
