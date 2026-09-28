import { ApiError } from "@/lib/api";
import { presignUpload, publicUrl } from "@/lib/r2";

// Ceiling so a presigned URL can't be used to dump arbitrarily large objects.
const MAX_BYTES = 512 * 1024 * 1024; // 512 MB

export interface PresignResult {
  uploadUrl: string;
  storageKey: string;
  url: string;
  type: "IMAGE" | "VIDEO" | "DOCUMENT";
  title?: string;
}

/**
 * Issues a short-lived presigned PUT so a client can upload directly to R2.
 * The bytes never pass through a function, which is what lifts the ~4.5 MB
 * platform cap on request bodies (see src/lib/r2.ts).
 *
 * Shared by the cookie-session route (/api/upload/presign) and the API route
 * (/api/v1/media/presign) so both return an identical response. Callers do
 * their own authentication first.
 *
 * The object key is generated here, never taken from the caller, so nobody can
 * target or overwrite an existing object.
 */
export async function presignMediaUpload(body: unknown): Promise<PresignResult> {
  const { filename, contentType, size } = (body ?? {}) as {
    filename?: unknown;
    contentType?: unknown;
    size?: unknown;
  };
  if (typeof filename !== "string" || !filename || typeof size !== "number") {
    throw new ApiError(400, "filename and size are required");
  }
  if (size <= 0) throw new ApiError(400, "File is empty");
  if (size > MAX_BYTES) {
    throw new ApiError(
      400,
      `File is too large (max ${MAX_BYTES / 1024 / 1024} MB).`,
    );
  }

  const mime =
    typeof contentType === "string" && contentType
      ? contentType
      : "application/octet-stream";
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

  return {
    uploadUrl: await presignUpload(key, mime),
    storageKey: key,
    url: publicUrl(key),
    type,
    // Original filename - LinkedIn requires a title for document posts.
    title: isDoc ? filename : undefined,
  };
}
