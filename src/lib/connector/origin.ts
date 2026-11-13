import { headers } from "next/headers";

/**
 * This site's origin in a page or action, matching what the route handlers
 * read from the request URL (the issuer an app checks against).
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}
