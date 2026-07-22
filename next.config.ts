import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Only the hosts we actually serve media from. A wildcard hostname turns
    // the deployment into an open image-resizing proxy for the whole internet,
    // billed to us. The only remote images are R2 uploads: composer thumbnails
    // and the post previews.
    remotePatterns: [
      // Current R2_PUBLIC_URL (r2.dev development host).
      {
        protocol: "https",
        hostname: "pub-38504d71563d474a94538ff712ce61c6.r2.dev",
      },
      // Planned R2 custom domain, see docs/dns-migration-cloudflare.md.
      // Listed ahead of the switch so the cutover doesn't break images.
      { protocol: "https", hostname: "media.trycue.space" },
    ],
  },
};

export default nextConfig;
