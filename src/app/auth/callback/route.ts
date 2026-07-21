import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Don't silently bounce to "/" (which just loops back to /login).
      // Surface the reason so a failed magic link is diagnosable.
      console.error("[auth/callback] code exchange failed:", error.message);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, req.url),
      );
    }
  }
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
