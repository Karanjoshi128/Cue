import type { PlatformAdapter, PublishInput, PublishResult } from "./types";

// Instagram API with Instagram Login issues tokens scoped to graph.instagram.com,
// NOT graph.facebook.com. Using the Facebook host yields a code-190
// "Cannot parse access token" error. The IG user id and content-publishing
// endpoints (/media, /media_publish) live under this host.
const GRAPH = "https://graph.instagram.com/v21.0";

/**
 * Publishes to Instagram via the Graph API content-publishing flow.
 * `externalId` is the IG professional account id; `accessToken` is its token.
 * Two steps: create a media container (needs a PUBLIC media URL) → publish it.
 */
export const instagramAdapter: PlatformAdapter = {
  platform: "INSTAGRAM",

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, externalId, body } = input;
    const media = input.media[0];
    if (!media) {
      throw new Error("Instagram requires at least one image or video");
    }

    // 1. Create container
    const containerParams = new URLSearchParams({
      caption: body,
      access_token: accessToken,
    });
    if (media.type === "VIDEO") {
      containerParams.set("media_type", "REELS");
      containerParams.set("video_url", media.url);
    } else {
      containerParams.set("image_url", media.url);
    }

    const containerRes = await fetch(
      `${GRAPH}/${externalId}/media?${containerParams.toString()}`,
      { method: "POST" },
    );
    if (!containerRes.ok) {
      throw new Error(`IG container failed (${containerRes.status}): ${await containerRes.text()}`);
    }
    const { id: creationId } = (await containerRes.json()) as { id: string };

    // 2. Publish container (poll briefly for video processing)
    if (media.type === "VIDEO") {
      await waitForContainer(creationId, accessToken);
    }

    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    });
    const publishRes = await fetch(
      `${GRAPH}/${externalId}/media_publish?${publishParams.toString()}`,
      { method: "POST" },
    );
    if (!publishRes.ok) {
      throw new Error(`IG publish failed (${publishRes.status}): ${await publishRes.text()}`);
    }
    const { id: mediaId } = (await publishRes.json()) as { id: string };

    // Fetch permalink (best-effort)
    let permalink: string | undefined;
    try {
      const permRes = await fetch(
        `${GRAPH}/${mediaId}?fields=permalink&access_token=${accessToken}`,
      );
      if (permRes.ok) {
        permalink = ((await permRes.json()) as { permalink?: string }).permalink;
      }
    } catch {
      // ignore
    }

    return { externalPostId: mediaId, permalink };
  },
};

async function waitForContainer(
  creationId: string,
  accessToken: string,
  attempts = 10,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(
      `${GRAPH}/${creationId}?fields=status_code&access_token=${accessToken}`,
    );
    if (res.ok) {
      const { status_code } = (await res.json()) as { status_code: string };
      if (status_code === "FINISHED") return;
      if (status_code === "ERROR") throw new Error("IG media processing error");
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("IG media processing timed out");
}
