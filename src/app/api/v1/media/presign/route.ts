import { NextResponse } from "next/server";
import { apiErrorResponse, readJson, requireApiUser } from "@/lib/api";
import { presignMediaUpload } from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/media/presign - a short-lived presigned PUT for uploading a file
 * straight to the workspace's storage (its own bucket if an admin connected
 * one in Settings, otherwise Cue's). Same function, and so the same response, as the composer's
 * /api/upload/presign. The caller then PUTs the bytes to `uploadUrl` and passes
 * `{ type, url, storageKey, title }` in the post's `media`.
 */
export async function POST(req: Request) {
  try {
    const { workspaceId } = await requireApiUser(req);
    return NextResponse.json(
      await presignMediaUpload(workspaceId, await readJson(req)),
    );
  } catch (e) {
    return apiErrorResponse(e);
  }
}
