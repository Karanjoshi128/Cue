/*
 * The AI helpers against a THROWAWAY local Postgres, with the Claude API and
 * Instagram faked (no tokens spent). Same safety checks as
 * scripts/e2e-automations.ts:
 *   DATABASE_URL=postgresql://postgres@localhost:55432/cue_test \
 *   TOKEN_ENC_KEY=<64 hex> ANTHROPIC_API_KEY=test npx tsx scripts/e2e-ai.ts
 */
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import {
  AiError,
  classifyComments,
  draftCommentReply,
  moderateComment,
  writeDmVariants,
  type AutomationIdea,
} from "@/lib/ai";
import { holdReason } from "@/lib/automations/moderation";
import { presetFromIdea } from "@/lib/automations/preset";
import { syncReplyDesk } from "@/lib/reply-desk/sync";

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

// Claude: answers come from this queue; requests are kept for inspection.
type Fake = { json?: unknown; stop?: string; status?: number };
const queue: Fake[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const requests: { headers: Headers; body: any }[] = [];
const message = (f: Fake) =>
  new Response(
    f.status && f.status >= 400
      ? JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "nope" } })
      : JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: f.stop === "refusal" ? [] : [{ type: "text", text: JSON.stringify(f.json) }],
          stop_reason: f.stop ?? "end_turn",
          stop_sequence: null,
          ...(f.stop === "refusal" ? { stop_details: { type: "refusal", category: null, explanation: null } } : {}),
          usage: { input_tokens: 12, output_tokens: 34 },
        }),
    { status: f.status ?? 200, headers: { "Content-Type": "application/json", "request-id": "req_test" } },
  );

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(input instanceof Request ? input.url : String(input));
  if (u.host === "api.anthropic.com") {
    requests.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    const next = queue.shift();
    if (!next) throw new Error("Claude was called with nothing queued");
    return message(next);
  }
  const path = u.pathname.replace(/^\/v[\d.]+/, "");
  if (u.host === "graph.instagram.com") {
    if (path === "/me/media") return json({ data: [{ id: "m1", caption: "New menu", permalink: "https://instagram.com/p/m1" }] });
    if (path === "/m1/comments") {
      const now = new Date().toISOString();
      return json({
        data: [
          { id: "c1", text: "this place is a scam, avoid", timestamp: now, from: { id: "u1", username: "angry" } },
          { id: "c2", text: "is this vegan", timestamp: now, from: { id: "u2", username: "asks" } },
          { id: "c3", text: "🔥🔥", timestamp: now, from: { id: "u3", username: "fan" } },
        ],
      });
    }
  }
  throw new Error(`unhandled ${u.host}${u.pathname}`);
}) as typeof fetch;

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`select current_database() as db`;
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !db.includes("test")) {
    throw new Error(`Refusing to run against ${db}: needs a local database with "test" in its name.`);
  }
  if (process.env.ANTHROPIC_API_KEY !== "test") throw new Error("Run with ANTHROPIC_API_KEY=test: Claude is faked here.");

  console.log("\nevery request");
  queue.push({ json: { variants: ["Hi {username}! The menu: https://acme.example/m", "Hey {username}, here you go https://acme.example/m", "Hi {username}, no link in this one", "Hi {username}! The menu: https://acme.example/m", "Here's the menu https://acme.example/m"] } });
  const variants = await writeDmVariants("Hey {username}, here's our menu 👉 https://acme.example/m", 4);
  const req = requests.at(-1)!;
  check("Claude Opus 5.5", req.body.model === "claude-opus-5-5");
  check("server-side refusal fallback on", req.body.fallbacks === "default" && (req.headers.get("anthropic-beta") ?? "").includes("server-side-fallback-2026-07-01"));
  check("low effort", req.body.output_config?.effort === "low");
  check("structured output with a closed schema", req.body.output_config?.format?.type === "json_schema" && req.body.output_config.format.schema.additionalProperties === false);
  check("a stranger's text is fenced as data", req.body.messages[0].content.includes("<dm>"));

  console.log("\nDM variants");
  check("keeps versions with the link and {username}, drops the rest and repeats", variants.length === 2 && variants.every((v) => v.includes("https://acme.example/m") && v.includes("{username}")), variants);

  console.log("\nmoderation");
  queue.push({ json: { hold: true, reason: "Harassment" } });
  check("a held comment says why", (await moderateComment("you people are trash")) === "Harassment");
  queue.push({ json: { hold: false, reason: "" } });
  check("an ordinary complaint goes through", (await moderateComment("coffee was cold today")) === null);
  queue.push({ status: 400 });
  check("Claude failing doesn't stop automations (fails open)", (await moderateComment("hello")) === null);
  queue.push({ stop: "refusal" });
  check("a refusal fails open too", (await moderateComment("hello")) === null);
  const before = requests.length;
  check("hold words still work with AI off", (await holdReason({ holdWords: ["refund"], aiModeration: true }, "I want a REFUND", false)) === 'Contains "refund"');
  check("AI moderation is skipped while AI is off for the workspace", (await holdReason({ holdWords: [], aiModeration: true }, "anything", false)) === null && requests.length === before);
  queue.push({ json: { hold: true, reason: "Spam link" } });
  check("and runs while it's on", (await holdReason({ holdWords: [], aiModeration: true }, "buy followers at spam.example", true)) === "Spam link");

  console.log("\nreply drafts");
  queue.push({ json: { reply: "  We open at [time] every day, see you soon!  " } });
  const draft = await draftCommentReply({ brand: "Acme Cafe", platform: "INSTAGRAM", post: "New menu", comment: "what time do you open?", author: "asks" });
  check("a trimmed draft with a [blank] for facts it can't know", draft === "We open at [time] every day, see you soon!");
  queue.push({ stop: "refusal" });
  try {
    await draftCommentReply({ brand: "Acme", platform: "YOUTUBE", post: null, comment: "x", author: null });
    check("a refusal is reported", false);
  } catch (e) {
    check("a refusal is reported in words", e instanceof AiError && /wouldn't/.test(e.message));
  }

  console.log("\nsorting comments");
  queue.push({ json: { results: [{ id: "a", kind: "QUESTION" }, { id: "b", kind: "ABUSE" }, { id: "zzz", kind: "OTHER" }] } });
  const kinds = await classifyComments([{ id: "a", text: "kab tak open?" }, { id: "b", text: "scam" }]);
  check("kinds by id, unknown ids dropped", kinds.get("a") === "QUESTION" && kinds.get("b") === "ABUSE" && !kinds.has("zzz"));

  console.log("\ndescribed automations");
  const idea: AutomationIdea = {
    name: "Menu link for MENU, a name that runs on far past the sixty-character limit of the editor",
    trigger: "COMMENT",
    matchMode: "ANY_COMMENT",
    keywords: ["MENU", "Menu", "the full menu please, with prices and timings"],
    publicReplies: ["Sent! Check your DMs 📩", " ", "Two", "Three", "Four", "Five", "Six"],
    dmText: "Hey {username}! Here's our menu 👇",
    link: "acme.example/menu",
    buttonLabel: "See the menu, with prices",
    followGate: true,
    collect: null,
    followUp: false,
  };
  const preset = presetFromIdea(idea);
  check("held to the editor's limits", preset.name.length <= 60 && preset.keywords.join() === "menu" && preset.replies.length === 5 && !preset.replies.includes(""));
  check("a keyword means a word match, not every comment", preset.matchMode === "WORD");
  check("the link becomes an https button", preset.buttonUrl === "https://acme.example/menu" && preset.buttonLabel === "See the menu, with p");
  check("an invented or unsafe link is dropped", presetFromIdea({ ...idea, link: "javascript:alert(1)" }).buttonUrl === null && presetFromIdea({ ...idea, link: "menu" }).buttonUrl === null);
  check("no public replies for story replies", presetFromIdea({ ...idea, trigger: "STORY_REPLY", keywords: [] }).replies.length === 0 && presetFromIdea({ ...idea, trigger: "STORY_REPLY", keywords: [] }).matchMode === "ANY_COMMENT");

  console.log("\nReply Desk with AI");
  for (const t of ["inboxComment", "socialAccount", "client", "user", "workspace"] as const) {
    // @ts-expect-error every model here has deleteMany
    await prisma[t].deleteMany();
  }
  const ws = await prisma.workspace.create({ data: { name: "AI WS" } });
  const client = await prisma.client.create({ data: { name: "Acme", workspaceId: ws.id } });
  await prisma.socialAccount.create({
    data: {
      clientId: client.id,
      platform: "INSTAGRAM",
      externalId: "IGBIZ",
      displayName: "@acme.cafe",
      accessToken: encrypt("t"),
      tokenExpires: new Date(Date.now() + 30 * 86400_000),
      scopes: "instagram_business_basic,instagram_business_manage_comments",
    },
  });
  queue.push({ json: { results: [{ id: "c1", kind: "ABUSE" }, { id: "c2", kind: "QUESTION" }] } });
  await syncReplyDesk();
  const rows = Object.fromEntries((await prisma.inboxComment.findMany()).map((r) => [r.externalId, r.kind]));
  const sent = requests.at(-1)!.body.messages[0].content as string;
  check("Claude catches abuse the rules call ordinary", rows.c1 === "ABUSE");
  check("and a question without a question mark", rows.c2 === "QUESTION");
  check("emoji-only comments aren't sent to Claude", rows.c3 === "NOISE" && !sent.includes("🔥"));
  const calls = requests.length;
  await prisma.socialAccount.updateMany({ data: { inboxSyncedAt: null } });
  await syncReplyDesk();
  check("comments already stored aren't sorted again", requests.length === calls);
  await prisma.inboxComment.deleteMany();
  await prisma.workspace.update({ where: { id: ws.id }, data: { disabledFeatures: ["ai"] } });
  await prisma.socialAccount.updateMany({ data: { inboxSyncedAt: null } });
  await syncReplyDesk();
  const off = Object.fromEntries((await prisma.inboxComment.findMany()).map((r) => [r.externalId, r.kind]));
  check("AI off for the workspace: no call, the rules decide", requests.length === calls && off.c1 === "OTHER" && off.c2 === "OTHER");
  check("nothing left queued", queue.length === 0, queue);

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
