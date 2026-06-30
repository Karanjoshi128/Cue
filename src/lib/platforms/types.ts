import type { Platform } from "@prisma/client";

export interface PublishMedia {
  type: "IMAGE" | "VIDEO";
  url: string;
}

export interface PublishInput {
  body: string;
  media: PublishMedia[];
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
