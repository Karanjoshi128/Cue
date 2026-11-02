/**
 * A same-site path to continue to after sign-in or sign-out, or undefined.
 * Only "/something" passes: never "//host", "/\host" or a full URL, so a
 * crafted link can't bounce someone to another site.
 */
export function safeNext(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length > 300) return undefined;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return undefined;
  return raw;
}
