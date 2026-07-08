import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(new URL("/clients?error=youtube_denied", req.url));
  }

  const { clientId } = JSON.parse(
    Buffer.from(state, "base64url").toString("utf8"),
  ) as { clientId: string };

  // Defense-in-depth: `state` is unsigned, so re-verify workspace ownership.
  const { user } = await getAuth();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const owned = await prisma.client.findFirst({
    where: { id: clientId, workspaceId: user.workspaceId },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.redirect(
      new URL("/clients?error=not_your_client", req.url),
    );
  }

  const redirectUri = `${process.env.APP_URL ?? req.nextUrl.origin}/api/oauth/youtube/callback`;

  // Exchange code for tokens.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  });
  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/clients?error=youtube_token", req.url));
  }
  const token = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  // Identify the Google account (openid/email/profile).
  const meRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) {
    return NextResponse.redirect(new URL("/clients?error=youtube_profile", req.url));
  }
  const me = (await meRes.json()) as {
    sub: string;
    email?: string;
    name?: string;
  };
  if (!me.sub) {
    return NextResponse.redirect(new URL("/clients?error=youtube_profile", req.url));
  }

  const displayName = me.name ?? me.email ?? "YouTube";
  const tokenExpires = new Date(Date.now() + token.expires_in * 1000);

  await prisma.socialAccount.upsert({
    where: {
      clientId_platform_externalId: {
        clientId,
        platform: "YOUTUBE",
        externalId: me.sub,
      },
    },
    update: {
      accessToken: encrypt(token.access_token),
      // Google only returns a refresh token on first consent - keep the old one
      // if this grant didn't include a new one.
      ...(token.refresh_token
        ? { refreshToken: encrypt(token.refresh_token) }
        : {}),
      tokenExpires,
      displayName,
    },
    create: {
      clientId,
      platform: "YOUTUBE",
      externalId: me.sub,
      displayName,
      accessToken: encrypt(token.access_token),
      refreshToken: token.refresh_token ? encrypt(token.refresh_token) : null,
      tokenExpires,
      scopes: "youtube.upload openid email profile",
    },
  });

  return NextResponse.redirect(new URL("/clients?connected=youtube", req.url));
}
