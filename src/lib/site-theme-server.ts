import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_THEME, isSiteThemeKey, type SiteThemeKey } from "@/lib/site-themes";

// The root layout reads the site theme on every page, including the static
// marketing ones, so it's cached rather than queried per request. The admin
// action expires SITE_THEME_TAG, which also re-renders the static pages.
export const SITE_THEME_TAG = "site-theme";

const readSiteTheme = unstable_cache(
  async () => {
    const row = await prisma.platformSettings.findUnique({
      where: { id: "global" },
      select: { siteTheme: true },
    });
    return row?.siteTheme ?? DEFAULT_SITE_THEME;
  },
  ["site-theme"],
  // The hour is only a backstop; a change in the admin panel applies at once.
  { tags: [SITE_THEME_TAG], revalidate: 3600 },
);

/** The live site theme. Never throws: any failure (a build without the
 *  database, a missing column) falls back to the everyday look. */
export async function getSiteTheme(): Promise<SiteThemeKey> {
  try {
    const key = await readSiteTheme();
    return isSiteThemeKey(key) ? key : DEFAULT_SITE_THEME;
  } catch (e) {
    console.error("[site-theme] could not read, using the default:", e);
    return DEFAULT_SITE_THEME;
  }
}
