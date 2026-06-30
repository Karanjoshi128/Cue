import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow media served from Cloudflare R2 (public bucket / custom domain).
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
