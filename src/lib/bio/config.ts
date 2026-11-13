// Link-in-bio pages (trycue.space/b/<slug>): limits, address rules and shapes
// shared by the editor (client) and the server. No server imports here.

export const BIO_LIMITS = {
  title: 60,
  bio: 160,
  links: 12,
  label: 40,
  url: 500,
  /** Recent posts shown in the grid. */
  grid: 12,
  slugMin: 3,
  slugMax: 30,
} as const;

/** One link on the page. The id is what its clicks are counted under. */
export interface BioLink {
  id: string;
  label: string;
  url: string;
}

/** One post in the grid, as last read from Instagram. */
export interface BioTile {
  id: string;
  image: string;
  permalink: string;
  caption: string;
  video: boolean;
}

export const LINK_ID = /^[a-z0-9]{6,24}$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// Readers for the page's JSON columns that drop anything malformed.

export function readLinks(value: unknown): BioLink[] {
  return Array.isArray(value)
    ? value.filter(
        (l): l is BioLink =>
          isObject(l) && typeof l.id === "string" && typeof l.label === "string" && typeof l.url === "string",
      )
    : [];
}

export function readTiles(value: unknown): BioTile[] {
  return Array.isArray(value)
    ? value.filter(
        (t): t is BioTile =>
          isObject(t) && typeof t.id === "string" && typeof t.image === "string" && typeof t.permalink === "string",
      )
    : [];
}

export function readPostLinks(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
}

export function newLinkId(): string {
  return Math.random().toString(36).slice(2, 12).padEnd(8, "0");
}

// Addresses that could pass for Cue's own pages or a support account.
const RESERVED = new Set([
  "admin", "api", "app", "about", "billing", "blog", "cue", "help", "login",
  "official", "privacy", "security", "settings", "support", "terms", "trycue", "www",
]);

/** Why an address can't be used, or null when it can. */
export function slugProblem(slug: string): string | null {
  if (slug.length < BIO_LIMITS.slugMin || slug.length > BIO_LIMITS.slugMax) {
    return `Use ${BIO_LIMITS.slugMin} to ${BIO_LIMITS.slugMax} characters.`;
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) || slug.includes("--")) {
    return "Use lowercase letters, numbers and single dashes.";
  }
  if (RESERVED.has(slug)) return "That address is reserved.";
  return null;
}

/** An address from a client's name: "Kite & Co." → "kite-co". */
export function suggestSlug(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, BIO_LIMITS.slugMax)
    .replace(/-+$/, "");
  return s.length >= BIO_LIMITS.slugMin ? s : `${s || "page"}-bio`;
}

/** Only web links: no javascript:, data: or mailto: behind a button. */
export function isWebUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** "example.com/shop" → "https://example.com/shop": people paste without it. */
export function withScheme(value: string): string {
  const v = value.trim();
  return v && !/^[a-z][a-z0-9+.-]*:/i.test(v) ? `https://${v}` : v;
}

export function bioPath(slug: string): string {
  return `/b/${slug}`;
}
