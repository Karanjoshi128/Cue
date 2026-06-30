import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { uploadToR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Accepts a multipart file, stores it in R2, returns its public URL + key.
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

  const url = await uploadToR2(key, bytes, file.type || "application/octet-stream");
  const type = file.type.startsWith("video") ? "VIDEO" : "IMAGE";

  return NextResponse.json({ url, storageKey: key, type });
}
