import type { NextConfig } from "next";
import { OPTIMIZED_MEDIA_HOSTS } from "./src/lib/media-hosts";

const nextConfig: NextConfig = {
  images: {
    // Only the hosts we actually serve media from (see src/lib/media-hosts.ts).
    // The only remote images are uploads: composer thumbnails and the post
    // previews. Uploads in a workspace's own bucket render unoptimized.
    remotePatterns: OPTIMIZED_MEDIA_HOSTS.map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
  },
};

export default nextConfig;
