/**
 * Where to go after signing in: a path on this site, or null. Refuses
 * "//host" and "/\host" (both leave the site) and anything with control
 * characters, so ?next= can't send someone elsewhere.
 */
export function safeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || /^\/[/\\]/.test(value)) return null;
  return /[\u0000-\u001f\u007f]/.test(value) ? null : value;
}
