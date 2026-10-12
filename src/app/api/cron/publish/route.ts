import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { publishDueTargets } from "@/lib/publish";
import { recordHeartbeat } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";
// Same ceiling as the "post now" route: a video upload needs more than the
// default, and a run killed mid-upload strands its target in PROCESSING.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await publishDueTargets();
    // The admin panel reads this to tell whether the publisher is alive.
    await recordHeartbeat("publish", true, { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordHeartbeat("publish", false, undefined, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
