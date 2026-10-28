import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { MAX_ATTEMPTS, publishDueTargets } from "@/lib/publish";
import { recordHeartbeat } from "@/lib/platform-settings";
import { pruneAlertLog, runPublishAlerts } from "@/lib/alerts";

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
    // Email admins about posts that failed for good and accounts about to
    // expire. Bookkeeping: an alert problem must never fail the publish run.
    const alerts = await runPublishAlerts(MAX_ATTEMPTS).catch((err) => {
      console.error("[alerts] publish alerts failed:", err);
      return null;
    });
    await pruneAlertLog().catch(() => {});
    return NextResponse.json({ ok: true, ...result, alerts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordHeartbeat("publish", false, undefined, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
