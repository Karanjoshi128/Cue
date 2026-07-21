import type { Platform } from "@prisma/client";

export interface PublishMedia {
  type: "IMAGE" | "VIDEO" | "DOCUMENT";
  url: string;
  title?: string; // display filename, required for DOCUMENT posts
}

// LinkedIn-only content types. Present when the post is a link or a poll.
export interface PublishArticle {
  source: string;
  title?: string;
  description?: string;
}
export interface PublishPoll {
  question: string;
  options: string[];
  duration: "ONE_DAY" | "THREE_DAYS" | "SEVEN_DAYS" | "FOURTEEN_DAYS";
}

// YouTube-only visibility for an uploaded video.
export type YouTubePrivacy = "public" | "unlisted" | "private";

export interface PublishInput {
  body: string;
  // YouTube-only: the uploaded video's title + visibility. Ignored elsewhere.
  title?: string;
  privacy?: YouTubePrivacy;
  media: PublishMedia[];
  article?: PublishArticle;
  poll?: PublishPoll;
  // Decrypted access token + the account's external id (org URN / IG user id).
  accessToken: string;
  externalId: string;
}

export interface PublishResult {
  externalPostId: string;
  permalink?: string;
}

export interface PlatformAdapter {
  platform: Platform;
  publish(input: PublishInput): Promise<PublishResult>;
}
