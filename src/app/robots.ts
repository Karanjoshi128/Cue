import type { MetadataRoute } from "next";

const SITE = (process.env.APP_URL ?? "https://trycue.space").replace(/\/$/, "");

// The public site (home, legal pages, sign-in) is indexable. The app itself
// sits behind sign-in, so keep crawlers out of it and the API entirely.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/composer",
        "/calendar",
        "/queue",
        "/clients",
        "/settings",
        "/onboarding",
        "/api/",
        "/auth/",
        "/logout",
      ],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
