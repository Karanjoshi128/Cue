// Client-safe. What LinkedIn accepts as a video post, shared by the composer,
// the post checks (posts.ts) and the publisher (platforms/linkedin.ts).
// LinkedIn's Videos API: MP4, 3 seconds to 30 minutes, at least 75 KB. Cue's
// own upload cap (512 MB) sits under LinkedIn's maximum.

export const LINKEDIN_VIDEO_MIN_BYTES = 75 * 1024;

/** File extensions of videos LinkedIn won't take (it wants MP4). */
const NOT_MP4 = new Set(["mov", "webm", "avi", "mkv", "mpeg", "mpg", "m4v", "wmv", "flv", "3gp"]);

function extension(url: string): string | null {
  try {
    const name = new URL(url).pathname.split("/").pop() ?? "";
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : null;
  } catch {
    return null;
  }
}

export interface LinkedInMediaItem {
  type: "IMAGE" | "VIDEO" | "DOCUMENT";
  url: string;
  sizeBytes?: number;
}

/**
 * Why LinkedIn can't take this media as a video post, or null when it can
 * (or when there's no video). One MP4, on its own: LinkedIn posts carry one
 * piece of media, so a video can't sit beside images.
 */
export function linkedInVideoProblem(media: LinkedInMediaItem[]): string | null {
  const videos = media.filter((m) => m.type === "VIDEO");
  if (!videos.length) return null;
  if (videos.length > 1) return "LinkedIn takes one video per post.";
  if (media.some((m) => m.type === "IMAGE")) {
    return "LinkedIn can't put a video and images in one post. Remove the images or the video.";
  }
  const ext = extension(videos[0].url);
  if (ext && NOT_MP4.has(ext)) {
    return `LinkedIn takes MP4 videos, and this one is .${ext}. Export it as MP4 and upload it again.`;
  }
  const size = videos[0].sizeBytes;
  if (size !== undefined && size > 0 && size < LINKEDIN_VIDEO_MIN_BYTES) {
    return "LinkedIn needs a video of at least 75 KB.";
  }
  return null;
}
