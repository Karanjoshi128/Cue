import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { runMailer } from "@/lib/mailer/runner";
import { recordHeartbeat } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";
// A run sends for up to ~45 s; leave room to finish its bookkeeping.
export const maxDuration = 120;

// Called every minute by Supabase pg_cron (docs/mailer.md has the SQL).
export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runMailer();
    await recordHeartbeat("mailer", true, { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordHeartbeat("mailer", false, undefined, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
