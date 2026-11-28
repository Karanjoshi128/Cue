// Site-wide themes, picked in the admin panel (/admin/themes) and applied to
// every page, public and signed-in. A theme sits on top of each person's own
// light/dark choice: it sets `data-skin` on <html>, and globals.css swaps the
// colour tokens for both modes under that attribute. "default" sets nothing.

export interface ThemeSwatch {
  canvas: string;
  panel: string;
  line: string;
  ink: string;
  soft: string;
  accent: string;
}

export interface SiteTheme {
  key: string;
  name: string;
  description: string;
  /** Colours for the admin preview only; the real tokens live in globals.css. */
  light: ThemeSwatch;
  dark: ThemeSwatch;
  /** The browser's toolbar colour (theme-color) in each mode. */
  chrome: { light: string; dark: string };
}

export const SITE_THEMES = [
  {
    key: "default",
    name: "Cue",
    description: "Soft: a lavender canvas and white cards by day, deep violet by night. The everyday look.",
    light: { canvas: "#f7f5fc", panel: "#ffffff", line: "#e6e2ef", ink: "#1f1b2d", soft: "#f1eef8", accent: "#6d5bff" },
    dark: { canvas: "#110f1a", panel: "#1a1726", line: "#2c2740", ink: "#f1eefa", soft: "#221e31", accent: "#7563ff" },
    chrome: { light: "#f7f5fc", dark: "#110f1a" },
  },
] as const satisfies readonly SiteTheme[];

export type SiteThemeKey = (typeof SITE_THEMES)[number]["key"];

export const DEFAULT_SITE_THEME: SiteThemeKey = "default";

export const SITE_THEME_KEYS = SITE_THEMES.map((t) => t.key) as [SiteThemeKey, ...SiteThemeKey[]];

export function isSiteThemeKey(value: unknown): value is SiteThemeKey {
  return typeof value === "string" && (SITE_THEME_KEYS as string[]).includes(value);
}

export function siteTheme(key: SiteThemeKey): SiteTheme {
  return SITE_THEMES.find((t) => t.key === key) ?? SITE_THEMES[0];
}
