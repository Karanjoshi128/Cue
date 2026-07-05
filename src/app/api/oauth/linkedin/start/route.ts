import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Kicks off LinkedIn OAuth. clientId (our Client) is carried in `state`.
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
  if (!process.env.LINKEDIN_CLIENT_ID) {
    return NextResponse.redirect(
      new URL("/clients?error=linkedin_not_configured", req.url),
    );
  }

  const redirectUri = `${process.env.APP_URL ?? req.nextUrl.origin}/api/oauth/linkedin/callback`;
  const state = Buffer.from(JSON.stringify({ clientId })).toString("base64url");

  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.LINKEDIN_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "openid profile email w_member_social");

  return NextResponse.redirect(url.toString());
}
