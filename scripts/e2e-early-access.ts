/*
 * End-to-end test of early access: Instagram automations and the Reply Desk
 * unlocked for one workspace (Workspace.earlyFeatures, Admin → Users) while
 * their launch flags are off. THROWAWAY local Postgres only, with Instagram's
 * API faked: it deletes every workspace first, and refuses to run unless
 * DATABASE_URL is local and the database name contains "test".
 *
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:55432/cue_test \
 *   TOKEN_ENC_KEY=<64 hex chars> META_APP_SECRET=test-secret \
 *   npx tsx scripts/e2e-early-access.ts
 */
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { instagramScopes } from "@/lib/automations/config";
import { commentsFromWebhook } from "@/lib/automations/webhook";
import { automationBlocker, handleWebhookComments } from "@/lib/automations/engine";
import { accountSelect } from "@/lib/automations/shared";
import { runAutomations } from "@/lib/automations/cron";
import { syncReplyDesk } from "@/lib/reply-desk/sync";
import {
  featureAvailable,
  featureAvailableAnywhere,
  featuresAvailable,
  workspaceFeatureAvailable,
} from "@/lib/plans";
import { visibleNavItems } from "@/components/nav-items";

// Both launch flags off: only unlocked workspaces may use the features.
delete process.env.NEXT_PUBLIC_IG_AUTOMATIONS;
delete process.env.NEXT_PUBLIC_REPLY_DESK;

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
const IG_A = "17841400000000101"; // the unlocked workspace's account
const IG_B = "17841400000000202"; // the locked one's
const sent: { account: string; recipient: string }[] = [];
const comments: Record<string, unknown[]> = {};

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
  // instagram-api.ts sends the token as a Bearer header.
  const token = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "");
  if (method === "GET" && path === "/me/media") {
    return json(200, { data: [{ id: token === "token-a" ? "m_a" : "m_b", timestamp: new Date().toISOString() }] });
  }
  const cm = /^\/([^/]+)\/comments$/.exec(path);
  if (method === "GET" && cm) return json(200, { data: comments[cm[1]] ?? [] });
  if (method === "POST" && /^\/[^/]+\/replies$/.test(path)) return json(200, { id: "reply_1" });
  const msg = /^\/([^/]+)\/messages$/.exec(path);
  if (method === "POST" && msg) {
    const r = body.recipient as { comment_id?: string; id?: string };
    sent.push({ account: msg[1], recipient: r.comment_id ?? r.id ?? "" });
    return json(200, { recipient_id: "igsid_fan", message_id: `mid_${sent.length}` });
  }
  if (method === "GET" && path.startsWith("/igsid_")) return json(200, { username: "fan", is_user_follow_business: true });
  if (method === "POST" && path === "/me/subscribed_apps") return json(200, { success: true });
  throw new Error(`unhandled ${method} ${path}`);
}) as typeof fetch;

// Polled comments come from someone new: "once per person" would skip the
// webhook's commenter.
const comment = (id: string, text: string, from: string) => ({
  id,
  text,
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  from: { id: `igsid_${from}`, username: from },
});

function webhook(ig: string, commentId: string, mediaId: string) {
  return commentsFromWebhook({
    object: "instagram",
    entry: [{
      id: ig,
      time: Math.floor(Date.now() / 1000),
      changes: [{ field: "comments", value: { id: commentId, text: "LINK please", from: { id: "igsid_fan", username: "fan" }, media: { id: mediaId, media_product_type: "FEED" } } }],
    }],
  });
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`select current_database() as db`;
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !db.includes("test")) {
    throw new Error(`Refusing to run against ${db}: needs a local database with "test" in its name.`);
  }
  for (const t of [
    "automationRun", "automationRule", "lead", "inboxComment", "bioClick", "bioPage", "alertLog",
    "postTarget", "post", "socialAccount", "client", "membership", "user", "workspace",
  ] as const) {
    // @ts-expect-error every model here has deleteMany
    await prisma[t].deleteMany();
  }

  // Two workspaces, alike except that one is unlocked early.
  const scopes = instagramScopes({ comments: true, automations: true }).join(",");
  async function workspace(name: string, ig: string, token: string, early: string[]) {
    const ws = await prisma.workspace.create({ data: { name, earlyFeatures: early } });
    const client = await prisma.client.create({ data: { name: `${name} client`, workspaceId: ws.id } });
    const account = await prisma.socialAccount.create({
      data: {
        clientId: client.id, platform: "INSTAGRAM", externalId: ig, displayName: `@${name.toLowerCase()}`,
        accessToken: encrypt(token), refreshToken: encrypt(token),
        tokenExpires: new Date(Date.now() + 50 * 24 * 3600_000), scopes,
      },
    });
    await prisma.automationRule.create({
      data: {
        clientId: client.id, accountId: account.id, name: "Link", scope: "ANY_POST", keywords: ["link"],
        matchMode: "WORD", dmText: "Here you go", activeSince: new Date(Date.now() - 3600_000),
      },
    });
    return { ws, account };
  }
  const a = await workspace("Early", IG_A, "token-a", ["ig_automations", "reply_desk"]);
  const b = await workspace("Locked", IG_B, "token-b", []);

  console.log("\navailability with both flags off");
  check("unlocked workspace has automations", featureAvailable(a.ws, "ig_automations"));
  check("unlocked workspace has the Reply Desk", await workspaceFeatureAvailable(a.ws.id, "reply_desk"));
  check("locked workspace has neither", !featureAvailable(b.ws, "ig_automations") && !(await workspaceFeatureAvailable(b.ws.id, "reply_desk")));
  check("available somewhere", await featureAvailableAnywhere("ig_automations"));
  const navA = visibleNavItems(featuresAvailable(a.ws)).map((i) => i.label);
  const navB = visibleNavItems(featuresAvailable(b.ws)).map((i) => i.label);
  check("unlocked nav shows Automations and Reply Desk", navA.includes("Automations") && navA.includes("Reply Desk"));
  check("locked nav shows neither, but keeps Link in bio", !navB.includes("Automations") && !navB.includes("Reply Desk") && navB.includes("Link in bio"));

  console.log("\nautomations run only where unlocked");
  const accountA = await prisma.socialAccount.findUniqueOrThrow({ where: { id: a.account.id }, select: accountSelect });
  const accountB = await prisma.socialAccount.findUniqueOrThrow({ where: { id: b.account.id }, select: accountSelect });
  check("unlocked account isn't blocked", automationBlocker(accountA) === null);
  check("locked account is blocked: not available yet", /aren't available yet/.test(automationBlocker(accountB) ?? ""));
  await handleWebhookComments(webhook(IG_A, "wh_a", "m_a"));
  await handleWebhookComments(webhook(IG_B, "wh_b", "m_b"));
  check("webhook comment on the unlocked account gets its DM", sent.some((s) => s.account === IG_A && s.recipient === "wh_a"));
  check("webhook comment on the locked account is ignored", !sent.some((s) => s.account === IG_B) && (await prisma.automationRun.count({ where: { commentId: "wh_b" } })) === 0);
  comments.m_a = [comment("poll_a", "link pls", "poll.fan")];
  comments.m_b = [comment("poll_b", "link pls", "poll.fan")];
  const summary = await runAutomations();
  check("the every-minute job isn't skipped", !("skipped" in summary));
  check("polled comment on the unlocked account sent", sent.some((s) => s.account === IG_A && s.recipient === "poll_a"));
  check("polled comment on the locked account not sent", !sent.some((s) => s.recipient === "poll_b"));

  console.log("\nReply Desk syncs only where unlocked");
  const desk = await syncReplyDesk();
  check("one account synced", desk.accounts === 1, desk);
  check("only the unlocked workspace's comments are in the desk", (await prisma.inboxComment.count({ where: { account: { client: { workspaceId: b.ws.id } } } })) === 0 && (await prisma.inboxComment.count({ where: { account: { client: { workspaceId: a.ws.id } } } })) > 0);

  console.log("\nthe workspace's own switch still wins");
  await prisma.workspace.update({ where: { id: a.ws.id }, data: { disabledFeatures: ["ig_automations"] } });
  const switchedOff = await prisma.socialAccount.findUniqueOrThrow({ where: { id: a.account.id }, select: accountSelect });
  check("unlocked but switched off is blocked", /switched off/.test(automationBlocker(switchedOff) ?? ""));
  await prisma.workspace.update({ where: { id: a.ws.id }, data: { disabledFeatures: [] } });

  console.log("\nlocking again, and launch");
  await prisma.workspace.update({ where: { id: a.ws.id }, data: { earlyFeatures: [] } });
  check("nothing unlocked: the every-minute job skips", "skipped" in (await runAutomations()));
  check("nothing unlocked: the Reply Desk isn't available anywhere", !(await featureAvailableAnywhere("reply_desk")));
  process.env.NEXT_PUBLIC_IG_AUTOMATIONS = "1";
  check("flag on: every workspace has automations", featureAvailable(b.ws, "ig_automations") && featureAvailable(a.ws, "ig_automations"));
  const launched = await prisma.socialAccount.findUniqueOrThrow({ where: { id: b.account.id }, select: accountSelect });
  check("flag on: the locked account isn't blocked any more", automationBlocker(launched) === null);
  delete process.env.NEXT_PUBLIC_IG_AUTOMATIONS;

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
