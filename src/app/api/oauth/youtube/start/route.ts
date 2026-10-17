import { NextRequest, NextResponse } from "next/server";
import { connectingUser } from "@/lib/oauth-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Kicks off Google OAuth for YouTube. clientId (our Client) is carried in `state`.
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }
  // Only a member may connect an account to a client in their own workspace.
  const user = await connectingUser(req, "youtube");
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
  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.redirect(
      new URL("/clients?error=youtube_not_configured", req.url),
    );
  }

  const redirectUri = `${process.env.APP_URL ?? req.nextUrl.origin}/api/oauth/youtube/callback`;
  // ?comments=1 also asks for youtube.force-ssl, which first comments need
  // (commentThreads.insert). It's opt-in: Google verified the app for
  // youtube.upload alone, and a default connect must stay on that verified
  // scope set rather than show every client the unverified-app warning.
  const comments = req.nextUrl.searchParams.get("comments") === "1";
  const state = Buffer.from(JSON.stringify({ clientId, comments })).toString("base64url");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/youtube.upload" +
      (comments ? " https://www.googleapis.com/auth/youtube.force-ssl" : "") +
      " openid email profile",
  );
  // offline + consent so Google returns a refresh token for scheduled uploads.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
