import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/lib/platform-settings";
import { replyDeskEnabled } from "@/lib/reply-desk/config";
import { syncReplyDesk } from "@/lib/reply-desk/sync";

export const dynamic = "force-dynamic";
// Called every 5 minutes by Supabase pg_cron (SQL in docs/instagram-automations.md).
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!replyDeskEnabled()) return NextResponse.json({ ok: true, skipped: true });
  try {
    const result = await syncReplyDesk();
    await recordHeartbeat("reply-desk", true, { ...result, errors: result.errors.slice(0, 5) });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordHeartbeat("reply-desk", false, undefined, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
