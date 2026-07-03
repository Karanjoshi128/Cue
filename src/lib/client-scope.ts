import { cookies } from "next/headers";

export const SCOPE_COOKIE = "cue_client";

/**
 * The client the app is currently scoped to (via the topbar switcher), or
 * undefined for "All clients". Read server-side in each data page.
 */
export async function getScopeClientId(): Promise<string | undefined> {
  const store = await cookies();
  const value = store.get(SCOPE_COOKIE)?.value;
  return value && value !== "all" ? value : undefined;
}
