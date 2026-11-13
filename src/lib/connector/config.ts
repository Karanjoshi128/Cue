// The Claude and ChatGPT connector: an MCP server at /api/mcp that an
// assistant uses as a member of the workspace, signed in with OAuth (claude.ai,
// ChatGPT) or a Cue API key in the Authorization header (Claude Code, the
// Claude API's MCP connector). Shared constants.

export const MCP_PATH = "/api/mcp";
export const AUTHORIZE_PATH = "/oauth/authorize";
export const TOKEN_PATH = "/api/oauth/token";
export const REGISTER_PATH = "/api/oauth/register";
export const RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;

/** The one scope: everything a member can do with posts and comments. */
export const SCOPE = "cue";

export const CODE_TTL_MS = 10 * 60_000;
export const ACCESS_TTL_S = 60 * 60;
/** Renewed on every refresh, so an app in use stays connected. */
export const REFRESH_TTL_MS = 60 * 24 * 60 * 60_000;

// Token shapes, so a request's token says which check applies.
export const ACCESS_PREFIX = "cuo_at_";
export const REFRESH_PREFIX = "cuo_rt_";
export const CODE_PREFIX = "cuo_c_";

/** MCP revisions served: the stateless one, and the ones with an initialize handshake. */
export const MODERN_VERSION = "2026-07-28";
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;

export const LIMITS = {
  clientName: 100,
  redirectUris: 10,
  redirectUri: 500,
};

/**
 * The origin a request came in on. Metadata is built from it rather than
 * APP_URL, because the resource an assistant is told about must match the
 * address the person pasted, exactly.
 */
export function originOf(req: Request): string {
  return new URL(req.url).origin;
}
