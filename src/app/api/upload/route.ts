import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { uploadToR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Legacy multipart upload: the bytes pass through this function, so it is
// bounded by the platform's ~4.5 MB request-body cap. Superseded by
// /api/upload/presign, which has the browser PUT straight to R2. Kept as a
// rollback path while the bucket's CORS policy beds in.
export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "bin";
  const key = `posts/${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const url = await uploadToR2(
    key,
    bytes,
    file.type || "application/octet-stream",
  );
  const mime = file.type;
  const isDoc =
    mime === "application/pdf" ||
    mime.includes("presentation") ||
    mime.includes("msword") ||
    mime.includes("officedocument") ||
    /\.(pdf|ppt|pptx|doc|docx)$/i.test(file.name);
  const type = isDoc
    ? "DOCUMENT"
    : mime.startsWith("video")
      ? "VIDEO"
      : "IMAGE";

  return NextResponse.json({
    url,
    storageKey: key,
    type,
    // Original filename - LinkedIn requires a title for document posts.
    title: isDoc ? file.name : undefined,
  });
}
