import type { PlatformAdapter, PublishInput, PublishResult } from "./types";

// YYYYMM LinkedIn-Version header. 202506 is sunset — keep this current.
const LINKEDIN_VERSION = "202606";
const REST = "https://api.linkedin.com/rest";

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
 * author URN (urn:li:person:… for member posts). Content type is chosen by what
 * the post carries, in this precedence:
 *   poll → article/link → document(PDF) → multi-image (2+) → single image → text.
 */
export const linkedinAdapter: PlatformAdapter = {
  platform: "LINKEDIN",

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, externalId, body, article, poll } = input;
    const images = input.media.filter((m) => m.type === "IMAGE");
    const doc = input.media.find((m) => m.type === "DOCUMENT");

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
      // LinkedIn does NOT scrape the URL — we pass title/description ourselves.
      content = {
        article: {
          source: article.source,
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
      content = { multiImage: { images: urns.map((id) => ({ id })) } };
    } else if (images.length === 1) {
      const id = await uploadAsset("images", externalId, accessToken, images[0].url);
      content = { media: { id } };
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

    const res = await fetch(`${REST}/posts`, {
      method: "POST",
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(postBody),
    });
    if (!res.ok) {
      throw new Error(`LinkedIn publish failed (${res.status}): ${await res.text()}`);
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

  const bytes = await (await fetch(fileUrl)).arrayBuffer();
  const putRes = await fetch(init.value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: Buffer.from(bytes),
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

  // Documents process asynchronously — poll until AVAILABLE before posting.
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
