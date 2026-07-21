import type { PlatformAdapter, PublishInput, PublishResult } from "./types";

// Resumable upload endpoint for videos.insert. `part` lists the resource parts
// we send: snippet (title/description/category) + status (privacy).
const UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

/**
 * Publishes to YouTube via the Data API v3 `videos.insert` resumable flow.
 * The video is uploaded to the channel of whichever Google account authorized
 * the token, so `externalId` (the Google user id) isn't needed for the upload.
 *
 * `accessToken` must be fresh - Google tokens live ~1h, so publish.ts refreshes
 * it via ensureFreshAccessToken() right before calling this.
 */
export const youtubeAdapter: PlatformAdapter = {
  platform: "YOUTUBE",

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, body, title, privacy } = input;
    const video = input.media.find((m) => m.type === "VIDEO");
    if (!video) {
      throw new Error("YouTube requires a video to upload.");
    }

    // Title: required, max 100 chars, and may not contain < or >.
    const safeTitle = (title?.trim() || firstLine(body) || "Untitled")
      .replace(/[<>]/g, "")
      .slice(0, 100);
    const description = body.slice(0, 5000);
    const privacyStatus = privacy ?? "public";

    // Pull the video bytes from R2 (public URL). Buffered in full - fine for the
    // short-form videos this tool posts; revisit if very large files appear.
    const fileRes = await fetch(video.url);
    if (!fileRes.ok) {
      throw new Error(`Could not fetch video (${fileRes.status})`);
    }
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    const contentType = fileRes.headers.get("content-type") || "video/*";

    // 1. Open a resumable session - the upload URL comes back in `Location`.
    const initRes = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": contentType,
        "X-Upload-Content-Length": String(bytes.length),
      },
      body: JSON.stringify({
        snippet: { title: safeTitle, description, categoryId: "22" },
        status: { privacyStatus, selfDeclaredMadeForKids: false },
      }),
    });
    if (!initRes.ok) {
      throw new Error(
        `YouTube upload init failed (${initRes.status}): ${await initRes.text()}`,
      );
    }
    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) {
      throw new Error("YouTube did not return a resumable upload URL");
    }

    // 2. Upload the bytes; the response is the created video resource.
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
      },
      body: bytes,
    });
    if (!putRes.ok) {
      throw new Error(
        `YouTube upload failed (${putRes.status}): ${await putRes.text()}`,
      );
    }
    const uploaded = (await putRes.json()) as { id?: string };
    if (!uploaded.id) {
      throw new Error("YouTube upload returned no video id");
    }

    return {
      externalPostId: uploaded.id,
      permalink: `https://www.youtube.com/watch?v=${uploaded.id}`,
    };
  },
};

function firstLine(text: string): string {
  return text.split("\n")[0]?.trim() ?? "";
}
