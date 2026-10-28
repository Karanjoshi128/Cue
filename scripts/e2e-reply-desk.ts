/*
 * Reply Desk sync against a THROWAWAY local Postgres, with Instagram and
 * YouTube faked. Same setup and safety checks as scripts/e2e-automations.ts:
 *   DATABASE_URL=postgresql://postgres@localhost:55432/cue_test \
 *   TOKEN_ENC_KEY=<64 hex> npx tsx scripts/e2e-reply-desk.ts
 */
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { classifyComment } from "@/lib/reply-desk/classify";
import { syncReplyDesk } from "@/lib/reply-desk/sync";
import { replyToYouTubeComment } from "@/lib/reply-desk/youtube";

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

const calls: { host: string; path: string; method: string; body?: unknown }[] = [];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(String(input));
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ host: u.host, path: u.pathname, method, body });
  const path = u.pathname.replace(/^\/v[\d.]+/, "");
  if (u.host === "graph.instagram.com") {
    if (path === "/me/media") return json({ data: [{ id: "m1", caption: "New menu is live!", permalink: "https://instagram.com/p/m1" }] });
    if (path === "/m1/comments") {
      return json({
        data: [
          { id: "ig1", text: "what's the price?", timestamp: new Date().toISOString(), from: { id: "u1", username: "asker" } },
          { id: "ig2", text: "🔥🔥🔥", timestamp: new Date().toISOString(), from: { id: "u2", username: "fan" } },
          { id: "ig3", text: "@friend", timestamp: new Date().toISOString(), from: { id: "u3", username: "tagger" } },
          { id: "ig4", text: "thanks everyone!", timestamp: new Date().toISOString(), from: { id: "IGBIZ", username: "acme.cafe" } },
          { id: "ig5", text: "Went yesterday, loved the cold brew", timestamp: new Date().toISOString(), from: { id: "u5", username: "regular" } },
        ],
      });
    }
  }
  if (u.host === "www.googleapis.com") {
    if (path === "/youtube/v3/channels") return json({ items: [{ id: "UCacme" }] });
    if (path === "/youtube/v3/commentThreads") {
      return json({
        items: [
          { id: "yt1", snippet: { videoId: "v1", topLevelComment: { snippet: { textOriginal: "kitna time lagta hai?", authorDisplayName: "Ravi", authorChannelId: { value: "UCravi" }, publishedAt: new Date().toISOString() } } } },
          { id: "yt2", snippet: { videoId: "v1", topLevelComment: { snippet: { textOriginal: "pinned: links below", authorDisplayName: "Acme", authorChannelId: { value: "UCacme" }, publishedAt: new Date().toISOString() } } } },
        ],
      });
    }
    if (path === "/youtube/v3/videos") return json({ items: [{ id: "v1", snippet: { title: "How we roast our beans" } }] });
    if (path === "/youtube/v3/comments" && method === "POST") return json({ id: "reply1" });
  }
  throw new Error(`unhandled ${method} ${u.host}${u.pathname}`);
}) as typeof fetch;

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`select current_database() as db`;
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !db.includes("test")) {
    throw new Error(`Refusing to run against ${db}: needs a local database with "test" in its name.`);
  }
  for (const t of ["inboxComment", "alertLog", "automationRun", "automationRule", "lead", "postTarget", "post", "socialAccount", "client", "user", "workspace"] as const) {
    // @ts-expect-error every model here has deleteMany
    await prisma[t].deleteMany();
  }

  console.log("\nclassify");
  check("question mark", classifyComment("is it vegan?") === "QUESTION");
  check("Hinglish asking word", classifyComment("kitna price hai") === "QUESTION");
  check("'link pls' asks", classifyComment("link pls") === "QUESTION");
  check("emoji only is noise", classifyComment("🔥❤️🔥") === "NOISE");
  check("tagging friends is noise", classifyComment("@a @b.c") === "NOISE");
  check("short praise is noise", classifyComment("wow!!") === "NOISE");
  check("a real remark is other", classifyComment("Went yesterday, loved the cold brew") === "OTHER");

  const ws = await prisma.workspace.create({ data: { name: "Desk WS" } });
  const client = await prisma.client.create({ data: { name: "Acme", workspaceId: ws.id } });
  const common = { clientId: client.id, accessToken: encrypt("t"), refreshToken: encrypt("r"), tokenExpires: new Date(Date.now() + 30 * 86400_000) };
  await prisma.socialAccount.create({ data: { ...common, platform: "INSTAGRAM", externalId: "IGBIZ", displayName: "@acme.cafe", scopes: "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments" } });
  await prisma.socialAccount.create({ data: { ...common, platform: "INSTAGRAM", externalId: "IGOTHER", displayName: "@nocomments", scopes: "instagram_business_basic,instagram_business_content_publish" } });
  await prisma.socialAccount.create({ data: { ...common, platform: "YOUTUBE", externalId: "google-sub", displayName: "Acme", scopes: "youtube.upload youtube.force-ssl openid email profile" } });

  console.log("\nsync");
  const r1 = await syncReplyDesk();
  const rows = await prisma.inboxComment.findMany({ orderBy: { externalId: "asc" } });
  const by = Object.fromEntries(rows.map((r) => [r.externalId, r]));
  check("two accounts synced (the one without comment access skipped)", r1.accounts === 2, r1);
  check("own comments skipped on both platforms", !by.ig4 && !by.yt2);
  check("Instagram question stored as a question", by.ig1?.kind === "QUESTION" && by.ig1.mediaTitle === "New menu is live!" && by.ig1.author === "asker");
  check("emoji and tags stored as noise", by.ig2?.kind === "NOISE" && by.ig3?.kind === "NOISE");
  check("YouTube Hinglish question with the video title", by.yt1?.kind === "QUESTION" && by.yt1.mediaTitle === "How we roast our beans" && /watch\?v=v1/.test(by.yt1.mediaUrl ?? ""));
  check("nothing read from the account without access", !calls.some((c) => c.path.includes("IGOTHER")));
  const ytCalls = calls.filter((c) => c.host === "www.googleapis.com").length;
  const r2 = await syncReplyDesk();
  check("a minute later: no duplicates", (await prisma.inboxComment.count()) === rows.length);
  check("YouTube isn't read again within 30 minutes", calls.filter((c) => c.host === "www.googleapis.com").length === ytCalls && r2.accounts === 0, r2);
  await syncReplyDesk({ workspaceId: ws.id });
  check("Refresh reads YouTube anyway", calls.filter((c) => c.host === "www.googleapis.com").length > ytCalls);

  console.log("\nreply");
  check("YouTube reply posts under the thread", (await replyToYouTubeComment("t", "yt1", "About 2 weeks!")) === "reply1" && (calls.at(-1)!.body as { snippet: { parentId: string } }).snippet.parentId === "yt1");

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
