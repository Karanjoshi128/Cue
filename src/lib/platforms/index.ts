import type { Platform } from "@prisma/client";
import type { PlatformAdapter } from "./types";
import { linkedinAdapter } from "./linkedin";
import { instagramAdapter } from "./instagram";
import { youtubeAdapter } from "./youtube";

const adapters: Record<Platform, PlatformAdapter> = {
  LINKEDIN: linkedinAdapter,
  INSTAGRAM: instagramAdapter,
  YOUTUBE: youtubeAdapter,
};

export function getAdapter(platform: Platform): PlatformAdapter {
  const adapter = adapters[platform];
  if (!adapter) throw new Error(`No adapter for platform ${platform}`);
  return adapter;
}

/** Platforms whose adapter can post a first comment. */
export const COMMENT_PLATFORMS = (Object.keys(adapters) as Platform[]).filter(
  (p) => adapters[p].comment,
);

export * from "./types";
