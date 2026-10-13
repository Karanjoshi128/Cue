import { NextRequest, NextResponse } from "next/server";
import { connectingUser } from "@/lib/oauth-guard";
import { prisma } from "@/lib/prisma";
import {
  listPostablePages,
  pendingCookies,
  stateCookie,
} from "@/lib/linkedin-pages";

export const dynamic = "force-dynamic";

/**
 * LinkedIn's redirect after the Page consent. Exchanges the code, lists the
 * Pages this member can post to, and hands both to the picker at
 * /clients/linkedin-pages in short-lived encrypted cookies. Nothing is saved
 * until the user assigns Pages to clients there.
 */
export async function GET(req: NextRequest) {
  const back = (error: string) => {
    const res = NextResponse.redirect(new URL(`/clients?error=${error}`, req.url));
    res.cookies.delete({ name: stateCookie.name, path: "/" });
    return res;
  };

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return back("linkedin_page_denied");

  let parsed: { clientId?: string; nonce?: string };
  try {
    parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    return back("linkedin_page_denied");
  }
  const expected = req.cookies.get(stateCookie.name)?.value;
  if (!parsed.clientId || !parsed.nonce || parsed.nonce !== expected) {
    return back("linkedin_page_expired");
  }

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
  res.cookies.delete({ name: stateCookie.name, path: "/" });
  res.cookies.set(
    pendingCookies.token,
    pendingCookies.encodeToken({
      userId: user.id,
      clientId: parsed.clientId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    }),
    pendingCookies.options,
  );
  res.cookies.set(pendingCookies.list, pendingCookies.encodeList(pages), pendingCookies.options);
  return res;
}
