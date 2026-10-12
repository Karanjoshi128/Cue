import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@prisma/client";
import { getAuth } from "@/lib/auth";
import { workspaceHasFeature, type FeatureKey } from "@/lib/plans";

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
