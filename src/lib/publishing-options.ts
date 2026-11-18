import { z } from "zod";
import { linkedInVideoProblem } from "./linkedin-media";

// Client-safe schema shared by the composer, HTTP API and publishing worker.
// Optional values are intentionally omitted so old scheduled posts keep their defaults.
const language = z.string().trim().regex(/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/, "Use a language code such as en or hi.").max(35);
export const instagramUserTagSchema = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9_.]{1,30}$/, "Use an Instagram username without @."),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export const publishingOptionsSchema = z.object({
  instagram: z.object({
    trialReel: z.enum(["MANUAL", "SS_PERFORMANCE"]).optional(),
    aiGenerated: z.boolean().optional(),
    placement: z.enum(["FEED", "STORY"]).optional(),
    shareToFeed: z.boolean().optional(),
    thumbOffset: z.number().int().min(0).max(900_000).optional(),
    audioName: z.string().trim().max(100).optional(),
    collaborators: z.array(z.string().trim().regex(/^[A-Za-z0-9_.]{1,30}$/)).max(3).optional(),
    locationId: z.string().regex(/^\d{1,30}$/).optional(),
  }).strict().optional(),
  youtube: z.object({
    madeForKids: z.boolean().optional(),
    containsSyntheticMedia: z.boolean().optional(),
    notifySubscribers: z.boolean().optional(),
    publicStatsViewable: z.boolean().optional(),
    embeddable: z.boolean().optional(),
    license: z.enum(["youtube", "creativeCommon"]).optional(),
    defaultLanguage: language.optional(),
    recordingDate: z.string().datetime({ offset: true }).optional(),
    localizations: z.record(language, z.object({ title: z.string().trim().min(1).max(100).regex(/^[^<>]*$/, "YouTube titles cannot contain < or >."), description: z.string().max(5000).regex(/^[^<>]*$/, "YouTube descriptions cannot contain < or >.") }).strict()).refine((v) => Object.keys(v).length <= 20, "Up to 20 translations.").optional(),
  }).strict().optional(),
  linkedin: z.object({
    visibility: z.enum(["PUBLIC", "CONNECTIONS"]).optional(),
    disableReshares: z.boolean().optional(),
    videoTitle: z.string().trim().max(200).optional(),
    // SRT is uploaded as a sidecar to LinkedIn, never fetched from a user URL.
    captionsSrt: z.string().max(100_000).refine((v) => !v || /\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/.test(v), "Choose a valid .srt captions file.").optional(),
  }).strict().optional(),
}).strict();

export type PublishingOptions = z.infer<typeof publishingOptionsSchema>;
export type InstagramUserTag = z.infer<typeof instagramUserTagSchema>;

/** Parse persisted JSON; fail loudly on corrupt options rather than silently ignoring a disclosure. */
export function publishingOptions(value: unknown): PublishingOptions {
  return value == null ? {} : publishingOptionsSchema.parse(value);
}

export interface PublishingMedia {
  type: "IMAGE" | "VIDEO" | "DOCUMENT";
  url: string;
  role?: "CONTENT" | "COVER" | string;
  sizeBytes?: number | null;
  altText?: string | null;
}

/** Shared preflight prevents an adapter silently dropping media or sending a different post. */
export function publishingProblem(platform: string, media: PublishingMedia[], options: PublishingOptions, extra: { link?: unknown; poll?: unknown; firstComment?: string; externalId?: string } = {}): string | null {
  const content = media.filter((m) => m.role !== "COVER");
  const covers = media.filter((m) => m.role === "COVER");
  const videos = content.filter((m) => m.type === "VIDEO");
  const images = content.filter((m) => m.type === "IMAGE");
  const docs = content.filter((m) => m.type === "DOCUMENT");
  if (covers.length > 1 || covers.some((m) => m.type !== "IMAGE")) return "Use one image for the video cover.";
  if (covers.length && videos.length !== 1 && !(platform === "LINKEDIN" && extra.link)) return "A cover needs one video (or a LinkedIn link post).";
  if (extra.link && extra.poll) return "Choose a link or a poll, not both.";
  if ((extra.link || extra.poll) && content.length) return "Link and poll posts cannot also contain media.";
  if (platform !== "LINKEDIN" && (extra.link || extra.poll || docs.length)) return "Documents, links and polls are LinkedIn-only post types.";
  if (platform === "INSTAGRAM") {
    if (!content.length) return "Instagram needs an image or video.";
    if (content.length > 20) return "Instagram allows up to 20 carousel items.";
    if (options.instagram?.placement === "STORY") {
      if (content.length !== 1) return "A Story contains one image or video. Create separate posts for multiple Stories.";
      if (covers.length || options.instagram.collaborators?.length || options.instagram.locationId || options.instagram.audioName || options.instagram.thumbOffset !== undefined) return "Stories do not support covers, collaborators, locations or Reel audio settings.";
      if (extra.firstComment) return "Stories cannot receive a scheduled first comment.";
    }
    if (options.instagram?.trialReel && (content.length !== 1 || videos.length !== 1 || options.instagram.placement === "STORY")) return "Trial Reels need one Reel video.";
    if (covers.length && (content.length !== 1 || !videos.length)) return "Instagram custom covers apply to single Reels, not carousels.";
    if (covers.some((m) => !/\.jpe?g(?:\?|$)/i.test(m.url))) return "Instagram Reel covers must be JPEG.";
    if ([...images, ...covers].some((m) => (m.sizeBytes ?? 0) > 8 * 1024 * 1024)) return "Instagram images must be at most 8 MB.";
    if (content.some((m) => m.type === "IMAGE" && !/\.jpe?g(?:\?|$)/i.test(m.url))) return "Instagram requires JPEG images. Upload a .jpg or .jpeg file.";
  }
  if (platform === "YOUTUBE") {
    if (content.length !== 1 || videos.length !== 1) return "YouTube takes exactly one video. Use the cover field for its thumbnail.";
    if (options.youtube?.madeForKids && extra.firstComment) return "YouTube disables comments on videos made for kids. Remove the first comment.";
    if (options.youtube?.localizations && !options.youtube.defaultLanguage) return "Set the original video language before adding translations.";
    if (covers.some((m) => !/\.(jpe?g|png)(?:\?|$)/i.test(m.url))) return "YouTube thumbnails must be JPEG or PNG.";
    // Keep Cue's conservative 2 MB upload recommendation across all channel configurations.
    if (covers.some((m) => (m.sizeBytes ?? 0) > 2 * 1024 * 1024)) return "Keep the YouTube thumbnail at or below 2 MB.";
  }
  if (platform === "LINKEDIN") {
    const videoProblem = linkedInVideoProblem(content.map(({ type, url, sizeBytes }) => ({ type, url, sizeBytes: sizeBytes ?? undefined })));
    if (videoProblem) return videoProblem;
    if (videos.length && content.length !== 1) return "LinkedIn video posts contain one video, without other media.";
    if (docs.length && content.length !== 1) return "LinkedIn document posts contain one document.";
    if (images.length > 20) return "LinkedIn allows up to 20 images.";
    if (videos.some((m) => (m.sizeBytes ?? 0) > 500 * 1024 * 1024)) return "LinkedIn videos must be at most 500 MB.";
    if (options.linkedin?.captionsSrt && !videos.length) return "LinkedIn captions need a video.";
    if (options.linkedin?.visibility === "CONNECTIONS" && extra.externalId?.startsWith("urn:li:organization:")) return "Connections-only visibility is for LinkedIn profiles. Pages publish publicly.";
  }
  return null;
}
