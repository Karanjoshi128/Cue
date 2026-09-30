import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { publishDueTargets } from "@/lib/publish";

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
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
