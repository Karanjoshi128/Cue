/*
 * End-to-end test of Instagram automations against a THROWAWAY local Postgres,
 * with Instagram's API faked. Never point it at a real database: it deletes
 * every workspace first, and refuses to run unless DATABASE_URL is local and
 * the database name contains "test".
 *
 *   1. createdb cue_test on a local Postgres, then push the schema to it
 *      (prisma db push --schema <copy with the local URL written in>).
 *   2. DATABASE_URL=postgresql://postgres@localhost:55432/cue_test \
 *      TOKEN_ENC_KEY=<64 hex chars> META_APP_SECRET=test-secret \
 *      NEXT_PUBLIC_IG_AUTOMATIONS=1 npx tsx scripts/e2e-automations.ts
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { matchesKeywords, cleanKeywords, findEmail, findPhone } from "@/lib/automations/match";
import { hasAutomationScopes, instagramScopes } from "@/lib/automations/config";
import { verifySignature, commentsFromWebhook, messagesFromWebhook } from "@/lib/automations/webhook";
import {
  ingestComments,
  processRun,
  pollAccount,
  handleWebhookComments,
  automationBlocker,
} from "@/lib/automations/engine";
import { handleIncomingMessages, sendFollowUps, type IncomingMessage } from "@/lib/automations/conversation";
import { runAutomations } from "@/lib/automations/cron";
import { accountSelect, tapPayload } from "@/lib/automations/shared";

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

// ------------------------------------------------------------ Instagram fake
const IG = "17841400000000001";
type Call = { method: string; url: string; path: string; body: Record<string, unknown> | undefined };
const calls: Call[] = [];
let media: { id: string; timestamp: string }[] = [];
const comments: Record<string, unknown[]> = {};
const commentAuthor = new Map<string, string>(); // comment id -> commenter igsid
const followers = new Set<string>();
const rateLimitOnce = new Set<string>();
let templateRejected = false;
let mid = 0;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  if (!url.startsWith("https://graph.instagram.com/")) throw new Error(`unexpected fetch ${url}`);
  const u = new URL(url);
  const path = u.pathname.replace(/^\/v[\d.]+/, "");
  calls.push({ method, url, path, body });

  if (method === "GET" && path === "/me/media") return json(200, { data: media });
  const cm = /^\/([^/]+)\/comments$/.exec(path);
  if (method === "GET" && cm) return json(200, { data: comments[cm[1]] ?? [] });
  const rp = /^\/([^/]+)\/replies$/.exec(path);
  if (method === "POST" && rp) return json(200, { id: `reply_${rp[1]}` });
  if (method === "POST" && path === `/${IG}/messages`) {
    const r = body.recipient as { comment_id?: string; id?: string };
    const key = r.comment_id ?? r.id ?? "";
    if (key.includes("nontester")) {
      return json(400, { error: { message: "(#100) Thread does not exist", code: 100, error_subcode: 2534001 } });
    }
    if (rateLimitOnce.has(key)) {
      rateLimitOnce.delete(key);
      return json(400, { error: { message: "(#4) Application request limit reached", code: 4, is_transient: true } });
    }
    if (templateRejected && (body.message as { attachment?: unknown }).attachment) {
      return json(400, { error: { message: "(#100) Invalid parameter", code: 100 } });
    }
    const recipientId = r.comment_id ? (commentAuthor.get(r.comment_id) ?? "igsid_unknown") : r.id;
    return json(200, { recipient_id: recipientId, message_id: `mid_${++mid}` });
  }
  if (method === "GET" && path.startsWith("/igsid_")) {
    const id = path.slice(1);
    return json(200, { username: id.replace("igsid_", ""), is_user_follow_business: followers.has(id) });
  }
  if (method === "POST" && path === "/me/subscribed_apps") return json(200, { success: true });
  throw new Error(`unhandled ${method} ${path}`);
}) as typeof fetch;

function comment(id: string, text: string, from: string, minutesAgo = 1, extra: object = {}) {
  commentAuthor.set(id, `igsid_${from}`);
  return {
    id,
    text,
    timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    from: { id: `igsid_${from}`, username: from },
    ...extra,
  };
}

/** The messages sent to one recipient (a comment id or an igsid), oldest first. */
function messagesTo(key: string) {
  return calls
    .filter((c) => c.method === "POST" && c.path === `/${IG}/messages`)
    .filter((c) => {
      const r = c.body!.recipient as { comment_id?: string; id?: string };
      return r.comment_id === key || r.id === key;
    })
    .map((c) => c.body!.message as {
      text?: string;
      attachment?: { payload: { text: string; buttons: { type: string; payload?: string; url?: string; title: string }[] } };
    });
}
const textOf = (m: ReturnType<typeof messagesTo>[number] | undefined) => m?.text ?? m?.attachment?.payload.text ?? "";
const buttonOf = (m: ReturnType<typeof messagesTo>[number] | undefined) => m?.attachment?.payload.buttons[0];

function dm(senderId: string, text: string, extra: Partial<IncomingMessage> = {}): IncomingMessage {
  return { igUserId: IG, senderId, mid: `m_${crypto.randomUUID()}`, text, payload: null, storyId: null, isEcho: false, at: new Date(), ...extra };
}
const tap = (senderId: string, runId: string) => dm(senderId, "Send me the link", { payload: tapPayload(runId) });

async function accountRow(id: string) {
  return prisma.socialAccount.findUniqueOrThrow({ where: { id }, select: accountSelect });
}
const runOf = (commentId: string) => prisma.automationRun.findUniqueOrThrow({ where: { commentId } });

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`select current_database() as db`;
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !db.includes("test")) {
    throw new Error(`Refusing to run against ${db}: needs a local database with "test" in its name.`);
  }

  for (const t of [
    "automationRun", "automationRule", "lead", "inboxComment", "bioClick", "bioPage", "alertLog",
    "postTarget", "post", "socialAccount", "client", "user", "workspace",
  ] as const) {
    // @ts-expect-error every model here has deleteMany
    await prisma[t].deleteMany();
  }

  console.log("\nmatcher");
  check("WORD matches LINK in sentence", matchesKeywords("LINK please 🙏", ["link"], "WORD"));
  check("WORD ignores 'linked'", !matchesKeywords("I linked it", ["link"], "WORD"));
  check("WORD matches phrase", matchesKeywords("can you send link?", ["send link"], "WORD"));
  check("WORD matches full-width", matchesKeywords("ＬＩＮＫ", ["link"], "WORD"));
  check("WORD matches Hindi", matchesKeywords("मुझे गाइड चाहिए", ["गाइड"], "WORD"));
  check("WORD matches emoji keyword", matchesKeywords("🔥🔥", ["🔥"], "WORD"));
  check("CONTAINS matches 'linked'", matchesKeywords("I linked it", ["link"], "CONTAINS"));
  check("ANY_COMMENT matches", matchesKeywords("hi", [], "ANY_COMMENT"));
  check("keyword with regex chars", matchesKeywords("price? $49", ["$49"], "WORD"));
  check("cleanKeywords dedupes + lowercases", JSON.stringify(cleanKeywords([" LINK", "link", "", "Guide "])) === '["link","guide"]');
  check("fuzzy: swapped letters (lnik)", matchesKeywords("lnik pls", ["link"], "WORD", true));
  check("fuzzy: doubled letter (linkk)", matchesKeywords("linkk", ["link"], "WORD", true));
  check("fuzzy: 4 letters don't take a different word (line)", !matchesKeywords("next line", ["link"], "WORD", true));
  check("fuzzy: 5+ letters take one slip (gude)", matchesKeywords("gude please", ["guide"], "WORD", true));
  check("fuzzy: not two slips (gde)", !matchesKeywords("gde", ["guide"], "WORD", true));
  check("fuzzy off: lnik doesn't match", !matchesKeywords("lnik", ["link"], "WORD", false));
  check("fuzzy: under 4 letters stays exact", !matchesKeywords("hii", ["hi"], "WORD", true));
  check("findEmail picks the address", findEmail("sure it's Maya@Example.com.") === "maya@example.com");
  check("findEmail rejects junk", findEmail("no thanks") === null);
  check("findPhone keeps + and digits", findPhone("call +91 98765-43210 pls") === "+919876543210");
  check("findPhone rejects short numbers", findPhone("room 12") === null);

  console.log("\nconfig");
  check("default connect = publishing only", instagramScopes().join() === "instagram_business_basic,instagram_business_content_publish");
  check("?comments=1 adds comments only", instagramScopes({ comments: true }).includes("instagram_business_manage_comments") && !instagramScopes({ comments: true }).includes("instagram_business_manage_messages"));
  check("?automations=1 adds comments + messages", hasAutomationScopes(instagramScopes({ automations: true }).join(",")));

  console.log("\nwebhook parsing + signature");
  const payload = {
    object: "instagram",
    entry: [{ id: IG, time: Math.floor(Date.now() / 1000), changes: [{ field: "comments", value: { id: "wh_1", text: "GUIDE pls", from: { id: "igsid_webhook.fan", username: "webhook.fan" }, media: { id: "m_any", media_product_type: "FEED" } } }, { field: "live_comments", value: { id: "x" } }] }],
  };
  commentAuthor.set("wh_1", "igsid_webhook.fan");
  const raw = JSON.stringify(payload);
  const sig = "sha256=" + crypto.createHmac("sha256", process.env.META_APP_SECRET!).update(raw).digest("hex");
  check("valid signature accepted", verifySignature(raw, sig));
  check("tampered body rejected", !verifySignature(raw + " ", sig));
  check("missing header rejected", !verifySignature(raw, null));
  const parsed = commentsFromWebhook(payload);
  check("parses one comment for the account", parsed.get(IG)?.length === 1 && parsed.get(IG)![0].mediaId === "m_any");
  const msgPayload = {
    object: "instagram",
    entry: [{
      id: IG, time: Date.now(),
      messaging: [
        { sender: { id: "igsid_a" }, recipient: { id: IG }, timestamp: Date.now(), postback: { mid: "pb1", title: "Send me the link", payload: "cue:tap:run1" } },
        { sender: { id: "igsid_b" }, recipient: { id: IG }, timestamp: Date.now(), message: { mid: "mm1", text: "love it", reply_to: { story: { id: "story9", url: "x" } } } },
        { sender: { id: IG }, recipient: { id: "igsid_b" }, timestamp: Date.now(), message: { mid: "mm2", text: "thanks!", is_echo: true } },
      ],
    }],
  };
  const msgs = messagesFromWebhook(msgPayload);
  check("parses a postback", msgs[0]?.payload === "cue:tap:run1" && msgs[0].senderId === "igsid_a");
  check("parses a story reply", msgs[1]?.storyId === "story9" && msgs[1].text === "love it");
  check("flags echoes", msgs[2]?.isEcho === true);

  // A workspace with one Instagram account that has comment + message access.
  const ws = await prisma.workspace.create({ data: { name: "Test WS" } });
  const user = await prisma.user.create({ data: { email: "t@example.com", workspaceId: ws.id, role: "ADMIN" } });
  const client = await prisma.client.create({ data: { name: "Local Test Client", workspaceId: ws.id } });
  const account = await prisma.socialAccount.create({
    data: {
      clientId: client.id, platform: "INSTAGRAM", externalId: IG, displayName: "@cue.test",
      accessToken: encrypt("token-abc"), refreshToken: encrypt("token-abc"),
      tokenExpires: new Date(Date.now() + 50 * 24 * 3600_000),
      scopes: instagramScopes({ automations: true }).join(","),
    },
  });
  const hourAgo = new Date(Date.now() - 3600_000);
  const base = { clientId: client.id, accountId: account.id, activeSince: hourAgo };
  const anyRule = await prisma.automationRule.create({
    data: {
      ...base, name: "Guide", scope: "ANY_POST", keywords: ["guide", "link"], matchMode: "WORD",
      replies: ["Sent {username}!"], dmText: "Hey {username}, here you go", dmButtonLabel: "Open", dmButtonUrl: "https://example.com/guide",
    },
  });

  console.log("\npoll: match, ignore, dedupe, once-per-person, leads");
  media = [{ id: "m_any", timestamp: new Date().toISOString() }];
  comments.m_any = [
    comment("c_match", "GUIDE please!", "maya"),
    comment("c_nomatch", "nice photo", "raj"),
    comment("c_own", "guide", "cue.test"),
    comment("c_reply", "guide", "maya", 1, { parent_id: "c_match" }),
    comment("c_old", "guide", "old.fan", 8 * 24 * 60),
    comment("c_before_active", "guide", "early.bird", 120),
    comment("c_again", "link?", "maya"),
    comment("c_nontester", "LINK", "nontester"),
    comment("c_typo", "lnik pls", "typo.fan"),
  ];
  const r1 = await pollAccount(account.id);
  const byId = Object.fromEntries((await prisma.automationRun.findMany()).map((r) => [r.commentId, r]));
  check("poll returned no error", !r1.error, r1.error);
  check("matching comment SENT", byId.c_match?.status === "SENT", byId.c_match);
  check("delivered in one step (no gate)", byId.c_match?.stage === "DONE" && byId.c_match?.deliveredAt);
  check("recipientId kept from the private reply", byId.c_match?.recipientId === "igsid_maya");
  check("non-matching ignored", !byId.c_nomatch);
  check("own comment ignored", !byId.c_own);
  check("reply comment ignored", !byId.c_reply);
  check("8-day-old comment ignored", !byId.c_old);
  check("comment before activeSince ignored", !byId.c_before_active);
  check("same person again SKIPPED", byId.c_again?.status === "SKIPPED", byId.c_again);
  check("non-tester DM FAILED with tester hint", byId.c_nontester?.status === "FAILED" && /Instagram Testers/.test(byId.c_nontester?.dmError ?? ""));
  check("no public reply when DM failed", byId.c_nontester?.replyId === null && /DM didn't go/.test(byId.c_nontester?.replyError ?? ""));
  check("typo 'lnik' triggers (fuzzy on by default)", byId.c_typo?.status === "SENT");
  const first = messagesTo("c_match")[0];
  check("DM sent as a link button", buttonOf(first)?.type === "web_url" && buttonOf(first)?.url === "https://example.com/guide");
  check("{username} filled in DM", textOf(first) === "Hey @maya, here you go");
  check("bearer token, not query param", !calls.some((c) => c.url.includes("access_token")));
  const leadMaya = await prisma.lead.findUnique({ where: { accountId_igsid: { accountId: account.id, igsid: "igsid_maya" } } });
  check("lead recorded with 2 touches", leadMaya?.username === "maya" && leadMaya.touches === 2 && leadMaya.source === "COMMENT", leadMaya);
  const ruleAfter = await prisma.automationRule.findUniqueOrThrow({ where: { id: anyRule.id } });
  check("counters: matched 4, dm 2, delivered 2, reply 2", ruleAfter.matchedCount === 4 && ruleAfter.dmSentCount === 2 && ruleAfter.deliveredCount === 2 && ruleAfter.replyCount === 2, ruleAfter);
  const before = await prisma.automationRun.count();
  await pollAccount(account.id);
  check("re-polling creates no duplicates", (await prisma.automationRun.count()) === before);

  console.log("\nhold words");
  await prisma.automationRule.update({ where: { id: anyRule.id }, data: { holdWords: ["scam"] } });
  comments.m_any.push(comment("c_scam", "is this guide a SCAM?", "angry.user"));
  const sentBefore = calls.length;
  await pollAccount(account.id);
  const held = await runOf("c_scam");
  check("held, nothing sent", held.status === "HELD" && /scam/.test(held.heldReason ?? "") && calls.filter((c) => c.method === "POST").length === calls.slice(0, sentBefore).filter((c) => c.method === "POST").length);
  check("heldCount counted", (await prisma.automationRule.findUniqueOrThrow({ where: { id: anyRule.id } })).heldCount === 1);
  await prisma.automationRule.update({ where: { id: anyRule.id }, data: { holdWords: [] } });

  console.log("\nrate limit retry, template fallback");
  comments.m_any.push(comment("c_throttled", "link", "busy.user"));
  rateLimitOnce.add("c_throttled");
  await pollAccount(account.id);
  let throttled = await runOf("c_throttled");
  check("throttled run stays QUEUED", throttled.status === "QUEUED" && /limit/.test(throttled.lastError ?? ""));
  check("not due yet → processRun returns null", (await processRun(throttled.id)) === null);
  await prisma.automationRun.update({ where: { id: throttled.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
  check("retry sends", (await processRun(throttled.id)) === "SENT");
  throttled = await runOf("c_throttled");
  check("lastError cleared, 2 attempts", throttled.lastError === null && throttled.attempts === 2);
  templateRejected = true;
  comments.m_any.push(comment("c_plain", "guide", "plain.user"));
  await pollAccount(account.id);
  check("refused template falls back to text with the link", (await runOf("c_plain")).status === "SENT" && textOf(messagesTo("c_plain").at(-1)).includes("https://example.com/guide"));
  templateRejected = false;

  console.log("\nDM variants rotate");
  const variants = await prisma.automationRule.create({
    data: { ...base, name: "Variants", scope: "ONE_POST", mediaId: "m_var", keywords: ["promo"], dmText: "A", dmVariants: ["B"], rotateEvery: 1 },
  });
  media = [{ id: "m_var", timestamp: new Date().toISOString() }, ...media];
  comments.m_var = [comment("c_v1", "promo", "v.one", 3), comment("c_v2", "promo", "v.two", 2), comment("c_v3", "promo", "v.three", 1)];
  await pollAccount(account.id);
  check("texts rotate A, B, A", ["c_v1", "c_v2", "c_v3"].map((id) => textOf(messagesTo(id)[0])).join("") === "ABA");
  await prisma.automationRule.update({ where: { id: variants.id }, data: { enabled: false } });

  console.log("\npacing");
  const filler = Array.from({ length: 200 }, (_, i) => ({
    ruleId: anyRule.id, commentId: `filler_${i}`, mediaId: "m_any", commenterId: `x${i}`, commentText: "x",
    commentedAt: new Date(), source: "POLL" as const, status: "SENT" as const, dmSentAt: new Date(), stage: "DONE" as const,
  }));
  await prisma.automationRun.createMany({ data: filler });
  comments.m_any.push(comment("c_paced", "guide", "paced.user"));
  await pollAccount(account.id);
  let paced = await runOf("c_paced");
  check("at the hourly cap the run waits", paced.status === "QUEUED" && /Pacing/.test(paced.lastError ?? "") && paced.attempts === 0, paced);
  await prisma.automationRun.deleteMany({ where: { commentId: { startsWith: "filler_" } } });
  await prisma.automationRun.update({ where: { id: paced.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
  await processRun(paced.id);
  paced = await runOf("c_paced");
  check("goes out once under the cap", paced.status === "SENT");

  console.log("\nfollow gate");
  await prisma.automationRule.update({ where: { id: anyRule.id }, data: { enabled: false } });
  const gate = await prisma.automationRule.create({
    data: {
      ...base, name: "Gate", scope: "ONE_POST", mediaId: "m_gate", keywords: ["free"], replies: ["Check your DMs"],
      dmText: "Here's the freebie", dmButtonLabel: "Get it", dmButtonUrl: "https://example.com/free", followGate: true,
      followUpText: "Still want it? Tap below once you follow.", followUpMinutes: 1,
    },
  });
  media = [{ id: "m_gate", timestamp: new Date().toISOString() }];
  comments.m_gate = [comment("c_gate", "FREE pls", "gate.fan")];
  await pollAccount(account.id);
  let g = await runOf("c_gate");
  const gateMsg = messagesTo("c_gate")[0];
  check("first DM is the tap button", buttonOf(gateMsg)?.type === "postback" && buttonOf(gateMsg)?.payload === tapPayload(g.id));
  check("run waits for the tap", g.status === "SENT" && g.stage === "WAIT_TAP" && g.recipientId === "igsid_gate.fan" && !g.deliveredAt);
  check("no follow-up before they interact (window closed)", g.followUpAt === null);
  await handleIncomingMessages([tap("igsid_gate.fan", g.id)]);
  g = await runOf("c_gate");
  const notFollowing = messagesTo("igsid_gate.fan").at(-1);
  check("non-follower is asked to follow, with the button again", /Follow @cue.test first/.test(textOf(notFollowing)) && buttonOf(notFollowing)?.type === "postback");
  check("stage WAIT_FOLLOW, follow-up scheduled", g.stage === "WAIT_FOLLOW" && g.followUpAt !== null && g.lastUserAt !== null);
  await prisma.automationRun.update({ where: { id: g.id }, data: { followUpAt: new Date(Date.now() - 1000) } });
  check("follow-up sends once", (await sendFollowUps()) === 1 && (await sendFollowUps()) === 0);
  check("follow-up text went out", /Still want it/.test(textOf(messagesTo("igsid_gate.fan").at(-1))));
  followers.add("igsid_gate.fan");
  await handleIncomingMessages([tap("igsid_gate.fan", g.id)]);
  g = await runOf("c_gate");
  const delivered = messagesTo("igsid_gate.fan").at(-1);
  check("follower gets the link", textOf(delivered) === "Here's the freebie" && buttonOf(delivered)?.url === "https://example.com/free");
  check("run DONE and delivered", g.stage === "DONE" && g.deliveredAt !== null);
  check("deliveredCount counted once", (await prisma.automationRule.findUniqueOrThrow({ where: { id: gate.id } })).deliveredCount === 1);
  const wrongPerson = messagesTo("igsid_intruder").length;
  await handleIncomingMessages([tap("igsid_intruder", g.id)]);
  check("someone else's tap is ignored", messagesTo("igsid_intruder").length === wrongPerson);

  console.log("\nreplying YES counts as the tap");
  comments.m_gate.push(comment("c_gate2", "free", "yes.fan"));
  followers.add("igsid_yes.fan");
  await pollAccount(account.id);
  await handleIncomingMessages([dm("igsid_yes.fan", "YES")]);
  check("text reply delivers to a follower", (await runOf("c_gate2")).stage === "DONE");

  console.log("\nfollow gate + email capture");
  await prisma.automationRule.update({ where: { id: gate.id }, data: { enabled: false } });
  const capture = await prisma.automationRule.create({
    data: {
      ...base, name: "Capture", scope: "ONE_POST", mediaId: "m_cap", keywords: ["ebook"], dmText: "Your ebook",
      dmButtonLabel: "Download", dmButtonUrl: "https://example.com/ebook", followGate: true, collect: "EMAIL",
    },
  });
  media = [{ id: "m_cap", timestamp: new Date().toISOString() }];
  comments.m_cap = [comment("c_cap", "ebook", "reader")];
  followers.add("igsid_reader");
  await pollAccount(account.id);
  let c = await runOf("c_cap");
  await handleIncomingMessages([tap("igsid_reader", c.id)]);
  c = await runOf("c_cap");
  check("follower is asked for an email", c.stage === "WAIT_ANSWER" && /email/.test(textOf(messagesTo("igsid_reader").at(-1))));
  await handleIncomingMessages([dm("igsid_reader", "nope")]);
  check("a non-email gets asked again", (await runOf("c_cap")).stage === "WAIT_ANSWER" && /doesn't look like an email/.test(textOf(messagesTo("igsid_reader").at(-1))));
  await handleIncomingMessages([dm("igsid_reader", "it's Reader@Mail.com.")]);
  c = await runOf("c_cap");
  const lead = await prisma.lead.findUnique({ where: { accountId_igsid: { accountId: account.id, igsid: "igsid_reader" } } });
  check("email saved on the lead", lead?.email === "reader@mail.com", lead);
  check("then the link, run DONE", c.stage === "DONE" && buttonOf(messagesTo("igsid_reader").at(-1))?.url === "https://example.com/ebook");
  check("leadCount counted", (await prisma.automationRule.findUniqueOrThrow({ where: { id: capture.id } })).leadCount === 1);

  console.log("\nstory reply trigger");
  const story = await prisma.automationRule.create({
    data: { ...base, name: "Story", trigger: "STORY_REPLY", matchMode: "ANY_COMMENT", dmText: "Thanks for the reply! Here's the link", dmButtonLabel: "Open", dmButtonUrl: "https://example.com/story" },
  });
  const repliesBefore = calls.filter((x) => x.path.endsWith("/replies")).length;
  await handleIncomingMessages([dm("igsid_story.fan", "🔥", { storyId: "story1" })]);
  const sRun = await prisma.automationRun.findFirst({ where: { ruleId: story.id } });
  check("story reply starts a run", sRun?.trigger === "STORY_REPLY" && sRun.status === "SENT" && sRun.mediaId === "story1");
  check("answered by DM to the person, no public reply", buttonOf(messagesTo("igsid_story.fan").at(-1))?.url === "https://example.com/story" && calls.filter((x) => x.path.endsWith("/replies")).length === repliesBefore);
  check("lead source STORY_REPLY", (await prisma.lead.findUnique({ where: { accountId_igsid: { accountId: account.id, igsid: "igsid_story.fan" } } }))?.source === "STORY_REPLY");

  console.log("\nDM keyword trigger");
  const dmRule = await prisma.automationRule.create({
    data: { ...base, name: "Price", trigger: "DM_KEYWORD", keywords: ["price"], dmText: "Plans start at ₹999", collect: "PHONE" },
  });
  await handleIncomingMessages([dm("igsid_buyer", "hi")]);
  check("a DM without the keyword is ignored", !(await prisma.automationRun.findFirst({ where: { ruleId: dmRule.id } })));
  await handleIncomingMessages([dm("igsid_buyer", "what's the prize?")]);
  let d = await prisma.automationRun.findFirst({ where: { ruleId: dmRule.id } });
  check("typo 'prize' matches 'price' and asks for a phone", d?.stage === "WAIT_ANSWER" && /phone/.test(textOf(messagesTo("igsid_buyer").at(-1))));
  await handleIncomingMessages([dm("igsid_buyer", "+91 99999 88888")]);
  d = await prisma.automationRun.findFirst({ where: { ruleId: dmRule.id } });
  check("phone saved, then the answer", d?.stage === "DONE" && textOf(messagesTo("igsid_buyer").at(-1)) === "Plans start at ₹999");
  check("phone on the lead", (await prisma.lead.findUnique({ where: { accountId_igsid: { accountId: account.id, igsid: "igsid_buyer" } } }))?.phone === "+919999988888");
  const echoBefore = calls.length;
  await handleIncomingMessages([dm(IG, "price", { isEcho: true })]);
  check("echoes are ignored", calls.length === echoBefore);

  console.log("\nwebhook comments + blockers");
  await prisma.automationRule.update({ where: { id: anyRule.id }, data: { enabled: true, activeSince: hourAgo } });
  await handleWebhookComments(commentsFromWebhook(payload));
  check("webhook comment SENT with source WEBHOOK", (await runOf("wh_1")).source === "WEBHOOK");
  await handleWebhookComments(commentsFromWebhook(payload));
  check("re-delivered webhook ignored", (await prisma.automationRun.count({ where: { commentId: "wh_1" } })) === 1);
  await prisma.socialAccount.update({ where: { id: account.id }, data: { scopes: instagramScopes({ comments: true }).join(",") } });
  check("blocker without message access", /Reconnect/.test(automationBlocker(await accountRow(account.id)) ?? ""));
  await prisma.socialAccount.update({ where: { id: account.id }, data: { scopes: instagramScopes({ automations: true }).join(",") } });

  console.log("\ncron");
  const old = await prisma.automationRun.create({
    data: { ruleId: anyRule.id, commentId: "c_ancient", mediaId: "m_any", commenterId: "x", commentText: "guide", commentedAt: new Date(Date.now() - 40 * 86400_000), source: "POLL", status: "SENT", createdAt: new Date(Date.now() - 31 * 86400_000) },
  });
  media = [{ id: "m_any", timestamp: new Date().toISOString() }];
  comments.m_any.push(comment("c_cron", "link", "cron.user", 0));
  const summary = await runAutomations();
  check("cron polled and sent", "polled" in summary && summary.polled === 1 && (await runOf("c_cron")).status === "SENT", summary);
  check("cron purged a 31-day-old run", !(await prisma.automationRun.findUnique({ where: { id: old.id } })));
  check("leads survive the purge", (await prisma.lead.count()) > 0);
  void ingestComments;
  void user;

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
