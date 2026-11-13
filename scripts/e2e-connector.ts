/*
 * The Claude/ChatGPT connector (OAuth + MCP) against a THROWAWAY local
 * Postgres, calling the route handlers directly. Same safety checks as
 * scripts/e2e-automations.ts:
 *   DATABASE_URL=postgresql://postgres@localhost:55432/cue_test \
 *   TOKEN_ENC_KEY=<64 hex> npx tsx scripts/e2e-connector.ts
 */
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { generateApiKey } from "@/lib/api";
import { checkAuthorizeRequest, issueCode, pruneOAuth } from "@/lib/connector/oauth";
import { safeNext } from "@/lib/safe-next";
import { replyDeskEnabled } from "@/lib/reply-desk/config";
import { POST as register } from "@/app/api/oauth/register/route";
import { POST as token } from "@/app/api/oauth/token/route";
import { GET as mcpGet, POST as mcp } from "@/app/api/mcp/route";
import { GET as resourceMeta } from "@/app/api/oauth/metadata/resource/route";
import { GET as serverMeta } from "@/app/api/oauth/metadata/server/route";

let passed = 0;
let failed = 0;
function check(name: string, cond: unknown, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}`, extra ?? "");
  }
}

const ORIGIN = "http://localhost:3100";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

const form = (fields: Record<string, string>) =>
  new Request(`${ORIGIN}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

let rpcId = 0;
/** One MCP request. modern: 2026-07-28 with _meta and mirrored headers. */
async function rpc(
  method: string,
  params: Record<string, unknown> = {},
  opts: { auth?: string; modern?: boolean; headers?: Record<string, string>; notification?: boolean } = {},
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(opts.auth ? { Authorization: `Bearer ${opts.auth}` } : {}),
  };
  let body: Record<string, unknown> = { jsonrpc: "2.0", method, params };
  if (opts.modern) {
    body.params = {
      ...params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    };
    headers["MCP-Protocol-Version"] = "2026-07-28";
    headers["Mcp-Method"] = method;
    if (method === "tools/call") headers["Mcp-Name"] = String(params.name);
  } else if (method !== "initialize") {
    headers["MCP-Protocol-Version"] = "2025-06-18";
  }
  if (!opts.notification) body = { ...body, id: ++rpcId };
  Object.assign(headers, opts.headers ?? {});
  const res = await mcp(new Request(`${ORIGIN}/api/mcp`, { method: "POST", headers, body: JSON.stringify(body) }));
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, headers: res.headers, json: (text ? JSON.parse(text) : null) as any };
}

const call = (name: string, args: Record<string, unknown>, auth: string) =>
  rpc("tools/call", { name, arguments: args }, { auth, modern: true });

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`select current_database() as db`;
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !db.includes("test")) {
    throw new Error(`Refusing to run against ${db}: needs a local database with "test" in its name.`);
  }
  for (const t of ["oAuthGrant", "oAuthCode", "oAuthClient", "apiKey", "bioClick", "bioPage", "inboxComment", "alertLog", "automationRun", "automationRule", "lead", "postTarget", "post", "socialAccount", "client", "membership", "user", "workspace"] as const) {
    // @ts-expect-error every model here has deleteMany
    await prisma[t].deleteMany();
  }
  const ws = await prisma.workspace.create({ data: { name: "Connector WS" } });
  const user = await prisma.user.create({
    data: { email: "mcp@example.com", name: "Asha", role: "ADMIN", workspaceId: ws.id, memberships: { create: { workspaceId: ws.id, role: "ADMIN" } } },
  });
  const client = await prisma.client.create({ data: { name: "Acme", workspaceId: ws.id } });
  const common = { clientId: client.id, accessToken: encrypt("t"), tokenExpires: new Date(Date.now() + 30 * 86400_000) };
  const li = await prisma.socialAccount.create({ data: { ...common, platform: "LINKEDIN", externalId: "urn:li:person:1", displayName: "Acme on LinkedIn" } });

  console.log("\nsign-in return");
  check("a path on this site is kept", safeNext("/oauth/authorize?client_id=x") === "/oauth/authorize?client_id=x");
  check("other sites are refused", !safeNext("//evil.example") && !safeNext("/\\evil.example") && !safeNext("https://evil.example"));

  console.log("\ndiscovery");
  const rm = await (await resourceMeta(new Request(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`))).json();
  check("resource is the MCP endpoint on this origin", rm.resource === `${ORIGIN}/api/mcp` && rm.authorization_servers[0] === ORIGIN);
  const sm = await (await serverMeta(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`))).json();
  check("server metadata: PKCE S256, public clients, registration", sm.code_challenge_methods_supported[0] === "S256" && sm.token_endpoint_auth_methods_supported[0] === "none" && sm.registration_endpoint === `${ORIGIN}/api/oauth/register`);
  const anon = await rpc("initialize", { protocolVersion: "2025-06-18" });
  check("no token: 401 pointing at the metadata", anon.status === 401 && /resource_metadata="http:\/\/localhost:3100\/.well-known\/oauth-protected-resource\/api\/mcp"/.test(anon.headers.get("www-authenticate") ?? ""));

  console.log("\nregistration");
  const bad = await register(new Request(`${ORIGIN}/api/oauth/register`, { method: "POST", body: JSON.stringify({ redirect_uris: ["javascript:alert(1)"] }) }));
  check("a javascript: redirect is refused", bad.status === 400 && (await bad.json()).error === "invalid_redirect_uri");
  const regRes = await register(new Request(`${ORIGIN}/api/oauth/register`, { method: "POST", body: JSON.stringify({ client_name: "Claude", redirect_uris: [REDIRECT, "http://localhost/callback"], token_endpoint_auth_method: "client_secret_post" }) }));
  const reg = await regRes.json();
  check("Claude registers as a public client", regRes.status === 201 && reg.client_id && reg.token_endpoint_auth_method === "none");

  console.log("\nconsent");
  const p = pkce();
  const base = { response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: p.challenge, code_challenge_method: "S256", state: "xyz", resource: `${ORIGIN}/api/mcp` };
  const unknown = await checkAuthorizeRequest({ ...base, client_id: "nope" }, ORIGIN);
  check("unknown app: shown, never redirected", !unknown.ok && "fatal" in unknown);
  const elsewhere = await checkAuthorizeRequest({ ...base, redirect_uri: "https://evil.example/cb" }, ORIGIN);
  check("unregistered redirect: shown, never redirected", !elsewhere.ok && "fatal" in elsewhere);
  const noPkce = await checkAuthorizeRequest({ ...base, code_challenge: undefined }, ORIGIN);
  check("no PKCE: sent back as invalid_request", !noPkce.ok && "redirect" in noPkce && noPkce.redirect.includes("error=invalid_request") && noPkce.redirect.includes("state=xyz"));
  const loop = await checkAuthorizeRequest({ ...base, redirect_uri: "http://localhost:51234/callback" }, ORIGIN);
  check("Claude Code's loopback redirect matches on any port", loop.ok);
  const ok = await checkAuthorizeRequest(base, ORIGIN);
  if (!ok.ok) throw new Error("authorize check failed");
  const back = new URL(await issueCode(ok.request, user, ORIGIN));
  const code = back.searchParams.get("code")!;
  check("Allow sends a code, the state and the issuer back", back.origin === "https://claude.ai" && code.startsWith("cuo_c_") && back.searchParams.get("state") === "xyz" && back.searchParams.get("iss") === ORIGIN);

  console.log("\ntokens");
  const wrong = await token(form({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: REDIRECT, code_verifier: pkce().verifier }));
  check("wrong code_verifier: invalid_grant", wrong.status === 400 && (await wrong.json()).error === "invalid_grant");
  const t1Res = await token(form({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: REDIRECT, code_verifier: p.verifier, resource: `${ORIGIN}/api/mcp` }));
  const t1 = await t1Res.json();
  check("code + verifier: tokens", t1Res.status === 200 && t1.access_token?.startsWith("cuo_at_") && t1.refresh_token?.startsWith("cuo_rt_") && t1.expires_in === 3600 && t1Res.headers.get("cache-control") === "no-store");
  const replay = await token(form({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: REDIRECT, code_verifier: p.verifier }));
  check("a replayed code fails", replay.status === 400);
  const dead = await rpc("tools/list", {}, { auth: t1.access_token });
  check("...and revokes what it bought", dead.status === 401 && /invalid_token/.test(dead.headers.get("www-authenticate") ?? ""));

  // A clean connection for the rest.
  const p2 = pkce();
  const ok2 = await checkAuthorizeRequest({ ...base, code_challenge: p2.challenge }, ORIGIN);
  if (!ok2.ok) throw new Error("authorize check failed");
  const code2 = new URL(await issueCode(ok2.request, user, ORIGIN)).searchParams.get("code")!;
  const t2 = await (await token(form({ grant_type: "authorization_code", code: code2, client_id: reg.client_id, redirect_uri: REDIRECT, code_verifier: p2.verifier }))).json();
  const t3Res = await token(form({ grant_type: "refresh_token", refresh_token: t2.refresh_token, client_id: reg.client_id }));
  const t3 = await t3Res.json();
  check("refresh gives new tokens", t3Res.status === 200 && t3.access_token !== t2.access_token && t3.refresh_token !== t2.refresh_token);
  const oldRefresh = await token(form({ grant_type: "refresh_token", refresh_token: t2.refresh_token, client_id: reg.client_id }));
  check("the old refresh token is spent", oldRefresh.status === 400);
  check("the old access token stops working", (await rpc("tools/list", {}, { auth: t2.access_token })).status === 401);
  const AT = t3.access_token as string;

  console.log("\nMCP, initialize era (2025-06-18)");
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude", version: "1" } }, { auth: AT });
  check("initialize answers 2025-06-18 with tools", init.json.result.protocolVersion === "2025-06-18" && init.json.result.capabilities.tools && !init.json.result.resultType);
  check("no session is minted", !init.headers.get("mcp-session-id"));
  check("initialized notification: 202", (await rpc("notifications/initialized", {}, { auth: AT, notification: true })).status === 202);
  const list = await rpc("tools/list", {}, { auth: AT });
  const names = list.json.result.tools.map((t: { name: string }) => t.name);
  check("tools listed with schemas and annotations", names.includes("create_post") && list.json.result.tools.find((t: { name: string }) => t.name === "delete_post").annotations.destructiveHint === true && list.json.result.tools[0].inputSchema.type === "object");
  check(
    replyDeskEnabled() ? "Reply Desk tools listed while it's on" : "Reply Desk tools hidden while it's off",
    names.includes("reply_to_comment") === replyDeskEnabled(),
  );
  check("an unknown legacy version is refused", (await rpc("tools/list", {}, { auth: AT, headers: { "MCP-Protocol-Version": "2024-01-01" } })).json.error.code === -32022);

  console.log("\nMCP, 2026-07-28");
  const disc = await rpc("server/discover", {}, { auth: AT, modern: true });
  check("server/discover lists versions", disc.json.result.resultType === "complete" && disc.json.result.supportedVersions.includes("2026-07-28"));
  const mism = await rpc("tools/list", {}, { auth: AT, modern: true, headers: { "Mcp-Method": "tools/call" } });
  check("Mcp-Method not matching the body: 400 HeaderMismatch", mism.status === 400 && mism.json.error.code === -32020);
  const nameMism = await rpc("tools/call", { name: "list_clients", arguments: {} }, { auth: AT, modern: true, headers: { "Mcp-Name": "delete_post" } });
  check("Mcp-Name not matching the tool: 400", nameMism.status === 400 && nameMism.json.error.code === -32020);
  const b64 = await rpc("tools/call", { name: "list_clients", arguments: {} }, { auth: AT, modern: true, headers: { "Mcp-Name": `=?base64?${Buffer.from("list_clients").toString("base64")}?=` } });
  check("a base64-encoded Mcp-Name is decoded", b64.status === 200 && !b64.json.result.isError);
  const missing = await rpc("ping", {}, { auth: AT, modern: true, headers: { "MCP-Protocol-Version": "" } });
  check("a missing version header: 400", missing.status === 400);
  const clients = await call("list_clients", {}, AT);
  const sc = clients.json.result.structuredContent;
  check("list_clients: clients, accounts and the time", clients.json.result.resultType === "complete" && sc.clients[0].accounts[0].id === li.id && !!sc.now);
  check("unknown method: 404 Method not found", (await rpc("resources/list", {}, { auth: AT, modern: true })).status === 404);
  check("unknown tool: invalid params", (await call("nope", {}, AT)).json.error.code === -32602);

  console.log("\ntools");
  const draft = await call("create_post", { clientId: client.id, accountIds: [li.id], text: "Hello from Claude", action: "draft" }, AT);
  const draftOut = draft.json.result.structuredContent;
  check("create_post draft", draftOut?.status === "DRAFT" && draftOut.openInCue.endsWith(`/composer?edit=${draftOut.id}`), draft.json);
  const post = await prisma.post.findUnique({ where: { id: draftOut.id } });
  check("written as the member", post?.authorId === user.id);
  const past = await call("create_post", { clientId: client.id, accountIds: [li.id], text: "x", action: "schedule", scheduledAt: "2020-01-01T10:00:00+05:30" }, AT);
  check("scheduling in the past is a tool error it can fix", past.json.result.isError && /in the future/.test(past.json.result.content[0].text));
  const when = new Date(Date.now() + 3 * 86400_000).toISOString();
  const sched = await call("create_post", { clientId: client.id, accountIds: [li.id], text: "Launch day", action: "schedule", scheduledAt: when }, AT);
  check("create_post schedule", sched.json.result.structuredContent?.status === "SCHEDULED");
  const badArgs = await call("create_post", { clientId: client.id, accountIds: [], text: "x", action: "draft" }, AT);
  check("bad arguments: a readable tool error", badArgs.json.result.isError && /accountIds/.test(badArgs.json.result.content[0].text));
  const otherWs = await prisma.workspace.create({ data: { name: "Other" } });
  const stranger = await prisma.client.create({ data: { name: "Not yours", workspaceId: otherWs.id } });
  const cross = await call("create_post", { clientId: stranger.id, accountIds: [li.id], text: "x", action: "draft" }, AT);
  check("another workspace's client is refused", cross.json.result.isError);
  const posts = await call("list_posts", { status: "SCHEDULED" }, AT);
  check("list_posts", posts.json.result.structuredContent.posts.length === 1);
  const got = await call("get_post", { postId: draftOut.id }, AT);
  check("get_post", got.json.result.structuredContent.body === "Hello from Claude");
  check("delete_post", (await call("delete_post", { postId: draftOut.id }, AT)).json.result.structuredContent.deleted === true);
  check("deleting again: not found", /not found/i.test((await call("delete_post", { postId: draftOut.id }, AT)).json.result.content[0].text));

  console.log("\nother ways in, and out");
  const key = generateApiKey();
  await prisma.apiKey.create({ data: { name: "Claude Code", prefix: key.prefix, hash: key.hash, userId: user.id, workspaceId: ws.id } });
  check("a Cue API key works too (Claude Code)", (await rpc("tools/list", {}, { auth: key.key })).status === 200);
  check("an https Origin is fine", (await rpc("ping", {}, { auth: AT, headers: { Origin: "https://claude.ai" } })).status === 200);
  check("a plain-http Origin off localhost: 403", (await rpc("ping", {}, { auth: AT, headers: { Origin: "http://evil.example" } })).status === 403);
  check("GET: 405", (await mcpGet()).status === 405);
  await prisma.workspace.update({ where: { id: ws.id }, data: { disabledFeatures: ["api"] } });
  const off = await rpc("ping", {}, { auth: AT });
  check("API switched off for the workspace: 403 saying why", off.status === 403 && /turned off/.test(off.json.error));
  await prisma.workspace.update({ where: { id: ws.id }, data: { disabledFeatures: [] } });

  // People can be in several workspaces; a connection acts in the one it was approved in.
  await prisma.membership.create({ data: { userId: user.id, workspaceId: otherWs.id, role: "MANAGER" } });
  await prisma.user.update({ where: { id: user.id }, data: { workspaceId: otherWs.id, role: "MANAGER" } });
  const switched = await call("list_posts", { status: "SCHEDULED" }, AT);
  check("switching workspace in Cue: it still acts in the approved one", switched.json.result.structuredContent?.posts.length === 1);
  await prisma.membership.delete({ where: { userId_workspaceId: { userId: user.id, workspaceId: ws.id } } });
  const removed = await rpc("ping", {}, { auth: AT });
  check("removed from that workspace: 403 saying why", removed.status === 403 && /no longer in/.test(removed.json.error));
  await prisma.membership.create({ data: { userId: user.id, workspaceId: ws.id, role: "ADMIN" } });
  await prisma.user.update({ where: { id: user.id }, data: { workspaceId: ws.id, role: "ADMIN" } });

  await prisma.oAuthGrant.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
  check("disconnected in Settings: 401", (await rpc("ping", {}, { auth: AT })).status === 401);

  await prisma.oAuthClient.create({ data: { name: "Abandoned", redirectUris: [REDIRECT], createdAt: new Date(Date.now() - 8 * 86400_000) } });
  await pruneOAuth();
  check("apps that registered and never connected are cleaned up", !(await prisma.oAuthClient.findFirst({ where: { name: "Abandoned" } })));

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
