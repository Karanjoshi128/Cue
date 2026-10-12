import { NextRequest, NextResponse } from "next/server";
import { requireWritableUser } from "@/lib/auth";
import { apiErrorResponse, readJson } from "@/lib/api";
import { presignMediaUpload } from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * Presigned upload to the workspace's storage, for the composer (cookie
 * session). The logic lives in
 * presignMediaUpload(), shared with /api/v1/media/presign, so the browser and
 * API callers get byte-for-byte the same response.
 */
export async function POST(req: NextRequest) {
  let workspaceId: string;
  try {
    ({ workspaceId } = await requireWritableUser());
  } catch (e) {
    const readOnly = e instanceof Error && e.message !== "UNAUTHENTICATED";
    return NextResponse.json(
      { error: readOnly ? e.message : "Unauthorized" },
      { status: readOnly ? 403 : 401 },
    );
  }

  try {
    return NextResponse.json(
      await presignMediaUpload(workspaceId, await readJson(req)),
    );
  } catch (e) {
    return apiErrorResponse(e);
  }
}
