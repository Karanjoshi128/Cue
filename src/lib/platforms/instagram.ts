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
    const images = input.media.filter((m) => m.type === "IMAGE");
    if (input.media.length === 0) {
      throw new Error("Instagram requires at least one image or video");
    }

    let creationId: string;

    if (images.length >= 2) {
      // Carousel: an item container per image, then a parent CAROUSEL container.
      const childIds: string[] = [];
      for (const img of images.slice(0, 10)) {
        const p = new URLSearchParams({
          image_url: img.url,
          is_carousel_item: "true",
          access_token: accessToken,
        });
        const r = await fetch(`${GRAPH}/${externalId}/media?${p.toString()}`, {
          method: "POST",
        });
        if (!r.ok) {
          throw new Error(
            `IG carousel item failed (${r.status}): ${await r.text()}`,
          );
        }
        childIds.push(((await r.json()) as { id: string }).id);
      }
      for (const id of childIds) await waitForContainer(id, accessToken);

      const parentParams = new URLSearchParams({
        media_type: "CAROUSEL",
        caption: body,
        children: childIds.join(","),
        access_token: accessToken,
      });
      const parentRes = await fetch(
        `${GRAPH}/${externalId}/media?${parentParams.toString()}`,
        { method: "POST" },
      );
      if (!parentRes.ok) {
        throw new Error(
          `IG carousel failed (${parentRes.status}): ${await parentRes.text()}`,
        );
      }
      creationId = ((await parentRes.json()) as { id: string }).id;
    } else {
      const media = input.media[0];
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
        throw new Error(
          `IG container failed (${containerRes.status}): ${await containerRes.text()}`,
        );
      }
      creationId = ((await containerRes.json()) as { id: string }).id;
    }

    // Wait for the container to be FINISHED before publishing. Required for
    //    video, but images can also race ahead (IG fetches the remote image
    //    asynchronously) and return code 9007 "media is not ready" - so poll
    //    for both. waitForContainer returns as soon as status is FINISHED.
    await waitForContainer(creationId, accessToken);

    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    });
    const publishRes = await fetch(
      `${GRAPH}/${externalId}/media_publish?${publishParams.toString()}`,
      { method: "POST" },
    );
    if (!publishRes.ok) {
      throw new Error(
        `IG publish failed (${publishRes.status}): ${await publishRes.text()}`,
      );
    }
    const { id: mediaId } = (await publishRes.json()) as { id: string };

    // Fetch permalink (best-effort)
    let permalink: string | undefined;
    try {
      const permRes = await fetch(
        `${GRAPH}/${mediaId}?fields=permalink&access_token=${accessToken}`,
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
