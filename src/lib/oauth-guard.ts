import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { User } from "@prisma/client";
import { getAuth } from "@/lib/auth";
import { workspaceHasFeature, type FeatureKey } from "@/lib/plans";

type OAuthFlow = "linkedin" | "linkedin-page" | "instagram" | "youtube";

// Every connect flow carries a random nonce in `state` and in a cookie set
// when the flow starts. A callback is accepted only when the two match, which
// proves the browser finishing the flow is the one that began it. Without
// that, anyone could consent with their own account and send a member the
// callback link, attaching the sender's channel to that member's client.
const stateSchema = z.object({
  clientId: z.string().min(1).max(100),
  nonce: z.string().min(16).max(64),
  // YouTube only: also asked for the comment scope (see youtube/start).
  comments: z.boolean().optional(),
});
export type OAuthState = z.infer<typeof stateSchema>;

const stateCookie = (flow: OAuthFlow) => `cue_oauth_${flow.replace("-", "_")}`;
const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  // Only the connect routes ever read it.
  path: "/api/oauth",
  maxAge: 10 * 60,
};

/**
 * The `state` for a new connect flow, plus `attach`, which sets the matching
 * cookie on the redirect to the provider.
 */
export function startOAuthState(flow: OAuthFlow, data: Omit<OAuthState, "nonce">) {
  const nonce = crypto.randomBytes(16).toString("base64url");
  const state = Buffer.from(JSON.stringify({ ...data, nonce })).toString("base64url");
  return {
    state,
    attach(res: NextResponse): NextResponse {
      res.cookies.set(stateCookie(flow), nonce, STATE_COOKIE_OPTIONS);
      return res;
    },
  };
}

/**
 * The callback's `state`, or null when it's malformed or this browser didn't
 * start the flow. Callers clear the cookie (endOAuthState) on every response,
 * so each nonce works once.
 */
export function readOAuthState(req: NextRequest, flow: OAuthFlow): OAuthState | null {
  const raw = req.nextUrl.searchParams.get("state");
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const result = stateSchema.safeParse(parsed);
  if (!result.success) return null;
  const expected = req.cookies.get(stateCookie(flow))?.value;
  return expected && expected === result.data.nonce ? result.data : null;
}

/** Drops the flow's nonce cookie from a callback response. */
export function endOAuthState(res: NextResponse, flow: OAuthFlow): NextResponse {
  res.cookies.delete({ name: stateCookie(flow), path: STATE_COOKIE_OPTIONS.path });
  return res;
}

/**
 * The member connecting a social account, or the redirect to send instead:
 * to sign in, or back to Clients when the platform is switched off for the
 * workspace or a platform admin is only viewing it.
 */
export async function connectingUser(
  req: NextRequest,
  platform: Extract<FeatureKey, "linkedin" | "instagram" | "youtube">,
): Promise<User | NextResponse> {
  const { user, viewAs } = await getAuth();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (viewAs) {
    return NextResponse.redirect(new URL("/clients?error=read_only", req.url));
  }
  if (!(await workspaceHasFeature(user.workspaceId, platform))) {
    return NextResponse.redirect(new URL("/clients?error=platform_disabled", req.url));
  }
  return user;
}
