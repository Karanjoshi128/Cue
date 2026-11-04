import { ApiError } from "@/lib/api";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import {
  cueMediaBases,
  cueMediaKey,
  defaultStorage,
  deleteObjects,
  getWorkspaceStorage,
  objectUrl,
  presignPut,
} from "@/lib/storage";
import { limitProblem } from "@/lib/plans";

// Ceiling so a presigned URL can't be used to dump arbitrarily large objects.
// Also the most the publisher will download when a post goes live.
export const MAX_BYTES = 512 * 1024 * 1024; // 512 MB

/** The shape of every key presign hands out: posts/<uuid>.<ext>. */
export const MEDIA_KEY = /^posts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,10}$/i;

// What can be uploaded, by MIME type, and the extension each is stored under.
// The bucket is public and serves a file with the type it was uploaded as, so
// anything else (HTML, SVG, scripts) would be a web page hosted under Cue's
// name. The type is signed into the upload URL, so the bytes can't arrive
// labelled as something else.
const UPLOAD_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
  "video/x-msvideo": "avi",
  "video/x-matroska": "mkv",
  "video/mpeg": "mpeg",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

// For a file the browser couldn't type (some send "" for .pptx or .docx).
const TYPE_BY_EXTENSION: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(UPLOAD_TYPES)
      .filter(([mime]) => mime !== "image/jpg")
      .map(([mime, ext]) => [ext, mime]),
  ),
  jpeg: "image/jpeg",
};

/**
 * The MIME type, stored extension and post media type for an upload, or a
 * 400 if the file isn't an image, video or supported document.
 */
export function uploadType(
  filename: string,
  contentType: unknown,
): { mime: string; ext: string; type: "IMAGE" | "VIDEO" | "DOCUMENT" } {
  const declared =
    typeof contentType === "string" ? contentType.split(";")[0].trim().toLowerCase() : "";
  const fromName = TYPE_BY_EXTENSION[filename.split(".").pop()?.toLowerCase() ?? ""];
  const mime = UPLOAD_TYPES[declared]
    ? declared
    : !declared || declared === "application/octet-stream"
      ? fromName
      : undefined;
  if (!mime) {
    throw new ApiError(
      400,
      "That file type isn't supported. Upload an image, a video, or a PDF, Word or PowerPoint file.",
    );
  }
  const type = mime.startsWith("video/") ? "VIDEO" : mime.startsWith("image/") ? "IMAGE" : "DOCUMENT";
  return { mime, ext: UPLOAD_TYPES[mime], type };
}

export interface PresignResult {
  uploadUrl: string;
  /** The Content-Type the PUT to uploadUrl must send; it's signed in. */
  contentType: string;
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
  if (filename.length > 255) throw new ApiError(400, "filename is too long");
  if (size <= 0) throw new ApiError(400, "File is empty");
  if (size > MAX_BYTES) {
    throw new ApiError(
      400,
      `File is too large (max ${MAX_BYTES / 1024 / 1024} MB).`,
    );
  }

  const { mime, ext, type } = uploadType(filename, contentType);
  const key = `posts/${crypto.randomUUID()}.${ext}`;
  const isDoc = type === "DOCUMENT";

  const storage = await getWorkspaceStorage(workspaceId);
  // Plans cap what's kept in Cue's bucket; a workspace's own bucket is theirs.
  if (!storage.custom) {
    const overLimit = await limitProblem(workspaceId, "storageBytes", size);
    if (overLimit) throw new ApiError(403, overLimit);
  }
  return {
    // The declared size and type are signed in, so they're also exactly what
    // gets stored: the PUT must send this Content-Type.
    uploadUrl: await presignPut(storage, key, mime, 300, size),
    contentType: mime,
    storageKey: key,
    url: objectUrl(storage, key),
    type,
    // Original filename - LinkedIn requires a title for document posts.
    title: isDoc ? filename.slice(0, 255) : undefined,
    sizeBytes: size,
  };
}

/**
 * Refuses media that isn't this workspace's own upload: the key presign
 * generated, at the public URL of the workspace's storage or Cue's bucket.
 * The URL is what Cue's servers download when the post goes live and what
 * teammates' browsers load in previews, so it can't be the caller's choice.
 */
export async function assertWorkspaceMedia(
  workspaceId: string,
  items: { url: string; storageKey: string }[] | undefined,
): Promise<void> {
  if (!items?.length) return;
  const storage = await getWorkspaceStorage(workspaceId);
  const bases = new Set([storage.publicUrl, ...cueMediaBases()]);
  for (const m of items) {
    const suffix = `/${m.storageKey}`;
    const base = m.url.endsWith(suffix) ? m.url.slice(0, -suffix.length) : null;
    if (!base || !bases.has(base)) {
      throw new ApiError(
        400,
        "Media must be uploaded through Cue first: send the url and storageKey that media/presign returned.",
      );
    }
  }
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
