import { NextRequest, NextResponse } from "next/server";
import { connectingUser, endOAuthState, readOAuthState } from "@/lib/oauth-guard";
import { prisma } from "@/lib/prisma";
import {
  listPostablePages,
  pendingCookies,
} from "@/lib/linkedin-pages";

export const dynamic = "force-dynamic";

/**
 * LinkedIn's redirect after the Page consent. Exchanges the code, lists the
 * Pages this member can post to, and hands both to the picker at
 * /clients/linkedin-pages in short-lived encrypted cookies. Nothing is saved
 * until the user assigns Pages to clients there.
 */
export async function GET(req: NextRequest) {
  // Every exit drops the nonce cookie, so a callback link works only once.
  return endOAuthState(await connect(req), "linkedin-page");
}

async function connect(req: NextRequest): Promise<NextResponse> {
  const back = (error: string) =>
    NextResponse.redirect(new URL(`/clients?error=${error}`, req.url));

  const code = req.nextUrl.searchParams.get("code");
  if (!code || !req.nextUrl.searchParams.get("state")) return back("linkedin_page_denied");
  // Refused unless this browser started the flow (see startOAuthState).
  const parsed = readOAuthState(req, "linkedin-page");
  if (!parsed) return back("linkedin_page_expired");

  const user = await connectingUser(req, "linkedin");
  if (user instanceof NextResponse) return user;
  const owned = await prisma.client.findFirst({
    where: { id: parsed.clientId, workspaceId: user.workspaceId },
    select: { id: true },
  });
  if (!owned) return back("not_your_client");

  const redirectUri = `${process.env.APP_URL ?? req.nextUrl.origin}/api/oauth/linkedin-page/callback`;
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_PAGES_CLIENT_ID ?? "",
      client_secret: process.env.LINKEDIN_PAGES_CLIENT_SECRET ?? "",
    }),
  });
  if (!tokenRes.ok) return back("linkedin_page_token");
  const token = (await tokenRes.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  let pages;
  try {
    pages = await listPostablePages(token.access_token);
  } catch (e) {
    console.error("[linkedin-page] listing Pages failed:", e);
    return back("linkedin_page_list");
  }
  if (pages.length === 0) return back("linkedin_no_pages");

  const res = NextResponse.redirect(new URL("/clients/linkedin-pages", req.url));
  res.cookies.set(
    pendingCookies.token,
    pendingCookies.encodeToken({
      userId: user.id,
      clientId: parsed.clientId,
      issuedAt: Date.now(),
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    }),
    pendingCookies.options,
  );
  res.cookies.set(pendingCookies.list, pendingCookies.encodeList(pages), pendingCookies.options);
  return res;
}
