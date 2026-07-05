import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(new URL("/clients?error=linkedin_denied", req.url));
  }

  const { clientId } = JSON.parse(
    Buffer.from(state, "base64url").toString("utf8"),
  ) as { clientId: string };

  const redirectUri = `${process.env.APP_URL ?? req.nextUrl.origin}/api/oauth/linkedin/callback`;

  // Exchange code for an access token.
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    }),
  });
  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/clients?error=linkedin_token", req.url));
  }
  const token = (await tokenRes.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  };

  // Identify the member (author URN).
  const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) {
    return NextResponse.redirect(new URL("/clients?error=linkedin_profile", req.url));
  }
  const me = (await meRes.json()) as { sub: string; name?: string };
  if (!me.sub) {
    return NextResponse.redirect(new URL("/clients?error=linkedin_profile", req.url));
  }

  await prisma.socialAccount.upsert({
    where: {
      clientId_platform_externalId: {
        clientId,
        platform: "LINKEDIN",
        externalId: `urn:li:person:${me.sub}`,
      },
    },
    update: {
      accessToken: encrypt(token.access_token),
      refreshToken: token.refresh_token ? encrypt(token.refresh_token) : null,
      tokenExpires: new Date(Date.now() + token.expires_in * 1000),
      displayName: me.name ?? "LinkedIn",
    },
    create: {
      clientId,
      platform: "LINKEDIN",
      externalId: `urn:li:person:${me.sub}`,
      displayName: me.name ?? "LinkedIn",
      accessToken: encrypt(token.access_token),
      refreshToken: token.refresh_token ? encrypt(token.refresh_token) : null,
      tokenExpires: new Date(Date.now() + token.expires_in * 1000),
      scopes: "openid profile email w_member_social",
    },
  });

  return NextResponse.redirect(new URL("/clients?connected=linkedin", req.url));
}
