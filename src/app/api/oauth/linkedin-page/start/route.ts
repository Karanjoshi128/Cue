import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectingUser } from "@/lib/oauth-guard";
import { prisma } from "@/lib/prisma";
import { linkedinPagesConfigured, PAGE_SCOPES, stateCookie } from "@/lib/linkedin-pages";

export const dynamic = "force-dynamic";

// Kicks off LinkedIn OAuth for Company Pages, on the separate Community
// Management app. The client card it started from rides in `state`, with a
// nonce the callback checks against a cookie so a forged callback can't
// slip someone else's Pages into this workspace.
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }
  const user = await connectingUser(req, "linkedin");
  if (user instanceof NextResponse) return user;
  const owned = await prisma.client.findFirst({
    where: { id: clientId, workspaceId: user.workspaceId },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.redirect(new URL("/clients?error=not_your_client", req.url));
  }
  if (!linkedinPagesConfigured()) {
    return NextResponse.redirect(
      new URL("/clients?error=linkedin_pages_not_configured", req.url),
    );
  }

  const nonce = crypto.randomBytes(16).toString("base64url");
  const redirectUri = `${process.env.APP_URL ?? req.nextUrl.origin}/api/oauth/linkedin-page/callback`;
  const state = Buffer.from(JSON.stringify({ clientId, nonce })).toString("base64url");

  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.LINKEDIN_PAGES_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", PAGE_SCOPES);

  const res = NextResponse.redirect(url.toString());
  res.cookies.set(stateCookie.name, nonce, stateCookie.options);
  return res;
}
