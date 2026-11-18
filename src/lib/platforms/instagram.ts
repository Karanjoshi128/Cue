import type {
  CommentInput,
  CommentResult,
  PlatformAdapter,
  PublishInput,
  PublishResult,
} from "./types";

// Instagram API with Instagram Login issues tokens scoped to graph.instagram.com,
// NOT graph.facebook.com. Using the Facebook host yields a code-190
// "Cannot parse access token" error. The IG user id and content-publishing
// endpoints (/media, /media_publish) live under this host.
export const GRAPH = "https://graph.instagram.com/v21.0";
// Publishing uses the current media schema (20-item carousels and collaborators).
// Message/comment endpoints keep their established version and permissions.
export const PUBLISH_GRAPH = "https://graph.instagram.com/v27.0";

// How long to wait for a media container to finish before publishing it.
// Images are ready within seconds. A video is transcoded first, and a one-minute
// Reel regularly takes longer than 30 s ("IG media processing timed out" on every
// attempt); Meta's guidance is to keep polling for up to five minutes. 180 s
// keeps a whole publish inside the 300 s function limit, since publish.ts stops
// claiming new targets once a run has used 200 s.
const IMAGE_WAIT = { attempts: 10, intervalMs: 3_000 };
const VIDEO_WAIT = { attempts: 30, intervalMs: 6_000 };

// A stalled comment call throws instead of eating the rest of the run.
const COMMENT_TIMEOUT_MS = 30_000;

/**
 * Publishes to Instagram via the Graph API content-publishing flow.
 * `externalId` is the IG professional account id; `accessToken` is its token.
 * Two steps: create a media container (needs a PUBLIC media URL) → publish it.
 */
export const instagramAdapter: PlatformAdapter = {
  platform: "INSTAGRAM",

  async publish(input: PublishInput): Promise<PublishResult> {
    const deadline = Math.min(input.deadline ?? Infinity, Date.now() + 240_000);
    const remaining = (max: number) => { const ms = deadline - Date.now(); if (ms <= 0) throw new Error("Instagram processing timed out."); return Math.min(max, ms); };
    const { accessToken, externalId, body } = input;
    const options = input.options?.instagram;
    const story = options?.placement === "STORY";
    const media = input.media;
    if (!media.length || media.some((m) => m.type === "DOCUMENT")) throw new Error("Instagram requires images or videos.");
    if (media.length > 20) throw new Error("Instagram allows up to 20 carousel items.");
    if (story && media.length !== 1) throw new Error("A Story needs one image or video.");
    if (story) {
      const profile = await fetch(`${PUBLISH_GRAPH}/${externalId}?fields=account_type`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
      if (!profile.ok) throw new Error(`Could not check Story eligibility (${profile.status}).`);
      const details = await profile.json() as { account_type?: string };
      if (details.account_type !== "BUSINESS") throw new Error("Instagram Story publishing requires a Business account. Creator accounts can publish feed posts and Reels.");
    }
    const common: Record<string, string> = story ? {} : { caption: body };
    if (options?.aiGenerated !== undefined) common.is_ai_generated = String(options.aiGenerated);
    if (!story && options?.collaborators?.length) common.collaborators = JSON.stringify(options.collaborators);
    if (!story && options?.locationId) common.location_id = options.locationId;
    const create = async (params: Record<string, string>) => {
      const res = await fetch(`${PUBLISH_GRAPH}/${externalId}/media`, {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}` },
        body: new URLSearchParams(params), signal: AbortSignal.timeout(remaining(30_000)),
      });
      if (!res.ok) throw new Error(`IG media container failed (${res.status}): ${await res.text()}`);
      const result = await res.json() as { id?: string };
      if (!result.id) throw new Error("Instagram returned no media container id.");
      return result.id;
    };
    const itemParams = (item: PublishInput["media"][number], carousel: boolean): Record<string, string> => ({
      ...(item.type === "VIDEO" ? { media_type: story ? "STORIES" : carousel ? "VIDEO" : "REELS", video_url: item.url } : { image_url: item.url, ...(story ? { media_type: "STORIES" } : {}) }),
      ...(carousel ? { is_carousel_item: "true" } : {}),
      ...(item.type === "IMAGE" && !story && item.altText ? { alt_text: item.altText } : {}),
      ...(item.userTags?.length ? { user_tags: JSON.stringify(item.type === "VIDEO" && !story ? item.userTags.map(({ username }) => ({ username })) : item.userTags) } : {}),
    });
    let creationId: string;
    if (media.length > 1) {
      // Preserve the user's order and include videos, instead of silently dropping them.
      const children: { id: string; video: boolean }[] = [];
      for (const item of media) children.push({ id: await create(itemParams(item, true)), video: item.type === "VIDEO" });
      // Transcoding happens concurrently on Instagram. One shared deadline bounds the batch.
      await Promise.all(children.map(({ id, video }) => waitForContainer(id, accessToken, video ? VIDEO_WAIT : IMAGE_WAIT, PUBLISH_GRAPH, deadline)));
      creationId = await create({ ...common, media_type: "CAROUSEL", children: children.map((c) => c.id).join(",") });
    } else {
      const params = { ...common, ...itemParams(media[0], false) };
      if (media[0].type === "VIDEO" && !story) {
        if (options?.shareToFeed !== undefined) params.share_to_feed = String(options.shareToFeed);
        if (input.cover) params.cover_url = input.cover.url;
        else if (options?.thumbOffset !== undefined) params.thumb_offset = String(options.thumbOffset);
        if (options?.trialReel) params.trial_params = JSON.stringify({ graduation_strategy: options.trialReel });
        if (options?.audioName) params.audio_name = options.audioName;
      }
      creationId = await create(params);
    }
    await waitForContainer(creationId, accessToken, media.length === 1 && media[0].type === "VIDEO" ? VIDEO_WAIT : IMAGE_WAIT, PUBLISH_GRAPH, deadline);
    const publishRes = await fetch(`${PUBLISH_GRAPH}/${externalId}/media_publish`, {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}` },
      body: new URLSearchParams({ creation_id: creationId }), signal: AbortSignal.timeout(remaining(30_000)),
    });
    if (!publishRes.ok) throw new Error(`IG publish failed (${publishRes.status}): ${await publishRes.text()}`);
    const { id: mediaId } = await publishRes.json() as { id: string };
    if (!mediaId) throw new Error("Instagram returned no published media id.");

    // Fetch permalink (best-effort)
    let permalink: string | undefined;
    try {
      const permRes = await fetch(
        `${GRAPH}/${mediaId}?fields=permalink`,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(5_000) },
      );
      if (permRes.ok) {
        permalink = ((await permRes.json()) as { permalink?: string })
          .permalink;
      }
    } catch {
      // ignore
    }

    return { externalPostId: mediaId, permalink };
  },

  /**
   * Comments on the account's own media as that account. Needs the
   * instagram_business_manage_comments permission. Sent as a form body rather
   * than in the query string: a comment can be up to 2200 characters.
   */
  async comment(input: CommentInput): Promise<CommentResult> {
    const { accessToken, postExternalId, text } = input;
    const res = await fetch(`${GRAPH}/${postExternalId}/comments`, {
      method: "POST",
      body: new URLSearchParams({ message: text, access_token: accessToken }),
      signal: AbortSignal.timeout(COMMENT_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`IG comment failed (${res.status}): ${await res.text()}`);
    }
    const { id } = (await res.json()) as { id?: string };
    if (!id) throw new Error("IG comment returned no comment id");
    return { commentId: id };
  },
};

async function waitForContainer(
  creationId: string,
  accessToken: string,
  { attempts, intervalMs } = IMAGE_WAIT,
  graph = GRAPH,
  deadline = Date.now() + 240_000,
): Promise<void> {
  let last = "no status yet";
  for (let i = 0; i < attempts; i++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const res = await fetch(
      `${graph}/${creationId}?fields=status_code,status`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(Math.min(15_000, remaining)) },
    );
    if (res.ok) {
      const { status_code, status } = (await res.json()) as {
        status_code: string;
        status?: string;
      };
      if (status_code === "FINISHED") return;
      // `status` carries Instagram's reason, e.g. an unsupported video format.
      if (status_code === "ERROR") {
        throw new Error(`IG media processing error${status ? `: ${status}` : ""}`);
      }
      last = status_code;
    }
    await new Promise((r) => setTimeout(r, Math.max(0, Math.min(intervalMs, deadline - Date.now()))));
  }
  throw new Error(
    `IG media processing timed out after ${Math.round((attempts * intervalMs) / 1000)} s (${last})`,
  );
}
