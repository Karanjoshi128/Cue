import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { presignUpload, publicUrl } from "@/lib/r2";

export const dynamic = "force-dynamic";

// Ceiling so a presigned URL can't be used to dump arbitrarily large objects.
const MAX_BYTES = 512 * 1024 * 1024; // 512 MB

/**
 * Issues a short-lived presigned PUT so the browser can upload directly to R2.
 * The bytes never pass through this function, which is what lifts the ~4.5 MB
 * platform cap on request bodies (see src/lib/r2.ts).
 *
 * The object key is generated here, never taken from the client, so a caller
 * can't target or overwrite an existing object.
 */
export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { filename?: string; contentType?: string; size?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { filename, contentType, size } = body;
  if (!filename || typeof size !== "number") {
    return NextResponse.json(
      { error: "filename and size are required" },
      { status: 400 },
    );
  }
  if (size <= 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File is too large (max ${MAX_BYTES / 1024 / 1024} MB).` },
      { status: 400 },
    );
  }

  const mime = contentType || "application/octet-stream";
  const ext = filename.split(".").pop() ?? "bin";
  const key = `posts/${crypto.randomUUID()}.${ext}`;

  // Same classification the legacy multipart route used.
  const isDoc =
    mime === "application/pdf" ||
    mime.includes("presentation") ||
    mime.includes("msword") ||
    mime.includes("officedocument") ||
    /\.(pdf|ppt|pptx|doc|docx)$/i.test(filename);
  const type = isDoc ? "DOCUMENT" : mime.startsWith("video") ? "VIDEO" : "IMAGE";

  const uploadUrl = await presignUpload(key, mime);

  return NextResponse.json({
    uploadUrl,
    storageKey: key,
    url: publicUrl(key),
    type,
    // Original filename - LinkedIn requires a title for document posts.
    title: isDoc ? filename : undefined,
  });
}
