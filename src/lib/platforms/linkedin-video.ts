import { fetchMedia } from "./fetch-media";

export type VideoSidecars = { captions?: string; coverUrl?: string };

type UploadUrls = { captionsUploadUrl?: string; thumbnailUploadUrl?: string };
type ByteRange = { firstByte: number; lastByte: number };

/** LinkedIn sometimes rounds up the last range. Uploaded bytes must still cover the file once, in order. */
export function validateByteRanges(parts: ByteRange[], size: number) {
  let nextByte = 0;
  for (const { firstByte, lastByte } of parts) {
    if (
      !Number.isSafeInteger(lastByte) ||
      firstByte !== nextByte ||
      firstByte >= size ||
      lastByte < firstByte
    ) {
      throw new Error("LinkedIn returned invalid video byte ranges.");
    }
    nextByte = Math.min(lastByte + 1, size);
  }
  if (nextByte !== size) throw new Error("LinkedIn did not request the complete video.");
}

export async function uploadSidecars(
  urls: UploadUrls,
  { captions, coverUrl }: VideoSidecars,
  remaining: (max: number) => number,
) {
  if (captions) {
    if (!urls.captionsUploadUrl) throw new Error("LinkedIn did not provide a captions upload URL.");
    const form = new FormData();
    form.append("metadata", JSON.stringify({
      format: "SRT",
      formattedForEasyReader: false,
      largeText: false,
      source: "USER_PROVIDED",
      locale: { language: "EN", country: "US", variant: "AMERICAN" },
      transcriptType: "CLOSED_CAPTION",
    }));
    form.append("file", new Blob([captions], { type: "text/plain" }), "captions.srt");
    const response = await fetch(urls.captionsUploadUrl, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(remaining(30_000)),
    });
    if (!response.ok) throw new Error(`LinkedIn captions upload failed (${response.status}).`);
  }
  if (coverUrl) {
    if (!urls.thumbnailUploadUrl) throw new Error("LinkedIn did not provide a thumbnail upload URL.");
    const cover = await fetchMedia(coverUrl, remaining(30_000));
    const response = await fetch(urls.thumbnailUploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", "media-type-family": "STILLIMAGE" },
      body: cover.bytes,
      signal: AbortSignal.timeout(remaining(30_000)),
    });
    if (!response.ok) throw new Error(`LinkedIn thumbnail upload failed (${response.status}).`);
  }
}
