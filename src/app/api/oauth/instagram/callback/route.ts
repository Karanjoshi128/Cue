import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { connectingUser, returnPage } from "@/lib/oauth-guard";
import { encrypt } from "@/lib/crypto";
import {
  automationsEnabled,
  hasAutomationScopes,
  instagramScopes,
} from "@/lib/automations/config";
import { subscribeToWebhooks } from "@/lib/automations/instagram-api";

export const dynamic = "force-dynamic";

/**
 * The token response lists what was granted, as a string or an array. When it
 * doesn't, record what was asked for. Written on reconnect too: publish.ts
 * and the automations read it to tell what an account may do.
 */
function grantedScopes(permissions: unknown, requested: string[]): string {
  if (Array.isArray(permissions)) return permissions.join(",");
  if (typeof permissions === "string" && permissions) return permissions;
  return requested.join(",");
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(new URL("/clients?error=instagram_denied", req.url));
  }

  const { clientId, comments, automations, next } = JSON.parse(
    Buffer.from(state, "base64url").toString("utf8"),
  ) as { clientId: string; comments?: boolean; automations?: boolean; next?: string };

  // Defense-in-depth: `state` is unsigned, so re-verify workspace ownership.
  const user = await connectingUser(req, "instagram");
  if (user instanceof NextResponse) return user;
  const owned = await prisma.client.findFirst({
    where: { id: clientId, workspaceId: user.workspaceId },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.redirect(
      new URL("/clients?error=not_your_client", req.url),
    );
  }

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
  const short = (await shortRes.json()) as {
    access_token: string;
    user_id: number;
    permissions?: unknown;
  };
  const scopes = grantedScopes(short.permissions, instagramScopes({ comments, automations }));

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

  const account = await prisma.socialAccount.upsert({
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
      // A reconnect can add (or drop) comment access, so always record it.
      scopes,
    },
    create: {
      clientId,
      platform: "INSTAGRAM",
      externalId: String(me.user_id),
      displayName: `@${me.username}`,
      accessToken: encrypt(long.access_token),
      refreshToken: encrypt(long.access_token),
      tokenExpires: new Date(Date.now() + long.expires_in * 1000),
      scopes,
    },
    select: { id: true },
  });

  // Automations: ask Meta to send this account's comment and message webhooks.
  // Best effort. Until then (or if it fails) the every-minute check covers it.
  if (automationsEnabled() && hasAutomationScopes(scopes)) {
    try {
      await subscribeToWebhooks(long.access_token);
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { webhooksSubscribedAt: new Date() },
      });
    } catch (err) {
      console.error("[instagram] comment webhook subscription failed:", err);
    }
  }

  return NextResponse.redirect(
    new URL(`${returnPage(next)}?connected=instagram`, req.url),
  );
}
