import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiErrorResponse, readJson } from "@/lib/api";
import { presignMediaUpload } from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * Presigned R2 upload for the composer (cookie session). The logic lives in
 * presignMediaUpload(), shared with /api/v1/media/presign, so the browser and
 * API callers get byte-for-byte the same response.
 */
export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await presignMediaUpload(await readJson(req)));
  } catch (e) {
    return apiErrorResponse(e);
  }
}
