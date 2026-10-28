import { createHash, randomBytes } from "crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError, hashApiKey } from "@/lib/api";
import {
  ACCESS_PREFIX,
  ACCESS_TTL_S,
  CODE_PREFIX,
  CODE_TTL_MS,
  LIMITS,
  MCP_PATH,
  REFRESH_PREFIX,
  REFRESH_TTL_MS,
  SCOPE,
} from "./config";

// OAuth 2.1 for the connector, as Claude and ChatGPT expect it: apps register
// themselves (RFC 7591) as public clients, a member approves on the consent
// screen, and the app swaps the one-time code (PKCE S256 required) for an
// access token and a refresh token that's replaced on every use.

export type OAuthErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "unsupported_grant_type"
  | "invalid_target"
  | "invalid_redirect_uri"
  | "invalid_client_metadata";

export class OAuthError extends Error {
  constructor(
    readonly code: OAuthErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const newSecret = (prefix: string) => prefix + randomBytes(32).toString("base64url");

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const UNSAFE_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "about:", "blob:"]);

/**
 * Why an app's redirect address can't be registered, or null. https, http on
 * this machine (Claude Code), or an app's own scheme (cursor://...).
 */
export function redirectUriProblem(uri: string): string | null {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return `${uri.slice(0, 80)} isn't a URL.`;
  }
  if (u.hash) return "Redirect URIs can't have a fragment.";
  if (u.protocol === "https:") return null;
  if (u.protocol === "http:") {
    return LOOPBACK.has(u.hostname) ? null : "http redirect URIs must be on localhost.";
  }
  return UNSAFE_SCHEMES.has(u.protocol) ? `${u.protocol} redirect URIs aren't allowed.` : null;
}

export async function registerClient(body: unknown) {
  const b = isObject(body) ? body : {};
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > LIMITS.redirectUris) {
    throw new OAuthError("invalid_redirect_uri", `Send 1 to ${LIMITS.redirectUris} redirect_uris.`);
  }
  for (const uri of uris) {
    if (typeof uri !== "string" || uri.length > LIMITS.redirectUri) {
      throw new OAuthError("invalid_redirect_uri", "Every redirect URI must be a string.");
    }
    const problem = redirectUriProblem(uri);
    if (problem) throw new OAuthError("invalid_redirect_uri", problem);
  }
  const grants = Array.isArray(b.grant_types) ? b.grant_types : ["authorization_code", "refresh_token"];
  if (grants.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    throw new OAuthError("invalid_client_metadata", "Only authorization_code and refresh_token are supported.");
  }
  const name =
    (typeof b.client_name === "string" ? b.client_name.trim() : "").slice(0, LIMITS.clientName) ||
    "An AI assistant";

  const client = await prisma.oAuthClient.create({
    data: { name, redirectUris: uris as string[] },
  });
  // Every client is public (PKCE instead of a secret), whatever it asked for.
  return {
    client_id: client.id,
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    client_name: client.name,
    redirect_uris: client.redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: SCOPE,
  };
}

// ---------------------------------------------------------------------------
// The consent screen
// ---------------------------------------------------------------------------

/** Exact match, except that a loopback address may use any port (RFC 8252). */
function redirectMatches(registered: string, requested: string): boolean {
  if (registered === requested) return true;
  try {
    const a = new URL(registered);
    const b = new URL(requested);
    return (
      a.protocol === "http:" &&
      b.protocol === "http:" &&
      LOOPBACK.has(a.hostname) &&
      a.hostname === b.hostname &&
      a.pathname === b.pathname &&
      a.search === b.search
    );
  } catch {
    return false;
  }
}

/** Is this the MCP endpoint (or this site)? Apps name it in `resource` (RFC 8707). */
export function isOurResource(resource: string | null | undefined, origin: string): boolean {
  if (!resource) return true;
  const r = resource.replace(/\/$/, "");
  return r === origin || r === `${origin}${MCP_PATH}`;
}

export interface AuthorizeRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
}

export type AuthorizeCheck =
  | { ok: true; request: AuthorizeRequest }
  /** The app or its redirect address is unknown: say so here, never redirect. */
  | { ok: false; fatal: string }
  /** Anything else goes back to the app as an OAuth error. */
  | { ok: false; redirect: string };

export function errorRedirect(
  redirectUri: string,
  origin: string,
  state: string | null,
  error: string,
  description?: string,
): string {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  if (description) u.searchParams.set("error_description", description);
  if (state) u.searchParams.set("state", state);
  u.searchParams.set("iss", origin);
  return u.toString();
}

export async function checkAuthorizeRequest(
  params: Record<string, string | undefined>,
  origin: string,
): Promise<AuthorizeCheck> {
  const client = params.client_id
    ? await prisma.oAuthClient.findUnique({ where: { id: params.client_id } })
    : null;
  if (!client) {
    return { ok: false, fatal: "This app isn't registered with Cue. Start connecting again from the app." };
  }
  const redirectUri =
    params.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
  if (!redirectUri || !client.redirectUris.some((r) => redirectMatches(r, redirectUri))) {
    return { ok: false, fatal: "The app asked to send you somewhere it didn't register. Nothing was shared." };
  }

  const state = params.state ?? null;
  const fail = (error: string, description: string): AuthorizeCheck => ({
    ok: false,
    redirect: errorRedirect(redirectUri, origin, state, error, description),
  });
  if (params.response_type !== "code") {
    return fail("unsupported_response_type", "Only response_type=code is supported.");
  }
  if (!params.code_challenge || params.code_challenge_method !== "S256") {
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(params.code_challenge)) {
    return fail("invalid_request", "code_challenge isn't a base64url SHA-256.");
  }
  if (!isOurResource(params.resource, origin)) {
    return fail("invalid_target", "That resource isn't served here.");
  }
  return {
    ok: true,
    request: {
      clientId: client.id,
      clientName: client.name,
      redirectUri,
      codeChallenge: params.code_challenge,
      state,
    },
  };
}

/** After "Allow": a one-time code, sent back to the app. */
export async function issueCode(request: AuthorizeRequest, user: User, origin: string): Promise<string> {
  const code = newSecret(CODE_PREFIX);
  await prisma.oAuthCode.create({
    data: {
      hash: hashApiKey(code),
      clientId: request.clientId,
      userId: user.id,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      scope: SCOPE,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  const u = new URL(request.redirectUri);
  u.searchParams.set("code", code);
  if (request.state) u.searchParams.set("state", request.state);
  u.searchParams.set("iss", origin);
  return u.toString();
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** Who may keep using a grant: the same checks an API key gets. */
function accountProblem(user: User & { workspace: { suspendedAt: Date | null; disabledFeatures: string[] } }, workspaceId: string): string | null {
  if (user.workspaceId !== workspaceId) return "This connection belongs to a workspace you're no longer in.";
  if (user.bannedAt) return "Your Cue account is suspended. Contact Cue support.";
  if (user.workspace.suspendedAt) return "This workspace is suspended. Contact Cue support.";
  if (user.workspace.disabledFeatures.includes("api")) {
    return "API access, which the connector uses, is turned off for this workspace.";
  }
  return null;
}

const userWithWorkspace = {
  include: { workspace: { select: { suspendedAt: true, disabledFeatures: true } } },
} as const;

function freshTokens() {
  const access = newSecret(ACCESS_PREFIX);
  const refresh = newSecret(REFRESH_PREFIX);
  const now = Date.now();
  return {
    access,
    refresh,
    data: {
      accessHash: hashApiKey(access),
      accessExpires: new Date(now + ACCESS_TTL_S * 1000),
      refreshHash: hashApiKey(refresh),
      refreshExpires: new Date(now + REFRESH_TTL_MS),
    },
  };
}

function tokenResponse(t: { access: string; refresh: string }) {
  return {
    access_token: t.access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    refresh_token: t.refresh,
    scope: SCOPE,
  };
}

function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function exchangeCode(p: {
  code?: string;
  redirectUri?: string;
  clientId?: string;
  verifier?: string;
}) {
  if (!p.code || !p.verifier || !p.clientId) {
    throw new OAuthError("invalid_request", "code, code_verifier and client_id are required.");
  }
  const row = await prisma.oAuthCode.findUnique({ where: { hash: hashApiKey(p.code) } });
  if (!row) throw new OAuthError("invalid_grant", "Unknown code.");
  if (row.usedAt) {
    // A replayed code: whoever has it shouldn't keep what it bought.
    if (row.grantId) {
      await prisma.oAuthGrant.updateMany({
        where: { id: row.grantId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw new OAuthError("invalid_grant", "That code was already used.");
  }
  if (row.expiresAt < new Date()) throw new OAuthError("invalid_grant", "That code expired.");
  if (row.clientId !== p.clientId) throw new OAuthError("invalid_grant", "That code was issued to another app.");
  if (p.redirectUri !== undefined && p.redirectUri !== row.redirectUri) {
    throw new OAuthError("invalid_grant", "redirect_uri doesn't match the one approved.");
  }
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(p.verifier) || s256(p.verifier) !== row.codeChallenge) {
    throw new OAuthError("invalid_grant", "code_verifier doesn't match.");
  }

  // Claimed in one statement, so two exchanges racing can't both win.
  const claimed = await prisma.oAuthCode.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (!claimed.count) throw new OAuthError("invalid_grant", "That code was already used.");

  const user = await prisma.user.findUnique({ where: { id: row.userId }, ...userWithWorkspace });
  if (!user) throw new OAuthError("invalid_grant", "That account is gone.");
  const problem = accountProblem(user, user.workspaceId);
  if (problem) throw new OAuthError("invalid_grant", problem);

  const t = freshTokens();
  const grant = await prisma.oAuthGrant.create({
    data: {
      clientId: row.clientId,
      userId: user.id,
      workspaceId: user.workspaceId,
      scope: row.scope,
      ...t.data,
    },
  });
  await prisma.oAuthCode.update({ where: { id: row.id }, data: { grantId: grant.id } });
  return tokenResponse(t);
}

export async function refreshGrant(p: { refreshToken?: string; clientId?: string }) {
  if (!p.refreshToken) throw new OAuthError("invalid_request", "refresh_token is required.");
  const hash = hashApiKey(p.refreshToken);
  const grant = await prisma.oAuthGrant.findUnique({ where: { refreshHash: hash } });
  if (!grant || grant.revokedAt || grant.refreshExpires < new Date()) {
    throw new OAuthError("invalid_grant", "That refresh token is no longer valid. Connect again.");
  }
  if (p.clientId && p.clientId !== grant.clientId) {
    throw new OAuthError("invalid_grant", "That refresh token was issued to another app.");
  }
  const user = await prisma.user.findUnique({ where: { id: grant.userId }, ...userWithWorkspace });
  const problem = user ? accountProblem(user, grant.workspaceId) : "That account is gone.";
  if (problem) throw new OAuthError("invalid_grant", problem);

  // Replaced only if it's still the current one: a refresh racing another
  // (or a stolen token used after the app's) gets invalid_grant.
  const t = freshTokens();
  const rotated = await prisma.oAuthGrant.updateMany({
    where: { id: grant.id, refreshHash: hash, revokedAt: null },
    data: t.data,
  });
  if (!rotated.count) throw new OAuthError("invalid_grant", "That refresh token was already used.");
  return tokenResponse(t);
}

/**
 * The member behind an access token, or null when the token is unknown,
 * expired or revoked (the app should refresh). A member who can't use the
 * connector any more gets a 403 that says why.
 */
export async function userForAccessToken(token: string): Promise<User | null> {
  const grant = await prisma.oAuthGrant.findUnique({
    where: { accessHash: hashApiKey(token) },
    include: { user: userWithWorkspace },
  });
  if (!grant || grant.revokedAt || grant.accessExpires < new Date()) return null;
  const problem = accountProblem(grant.user, grant.workspaceId);
  if (problem) throw new ApiError(403, problem);
  // Telemetry for Settings; a failed write isn't a reason to refuse.
  await prisma.oAuthGrant
    .update({ where: { id: grant.id }, data: { lastUsedAt: new Date(), useCount: { increment: 1 } } })
    .catch(() => {});
  return grant.user;
}

// ---------------------------------------------------------------------------
// Settings and housekeeping
// ---------------------------------------------------------------------------

export async function connectedApps(userId: string) {
  const grants = await prisma.oAuthGrant.findMany({
    where: { userId, revokedAt: null, refreshExpires: { gt: new Date() } },
    include: { client: { select: { name: true, redirectUris: true } } },
    orderBy: { createdAt: "desc" },
  });
  return grants.map((g) => ({
    id: g.id,
    name: g.client.name,
    host: hostOf(g.client.redirectUris[0]),
    createdAt: g.createdAt.toISOString(),
    lastUsedAt: g.lastUsedAt?.toISOString() ?? null,
    useCount: g.useCount,
  }));
}

/** Where an app sends people back to: claude.ai, chatgpt.com, "this computer". */
export function hostOf(uri: string | undefined): string {
  try {
    const u = new URL(uri ?? "");
    if (u.protocol === "http:" || u.protocol === "https:") {
      return LOOPBACK.has(u.hostname) ? "an app on this computer" : u.hostname;
    }
    return `the ${u.protocol.replace(":", "")} app`;
  } catch {
    return "an unknown address";
  }
}

/** Expired codes, dead grants, and apps that registered but were never approved. */
export async function pruneOAuth(): Promise<void> {
  const day = 24 * 60 * 60_000;
  const now = Date.now();
  await prisma.oAuthCode.deleteMany({ where: { expiresAt: { lt: new Date(now - day) } } });
  await prisma.oAuthGrant.deleteMany({
    where: {
      OR: [
        { refreshExpires: { lt: new Date(now - 30 * day) } },
        { revokedAt: { lt: new Date(now - 30 * day) } },
      ],
    },
  });
  await prisma.oAuthClient.deleteMany({
    where: { createdAt: { lt: new Date(now - 7 * day) }, grants: { none: {} }, codes: { none: {} } },
  });
}
