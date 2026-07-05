import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Instagram API with Instagram Login (no Facebook Page required).
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }
  // Only a member may connect an account to a client in their own workspace.
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
  if (!process.env.META_APP_ID) {
    return NextResponse.redirect(
      new URL("/clients?error=instagram_not_configured", req.url),
    );
  }

  const redirectUri = `${process.env.APP_URL ?? req.nextUrl.origin}/api/oauth/instagram/callback`;
  const state = Buffer.from(JSON.stringify({ clientId })).toString("base64url");

  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", process.env.META_APP_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    "instagram_business_basic,instagram_business_content_publish",
  );
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
