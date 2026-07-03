// Import-safe constant shared by the client switcher (browser) and the
// server-only scope reader. Kept free of `next/headers` so it can be used
// from client components without pulling server APIs into the bundle.
export const SCOPE_COOKIE = "cue_client";
