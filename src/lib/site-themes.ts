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
  /** Draws a string of lamps in the preview, as the theme does across the site. */
  lights?: string[];
}

export const SITE_THEMES = [
  {
    key: "default",
    name: "Cue",
    description: "Paper and ink by day, the control room by night. The everyday look.",
    light: { canvas: "#edece6", panel: "#f9f8f5", line: "#e4e2db", ink: "#121420", soft: "#efeee9", accent: "#196bf5" },
    dark: { canvas: "#060709", panel: "#0c0e12", line: "#22262e", ink: "#edeef0", soft: "#1a1e25", accent: "#1f6ff9" },
    chrome: { light: "#f4f3ee", dark: "#060709" },
  },
  {
    key: "diwali",
    name: "Diwali",
    description: "Marigold and diya light, a string of lamps across the top of every page, and jaali patterns behind empty states.",
    light: { canvas: "#f6ecdc", panel: "#fdf7ee", line: "#ecdcc4", ink: "#2a1216", soft: "#f7e8d2", accent: "#c2410c" },
    dark: { canvas: "#0b0610", panel: "#120a17", line: "#2a1c2c", ink: "#f6eadb", soft: "#24152b", accent: "#ffa83d" },
    chrome: { light: "#f6ecdc", dark: "#0b0610" },
    lights: ["#ffb02e", "#ff5fa2", "#ffd166", "#ff7a1a"],
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
