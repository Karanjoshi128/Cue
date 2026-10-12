import { ApiError } from "@/lib/api";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import {
  cueMediaKey,
  defaultStorage,
  getWorkspaceStorage,
  objectUrl,
  presignPut,
} from "@/lib/storage";
import { limitProblem } from "@/lib/plans";

// Ceiling so a presigned URL can't be used to dump arbitrarily large objects.
const MAX_BYTES = 512 * 1024 * 1024; // 512 MB

export interface PresignResult {
  uploadUrl: string;
  storageKey: string;
  url: string;
  type: "IMAGE" | "VIDEO" | "DOCUMENT";
  title?: string;
  /** Pass back in the post's media item, so it counts toward storage. */
  sizeBytes: number;
}

/**
 * Issues a short-lived presigned PUT so a client can upload directly to the
 * workspace's storage: its own bucket if an admin connected one, otherwise
 * Cue's default R2 bucket. The bytes never pass through a function, which is
 * what lifts the ~4.5 MB platform cap on request bodies (see src/lib/storage.ts).
 *
 * Shared by the cookie-session route (/api/upload/presign) and the API route
 * (/api/v1/media/presign) so both return an identical response. Callers do
 * their own authentication first.
 *
 * The object key is generated here, never taken from the caller, so nobody can
 * target or overwrite an existing object.
 */
export async function presignMediaUpload(
  workspaceId: string,
  body: unknown,
): Promise<PresignResult> {
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

  const storage = await getWorkspaceStorage(workspaceId);
  // Plans cap what's kept in Cue's bucket; a workspace's own bucket is theirs.
  if (!storage.custom) {
    const overLimit = await limitProblem(workspaceId, "storageBytes", size);
    if (overLimit) throw new ApiError(403, overLimit);
  }
  return {
    // The declared size is signed in, so it's also exactly what gets stored.
    uploadUrl: await presignPut(storage, key, mime, 300, size),
    storageKey: key,
    url: objectUrl(storage, key),
    type,
    // Original filename - LinkedIn requires a title for document posts.
    title: isDoc ? filename : undefined,
    sizeBytes: size,
  };
}

/**
 * The real size of each media item stored in Cue's own bucket, read from the
 * bucket rather than taken from the caller, since it counts toward the plan.
 * Items elsewhere (a workspace's own bucket) keep what they were given.
 */
export async function measureMedia<T extends { url: string; sizeBytes?: number }>(
  items: T[] | undefined,
): Promise<T[] | undefined> {
  if (!items?.length) return items;
  const cue = defaultStorage();
  return Promise.all(
    items.map(async (m) => {
      const key = cueMediaKey(m.url);
      if (!key) return m;
      try {
        const head = await cue.client.send(
          new HeadObjectCommand({ Bucket: cue.bucket, Key: key }),
        );
        return { ...m, sizeBytes: head.ContentLength ?? undefined };
      } catch {
        // Not uploaded (or gone): nothing stored, so nothing to count.
        return { ...m, sizeBytes: undefined };
      }
    }),
  );
}
