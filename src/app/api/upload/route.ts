import { NextRequest, NextResponse } from "next/server";
import { requireWritableUser } from "@/lib/auth";
import { limitProblem } from "@/lib/plans";
import { getWorkspaceStorage, putObject } from "@/lib/storage";
import { uploadType } from "@/lib/media";
import { ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Legacy multipart upload: the bytes pass through this function, so it is
// bounded by the platform's ~4.5 MB request-body cap. Superseded by
// /api/upload/presign, which has the browser PUT straight to the bucket. Kept
// as a rollback path for a bucket whose CORS policy isn't right yet.
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

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Same allowlist as presign: the bucket is public, so the stored type matters.
  let kind: ReturnType<typeof uploadType>;
  try {
    kind = uploadType(file.name, file.type);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ApiError ? e.message : "Unsupported file" },
      { status: 400 },
    );
  }
  const key = `posts/${crypto.randomUUID()}.${kind.ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const storage = await getWorkspaceStorage(workspaceId);
  if (!storage.custom) {
    const overLimit = await limitProblem(workspaceId, "storageBytes", bytes.length);
    if (overLimit) return NextResponse.json({ error: overLimit }, { status: 403 });
  }

  let url: string;
  try {
    url = await putObject(storage, key, bytes, kind.mime);
  } catch (e) {
    console.error("[upload] storage rejected the file:", e);
    return NextResponse.json(
      { error: "Storage rejected the upload. An admin can test the connection in Settings." },
      { status: 502 },
    );
  }
  const isDoc = kind.type === "DOCUMENT";

  return NextResponse.json({
    url,
    storageKey: key,
    type: kind.type,
    // Original filename - LinkedIn requires a title for document posts.
    title: isDoc ? file.name.slice(0, 255) : undefined,
    sizeBytes: bytes.length,
  });
}
