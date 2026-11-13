import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { runAutomations } from "@/lib/automations/cron";
import { recordHeartbeat } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";
// Called every 5 minutes by Supabase pg_cron (SQL in docs/instagram-automations.md).
// runAutomations stops starting work at 45 s, well before this.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runAutomations();
    if (!("skipped" in result)) {
      await recordHeartbeat("automations", true, { ...result });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordHeartbeat("automations", false, undefined, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
