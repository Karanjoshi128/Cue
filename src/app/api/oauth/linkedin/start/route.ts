import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Kicks off LinkedIn OAuth. clientId (our Client) is carried in `state`.
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
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
