import type { NextConfig } from "next";
import { OPTIMIZED_MEDIA_HOSTS } from "./src/lib/media-hosts";

// Sent on every response (see docs/cloudflare-protection.md, section 5).
// Nothing embeds Cue, so no site may frame it: that stops clickjacking of
// the team, API-key and admin pages.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  images: {
    // Only the hosts we actually serve media from (see src/lib/media-hosts.ts),
    // and only their upload folder. The only remote images are uploads:
    // composer thumbnails and the post previews. Uploads in a workspace's own
    // bucket render unoptimized.
    remotePatterns: OPTIMIZED_MEDIA_HOSTS.map((hostname) => ({
      protocol: "https" as const,
      hostname,
      pathname: "/posts/**",
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
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
