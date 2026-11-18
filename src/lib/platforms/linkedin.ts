import type { PlatformAdapter, PublishInput, PublishResult } from "./types";
import { fetchMedia } from "./fetch-media";
import { LINKEDIN_VIDEO_MIN_BYTES } from "@/lib/linkedin-media";
import { validateByteRanges, uploadSidecars, type VideoSidecars } from "./linkedin-video";

// YYYYMM LinkedIn-Version header. 202506 is sunset - keep this current.
export const LINKEDIN_VERSION = "202606";
export const LINKEDIN_REST = "https://api.linkedin.com/rest";
const REST = LINKEDIN_REST;
// Images and documents are downloaded from storage before upload; a stalled
// download must fail its target, not hold up the whole publish run.
const FETCH_MEDIA_TIMEOUT_MS = 60_000;

// Videos: the download, each uploaded part, and how long to wait for
// LinkedIn to process the file before posting. Together they stay inside the
// 300 s publish function (publish.ts stops claiming targets at 200 s).
const FETCH_VIDEO_TIMEOUT_MS = 60_000;
const VIDEO_CALL_TIMEOUT_MS = 30_000;
const VIDEO_PART_TIMEOUT_MS = 60_000;
const VIDEO_PARTS_AT_ONCE = 4;
const VIDEO_WAIT = { attempts: 24, intervalMs: 5_000 };

function remaining(deadline: number, maximum: number) {
  const ms = deadline - Date.now();
  if (ms <= 0) throw new Error("LinkedIn video upload timed out.");
  return Math.min(maximum, ms);
}

function jsonHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

/**
 * Publishes to LinkedIn via the Posts API (/rest/posts). `externalId` is the
 * author URN: urn:li:person:… for a member's profile, urn:li:organization:…
 * for a Company Page (see src/lib/linkedin-pages.ts). Content type is chosen by what
 * the post carries, in this precedence:
 *   poll → article/link → document(PDF) → multi-image (2+) → single image →
 *   video → text.
 * Images come before a video so a post scheduled before video support (which
 * went out as images) still does; new posts can't mix them (linkedin-media.ts).
 */
export const linkedinAdapter: PlatformAdapter = {
  platform: "LINKEDIN",

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, externalId, body, article, poll } = input;
    const images = input.media.filter((m) => m.type === "IMAGE");
    const doc = input.media.find((m) => m.type === "DOCUMENT");
    const video = input.media.find((m) => m.type === "VIDEO");
    const options = input.options?.linkedin;

    let content: Record<string, unknown> | undefined;

    if (poll) {
      content = {
        poll: {
          question: poll.question,
          options: poll.options.map((text) => ({ text })),
          settings: { duration: poll.duration },
        },
      };
    } else if (article) {
      const thumbnail = input.cover ? await uploadAsset("images", externalId, accessToken, input.cover.url) : undefined;
      // LinkedIn does NOT scrape the URL - we pass title/description ourselves.
      content = {
        article: {
          source: article.source,
          ...(thumbnail ? { thumbnail } : {}),
          ...(article.title ? { title: article.title } : {}),
          ...(article.description ? { description: article.description } : {}),
        },
      };
    } else if (doc) {
      const id = await uploadDocument(externalId, accessToken, doc.url);
      content = { media: { title: doc.title ?? "Document", id } };
    } else if (images.length >= 2) {
      const urns = await Promise.all(
        images
          .slice(0, 20)
          .map((m) => uploadAsset("images", externalId, accessToken, m.url)),
      );
      content = { multiImage: { images: urns.map((id, i) => ({ id, ...(images[i].altText ? { altText: images[i].altText } : {}) })) } };
    } else if (images.length === 1) {
      const id = await uploadAsset(
        "images",
        externalId,
        accessToken,
        images[0].url,
      );
      content = { media: { id, ...(images[0].altText ? { altText: images[0].altText } : {}) } };
    } else if (video) {
      const deadline = Math.min(input.deadline ?? Infinity, Date.now() + 210_000);
      const file = await fetchMedia(video.url, remaining(deadline, FETCH_VIDEO_TIMEOUT_MS));
      const id = await uploadLinkedInVideo(
        externalId,
        accessToken,
        { ...file, url: video.url },
        VIDEO_WAIT,
        { captions: options?.captionsSrt, coverUrl: input.cover?.url },
        deadline,
      );
      content = { media: { id, ...(options?.videoTitle ? { title: options.videoTitle } : {}) } };
    }

    const postBody = {
      author: externalId,
      commentary: body,
      visibility: options?.visibility ?? "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: options?.disableReshares ?? false,
      ...(content ? { content } : {}),
    };

    if (input.deadline && Date.now() >= input.deadline) throw new Error("LinkedIn upload timed out before creating the post.");
    const res = await fetch(`${REST}/posts`, {
      signal: AbortSignal.timeout(Math.max(1, Math.min(30_000, (input.deadline ?? Date.now() + 30_000) - Date.now()))),
      method: "POST",
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(postBody),
    });
    if (!res.ok) {
      throw new Error(
        `LinkedIn publish failed (${res.status}): ${await res.text()}`,
      );
    }

    const postId =
      res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || "";
    return {
      externalPostId: postId,
      permalink: postId
        ? `https://www.linkedin.com/feed/update/${postId}/`
        : undefined,
    };
  },
};

/**
 * Uploads a file via the Images or Documents API (identical two-step flow) and
 * returns the created asset URN (urn:li:image:… or urn:li:document:…).
 */
async function uploadAsset(
  kind: "images" | "documents",
  ownerUrn: string,
  accessToken: string,
  fileUrl: string,
): Promise<string> {
  const initRes = await fetch(`${REST}/${kind}?action=initializeUpload`, {
    method: "POST",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
  });
  if (!initRes.ok) {
    throw new Error(
      `LinkedIn ${kind} init failed (${initRes.status}): ${await initRes.text()}`,
    );
  }
  const init = (await initRes.json()) as {
    value: { uploadUrl: string; image?: string; document?: string };
  };
  const urn = init.value.image ?? init.value.document ?? "";

  const { bytes } = await fetchMedia(fileUrl, FETCH_MEDIA_TIMEOUT_MS);
  const putRes = await fetch(init.value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: bytes,
  });
  if (!putRes.ok) {
    throw new Error(`LinkedIn ${kind} upload failed (${putRes.status})`);
  }
  return urn;
}

/** Uploads a document and waits for LinkedIn to finish processing it. */
async function uploadDocument(
  ownerUrn: string,
  accessToken: string,
  fileUrl: string,
): Promise<string> {
  const urn = await uploadAsset("documents", ownerUrn, accessToken, fileUrl);

  // Documents process asynchronously - poll until AVAILABLE before posting.
  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${REST}/documents/${encodeURIComponent(urn)}`, {
      headers: jsonHeaders(accessToken),
    });
    if (res.ok) {
      const { status } = (await res.json()) as { status?: string };
      if (status === "AVAILABLE") return urn;
      if (status === "PROCESSING_FAILED") {
        throw new Error("LinkedIn document processing failed");
      }
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return urn; // best-effort: proceed even if status never flipped
}

type VideoStatus = "WAITING_UPLOAD" | "PROCESSING" | "AVAILABLE" | "PROCESSING_FAILED";

/** LinkedIn takes MP4 only: say so before uploading anything else. */
function assertMp4(file: { contentType: string | null; url: string }) {
  const type = file.contentType?.split(";")[0].trim().toLowerCase() ?? "";
  const ext = new URL(file.url).pathname.split(".").pop()?.toLowerCase() ?? "";
  const mp4 = type === "video/mp4" || (!type.startsWith("video/") && ext === "mp4");
  if (!mp4) {
    throw new Error(
      `LinkedIn takes MP4 videos, and this file is ${type || `.${ext}`}. Export it as MP4 and upload it again.`,
    );
  }
}

/** Runs `fn` over the items with at most `limit` in flight, keeping their order. */
async function inOrder<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Uploads a video through LinkedIn's Videos API and returns its URN
 * (urn:li:video:…), once LinkedIn has processed it:
 *   initializeUpload (owner + size) → PUT each byte range LinkedIn asks for,
 *   keeping each part's ETag → finalizeUpload with the ETags in order →
 *   poll the video until AVAILABLE.
 * If processing is still going when the wait runs out, the URN is returned
 * anyway and the post is tried: LinkedIn refuses it if the video isn't ready,
 * and the target is retried on the next run.
 */
export async function uploadLinkedInVideo(
  ownerUrn: string,
  accessToken: string,
  file: { bytes: Uint8Array<ArrayBuffer>; contentType: string | null; url: string },
  wait = VIDEO_WAIT,
  sidecars: VideoSidecars = {},
  deadline = Date.now() + 210_000,
): Promise<string> {
  assertMp4(file);
  const size = file.bytes.byteLength;
  if (size < LINKEDIN_VIDEO_MIN_BYTES) {
    throw new Error("LinkedIn needs a video of at least 75 KB.");
  }

  if (size > 500 * 1024 * 1024) throw new Error("LinkedIn videos must be at most 500 MB.");

  const initRes = await fetch(`${REST}/videos?action=initializeUpload`, {
    method: "POST",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: ownerUrn,
        fileSizeBytes: size,
        uploadCaptions: !!sidecars.captions,
        uploadThumbnail: !!sidecars.coverUrl,
      },
    }),
    signal: AbortSignal.timeout(remaining(deadline, VIDEO_CALL_TIMEOUT_MS)),
  });
  if (!initRes.ok) {
    throw new Error(`LinkedIn video init failed (${initRes.status}): ${await initRes.text()}`);
  }
  const init = (await initRes.json()) as {
    value: {
      video: string;
      uploadToken?: string;
      captionsUploadUrl?: string;
      thumbnailUploadUrl?: string;
      uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[];
    };
  };
  const urn = init.value.video;
  const parts = init.value.uploadInstructions ?? [];
  if (!urn || !parts.length) throw new Error("LinkedIn video init returned no upload instructions.");

  validateByteRanges(parts, size);

  // Each part goes to its own signed URL. LinkedIn's samples send no
  // Authorization header; if a URL turns that down, try once with the token.
  const etags = await inOrder(parts, VIDEO_PARTS_AT_ONCE, async (part, i) => {
    const chunk = file.bytes.subarray(part.firstByte, part.lastByte + 1);
    const partUrl = new URL(part.uploadUrl);
    const canSendToken =
      partUrl.protocol === "https:" &&
      (partUrl.hostname === "linkedin.com" || partUrl.hostname.endsWith(".linkedin.com"));
    const put = (auth: boolean) =>
      fetch(part.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          ...(auth ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: chunk,
        redirect: "error",
        signal: AbortSignal.timeout(remaining(deadline, VIDEO_PART_TIMEOUT_MS)),
      });
    let res = await put(false);
    if (canSendToken && (res.status === 401 || res.status === 403)) res = await put(true);
    if (!res.ok) {
      throw new Error(`LinkedIn video upload failed on part ${i + 1} of ${parts.length} (${res.status})`);
    }
    const etag = res.headers.get("etag");
    if (!etag) throw new Error(`LinkedIn gave no ETag for video part ${i + 1}.`);
    return etag.replace(/^"|"$/g, "");
  });

  await uploadSidecars(init.value, sidecars, (limit) => remaining(deadline, limit));

  const finRes = await fetch(`${REST}/videos?action=finalizeUpload`, {
    method: "POST",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify({
      finalizeUploadRequest: { video: urn, uploadToken: init.value.uploadToken ?? "", uploadedPartIds: etags },
    }),
    signal: AbortSignal.timeout(remaining(deadline, VIDEO_CALL_TIMEOUT_MS)),
  });
  if (!finRes.ok) {
    throw new Error(`LinkedIn video finalize failed (${finRes.status}): ${await finRes.text()}`);
  }

  let last: VideoStatus | "no status yet" = "no status yet";
  for (let i = 0; i < wait.attempts; i++) {
    // Leave time to create the post if processing is still asynchronous.
    const statusBudget = Math.min(VIDEO_CALL_TIMEOUT_MS, deadline - Date.now() - 10_000);
    if (statusBudget <= 0) break;
    const res = await fetch(`${REST}/videos/${encodeURIComponent(urn)}`, {
      headers: jsonHeaders(accessToken),
      signal: AbortSignal.timeout(statusBudget),
    }).catch(() => null);
    if (!res || res.status === 401 || res.status === 403) break;
    if (res.ok) {
      const v = (await res.json()) as { status?: VideoStatus; processingFailureReason?: string };
      if (v.status === "AVAILABLE") return urn;
      if (v.status === "PROCESSING_FAILED") {
        throw new Error(
          `LinkedIn couldn't process the video${v.processingFailureReason ? `: ${v.processingFailureReason}` : ""}. It needs to be an MP4 between 3 seconds and 30 minutes.`,
        );
      }
      if (v.status) last = v.status;
    }
    if (i + 1 < wait.attempts) {
      await new Promise((r) => setTimeout(r, Math.min(wait.intervalMs, Math.max(0, deadline - Date.now() - 10_000))));
    }
  }
  console.warn(`[linkedin] video ${urn} still ${last} after processing check; posting anyway`);
  return urn;
}
