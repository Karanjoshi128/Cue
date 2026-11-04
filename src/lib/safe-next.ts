/**
 * A same-site path to continue to after sign-in or sign-out, or undefined.
 * Only "/something" passes: never "//host", "/\host" or a full URL, so a
 * crafted link can't bounce someone to another site.
 *
 * URL parsing drops tabs and newlines and reads "\" as "/", so "/<TAB>/host"
 * would become "//host". Those characters are refused outright, and the path
 * must still resolve to this site once parsed. The parsed path is checked
 * too: "/.//host" normalizes to "//host", which a later redirect would read
 * as another site.
 */
export function safeNext(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length > 300) return undefined;
  if (!raw.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(raw)) return undefined;
  const base = "https://next.invalid";
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return undefined;
  }
  if (url.origin !== base || url.pathname.startsWith("//")) return undefined;
  return url.pathname + url.search + url.hash;
}
