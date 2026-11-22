import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { runMediaRetention } from "@/lib/media-retention";
import { recordHeartbeat } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Deletes videos 7 days after their post went live (src/lib/media-retention.ts).
// Called hourly by Supabase pg_cron; docs/media-retention.md has the SQL.
export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runMediaRetention();
    await recordHeartbeat("media-retention", true, { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordHeartbeat("media-retention", false, undefined, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
