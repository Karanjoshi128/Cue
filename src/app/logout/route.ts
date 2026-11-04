import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Cue's own pages link here, and a typed or bookmarked URL is fine too.
  // A link or redirect from another site isn't: any page could otherwise
  // sign visitors out of Cue on every device. Browsers say which it is.
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  // ?next= lets the invite page send a wrong-account visitor back to sign in.
  const next = safeNext(req.nextUrl.searchParams.get("next")) ?? "/login";
  return NextResponse.redirect(new URL(next, req.url));
}
