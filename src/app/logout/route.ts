import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  // ?next= lets the invite page send a wrong-account visitor back to sign in.
  const next = safeNext(req.nextUrl.searchParams.get("next")) ?? "/login";
  return NextResponse.redirect(new URL(next, req.url));
}
