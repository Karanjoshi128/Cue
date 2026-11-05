import type { MetadataRoute } from "next";
import { HELP_GUIDES } from "@/lib/help";

const SITE = (process.env.APP_URL ?? "https://trycue.space").replace(/\/$/, "");

// The help centre was written on this date. Bump it when guides change.
const HELP_UPDATED = new Date("2026-11-05");

// Fixed dates, so a redeploy doesn't claim the pages changed when they didn't.
// Bump a date when that page's content actually changes.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...[
      {
        url: `${SITE}/help`,
        lastModified: HELP_UPDATED,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      },
      ...HELP_GUIDES.map((g) => ({
        url: `${SITE}/help/${g.slug}`,
        lastModified: HELP_UPDATED,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    ],
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
