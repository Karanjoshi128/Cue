import type { PlatformAdapter, PublishInput, PublishResult } from "./types";

const LINKEDIN_VERSION = "202506"; // LinkedIn-Version header (YYYYMM)

/**
 * Publishes to LinkedIn via the Posts API (/rest/posts).
 * `externalId` is the author URN, e.g. "urn:li:organization:123" or
 * "urn:li:person:abc". MVP supports text; a single image is uploaded first.
 */
export const linkedinAdapter: PlatformAdapter = {
  platform: "LINKEDIN",

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, externalId, body } = input;
    const image = input.media.find((m) => m.type === "IMAGE");

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    };

    let content: Record<string, unknown> | undefined;

    if (image) {
      const assetUrn = await uploadImage(externalId, accessToken, image.url);
      content = { media: { id: assetUrn } };
    }

    const postBody = {
      author: externalId,
      commentary: body,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      ...(content ? { content } : {}),
    };

    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers,
      body: JSON.stringify(postBody),
    });

    if (!res.ok) {
      throw new Error(`LinkedIn publish failed (${res.status}): ${await res.text()}`);
    }

    // The created post id is returned in the x-restli-id / x-linkedin-id header.
    const postId =
      res.headers.get("x-restli-id") ||
      res.headers.get("x-linkedin-id") ||
      "";

    return {
      externalPostId: postId,
      permalink: postId
        ? `https://www.linkedin.com/feed/update/${postId}/`
        : undefined,
    };
  },
};

async function uploadImage(
  ownerUrn: string,
  accessToken: string,
  imageUrl: string,
): Promise<string> {
  // 1. Initialize the upload to get an uploadUrl + image URN.
  const initRes = await fetch(
    "https://api.linkedin.com/rest/images?action=initializeUpload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
    },
  );
  if (!initRes.ok) {
    throw new Error(`LinkedIn image init failed (${initRes.status}): ${await initRes.text()}`);
  }
  const init = (await initRes.json()) as {
    value: { uploadUrl: string; image: string };
  };

  // 2. Fetch our media bytes and PUT them to the upload URL.
  const bytes = await (await fetch(imageUrl)).arrayBuffer();
  const putRes = await fetch(init.value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: Buffer.from(bytes),
  });
  if (!putRes.ok) {
    throw new Error(`LinkedIn image upload failed (${putRes.status})`);
  }

  return init.value.image;
}
