import type { PlatformAdapter, PublishResult } from "./types";

// YouTube publishing (video upload via the Data API) is not wired up yet -
// that's Increment 2. This adapter exists so the Platform enum stays exhaustive
// (getAdapter / Record<Platform>); scheduling to YouTube is blocked in the
// composer until video-upload + title support lands, so publish() is never
// reached in normal use.
export const youtubeAdapter: PlatformAdapter = {
  platform: "YOUTUBE",
  publish(): Promise<PublishResult> {
    throw new Error("YouTube publishing is coming soon.");
  },
};
