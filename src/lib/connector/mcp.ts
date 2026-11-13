import type { User } from "@prisma/client";
import { ZodError } from "zod";
import { ApiError, requireApiUser } from "@/lib/api";
import {
  ACCESS_PREFIX,
  LEGACY_VERSIONS,
  MODERN_VERSION,
  RESOURCE_METADATA_PATH,
  originOf,
} from "./config";
import { userForAccessToken } from "./oauth";
import { findTool, listTools } from "./tools";

// The MCP endpoint (Streamable HTTP, JSON responses only, no sessions).
// Serves both eras: clients on 2026-07-28 send their version in each
// request's _meta (mirrored into headers); older clients open with an
// initialize handshake and then send MCP-Protocol-Version. Nothing is kept
// between requests either way. Spec: modelcontextprotocol.io/specification.

const SERVER_INFO = { name: "cue", title: "Cue", version: "1.0.0" };

const INSTRUCTIONS =
  "Cue schedules social media posts for an agency's clients on LinkedIn, Instagram and YouTube. " +
  "Call list_clients first for client and account ids and the current time. Give times as ISO 8601 " +
  "with a UTC offset. Instagram and YouTube need a photo or video, which can't be attached here, so " +
  "save those as drafts and point the person to openInCue. Publishing (action now, or a reply to a " +
  "comment) is public: confirm with the person first.";

const SUPPORTED = [MODERN_VERSION, ...LEGACY_VERSIONS];

const ERR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  headerMismatch: -32020,
  unsupportedVersion: -32022,
} as const;

type Id = string | number | null;

interface Message {
  jsonrpc: "2.0";
  id?: Id;
  method: string;
  params?: Record<string, unknown>;
}

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  Response.json(body, { status, headers });

const rpcError = (id: Id, code: number, message: string, data?: unknown) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

function isMessage(v: unknown): v is Message {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const m = v as Record<string, unknown>;
  const idOk = !("id" in m) || m.id === null || typeof m.id === "string" || typeof m.id === "number";
  const paramsOk = m.params === undefined || (typeof m.params === "object" && m.params !== null);
  return m.jsonrpc === "2.0" && typeof m.method === "string" && idOk && paramsOk;
}

/**
 * The spec asks every server to check Origin against DNS rebinding, which
 * matters for servers on someone's own machine. This one is public and only
 * takes bearer tokens, never cookies, so a page can't borrow a session: refuse
 * only origins no real client has (plain http off localhost, opaque ones).
 */
function originAllowed(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname));
  } catch {
    return false;
  }
}

function bearer(req: Request): string | undefined {
  return /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization")?.trim() ?? "")?.[1];
}

/** The member: an OAuth access token (claude.ai, ChatGPT) or a Cue API key. */
async function authenticate(req: Request): Promise<User> {
  const token = bearer(req);
  if (!token) throw new ApiError(401, "Sign in to Cue to use this connector.");
  if (token.startsWith(ACCESS_PREFIX)) {
    const user = await userForAccessToken(token);
    if (!user) throw new ApiError(401, "This connection expired or was disconnected.");
    return user;
  }
  return requireApiUser(req);
}

/** Starts OAuth: the 401 points the app at this server's metadata (RFC 9728). */
function unauthorized(req: Request, message: string): Response {
  const metadata = `${originOf(req)}${RESOURCE_METADATA_PATH}`;
  const invalid = bearer(req) ? 'error="invalid_token", ' : "";
  return json({ error: message }, 401, {
    "WWW-Authenticate": `Bearer ${invalid}resource_metadata="${metadata}"`,
  });
}

/** Header values may arrive as =?base64?...?= when they aren't plain ASCII. */
function decodeHeader(value: string | null): string | null {
  const m = value ? /^=\?base64\?(.*)\?=$/.exec(value) : null;
  return m ? Buffer.from(m[1], "base64").toString("utf8") : value;
}

function zodMessage(e: ZodError): string {
  return e.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
    .join("; ");
}

/** A tool's result, or an unknown tool (a protocol error rather than a tool error). */
async function callTool(
  user: User,
  params: Record<string, unknown> | undefined,
  origin: string,
): Promise<{ error: string } | { result: Record<string, unknown> }> {
  const name = params?.name;
  const tool = typeof name === "string" ? findTool(name) : undefined;
  if (!tool || (tool.available && !(await tool.available(user)))) {
    return { error: `Unknown tool: ${String(name)}` };
  }
  try {
    const args = tool.input.parse(params?.arguments ?? {});
    const out = await tool.run(args, { user, origin });
    return {
      result: {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
        isError: false,
      },
    };
  } catch (e) {
    // Mistakes the assistant can fix come back as tool errors it can read.
    let message: string;
    if (e instanceof ZodError) message = zodMessage(e);
    else if (e instanceof ApiError) message = e.message;
    else {
      console.error(`[mcp] ${tool.name} failed:`, e);
      message = "Something went wrong in Cue. Try again in a minute.";
    }
    return { result: { content: [{ type: "text", text: message }], isError: true } };
  }
}

export async function handleMcp(req: Request): Promise<Response> {
  if (!originAllowed(req.headers.get("origin"))) {
    return json(rpcError(null, ERR.invalidRequest, "Origin not allowed."), 403);
  }
  let msg: unknown;
  try {
    msg = await req.json();
  } catch {
    return json(rpcError(null, ERR.parse, "Parse error: send one JSON-RPC message."), 400);
  }
  if (!isMessage(msg)) {
    return json(rpcError(null, ERR.invalidRequest, "Send one JSON-RPC 2.0 request or notification."), 400);
  }

  let user: User;
  try {
    user = await authenticate(req);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return unauthorized(req, e.message);
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    throw e;
  }

  // Notifications (initialized, cancelled) need no answer.
  if (!("id" in msg)) return new Response(null, { status: 202 });
  const id = msg.id ?? null;

  // Which era: 2026-07-28 puts the version in _meta and mirrors it, the
  // method and the tool name into headers, which must agree with the body.
  const meta = msg.params?._meta as Record<string, unknown> | undefined;
  const requested = meta?.["io.modelcontextprotocol/protocolVersion"];
  const headerVersion = req.headers.get("mcp-protocol-version");
  const modern = msg.method !== "initialize" && typeof requested === "string";
  const mismatch = (what: string) => json(rpcError(id, ERR.headerMismatch, `Header mismatch: ${what}`), 400);
  const unsupported = (version: string) =>
    json(rpcError(id, ERR.unsupportedVersion, "Unsupported protocol version", { supported: SUPPORTED, requested: version }), 400);

  if (modern) {
    if (headerVersion !== requested) return mismatch("MCP-Protocol-Version doesn't match _meta.");
    if (requested !== MODERN_VERSION) return unsupported(requested);
    if (req.headers.get("mcp-method") !== msg.method) return mismatch("Mcp-Method doesn't match the body.");
    if (msg.method === "tools/call" && decodeHeader(req.headers.get("mcp-name")) !== msg.params?.name) {
      return mismatch("Mcp-Name doesn't match the tool name.");
    }
  } else if (msg.method !== "initialize") {
    // Before 2025-06-18 there was no header; those clients mean 2025-03-26.
    const version = headerVersion ?? "2025-03-26";
    if (version === MODERN_VERSION) return mismatch(`${MODERN_VERSION} requests carry _meta.`);
    if (!(LEGACY_VERSIONS as readonly string[]).includes(version)) return unsupported(version);
  }

  const done = (result: Record<string, unknown>) =>
    json({ jsonrpc: "2.0", id, result: modern ? { resultType: "complete", ...result } : result });
  const capabilities = { tools: { listChanged: false } };

  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      const version = (LEGACY_VERSIONS as readonly unknown[]).includes(asked) ? asked : LEGACY_VERSIONS[0];
      return done({ protocolVersion: version, capabilities, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case "server/discover":
      return done({
        supportedVersions: SUPPORTED,
        capabilities,
        _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
        instructions: INSTRUCTIONS,
      });
    case "ping":
      return done({});
    case "tools/list":
      return done({ tools: await listTools(user) });
    case "tools/call": {
      const out = await callTool(user, msg.params, originOf(req));
      return "error" in out ? json(rpcError(id, ERR.invalidParams, out.error)) : done(out.result);
    }
    default:
      // A modern server says 404 so clients can tell it from a missing endpoint.
      return json(rpcError(id, ERR.methodNotFound, `Method not found: ${msg.method}`), modern ? 404 : 200);
  }
}
