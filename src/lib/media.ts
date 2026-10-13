import { ApiError } from "@/lib/api";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import {
  cueMediaKey,
  defaultStorage,
  deleteObjects,
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

/**
 * Removes files from Cue's own bucket once no post uses them. Call it after
 * deleting posts, with the URLs their media rows had, so the privacy policy's
 * "deleting a post or client removes its media" holds.
 *
 * Media URLs come from the caller (the token API accepts any), so two posts
 * can share a file, and a crafted post must never delete a file another post
 * or workspace still uses: a file goes only when no remaining row points at
 * it. Files in a workspace's own bucket are left to that workspace. Best
 * effort, like the admin workspace delete: a stray object is harmless, a
 * failed action is not.
 */
export async function removeUnusedMedia(urls: string[]): Promise<void> {
  const keys = [
    ...new Set(urls.map(cueMediaKey).filter((k): k is string => !!k)),
  ];
  if (!keys.length) return;
  try {
    // One object can be served from more than one host, so match on the key.
    const used = new Set<string | null>();
    for (let i = 0; i < keys.length; i += 200) {
      const rows = await prisma.mediaAsset.findMany({
        where: {
          OR: keys.slice(i, i + 200).map((k) => ({ url: { endsWith: `/${k}` } })),
        },
        select: { url: true },
      });
      for (const r of rows) used.add(cueMediaKey(r.url));
    }
    await deleteObjects(
      defaultStorage(),
      keys.filter((k) => !used.has(k)),
    );
  } catch (e) {
    console.error("[media] cleanup failed:", e);
  }
}
