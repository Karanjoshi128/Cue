import type { MetadataRoute } from "next";

const SITE = (process.env.APP_URL ?? "https://trycue.space").replace(/\/$/, "");

// Fixed dates, so a redeploy doesn't claim the pages changed when they didn't.
// Bump a date when that page's content actually changes.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE}/`,
      lastModified: new Date("2026-10-08"),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${SITE}/privacy`,
      lastModified: new Date("2026-07-06"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE}/terms`,
      lastModified: new Date("2026-07-06"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE}/data-deletion`,
      lastModified: new Date("2026-07-06"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
