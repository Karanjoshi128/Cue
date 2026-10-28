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
  // OAuth discovery for the Claude/ChatGPT connector (src/lib/connector).
  // Rewrites rather than an app/.well-known folder, which sends Turbopack's
  // dev server into an endless rebuild.
  async rewrites() {
    return [
      { source: "/.well-known/oauth-protected-resource", destination: "/api/oauth/metadata/resource" },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/oauth/metadata/resource" },
      { source: "/.well-known/oauth-authorization-server", destination: "/api/oauth/metadata/server" },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/api/oauth/metadata/server" },
    ];
  },
};

export default nextConfig;
