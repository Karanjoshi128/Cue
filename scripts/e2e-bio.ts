/*
 * Link-in-bio pages against a THROWAWAY local Postgres, with Instagram faked.
 * Same setup and safety checks as scripts/e2e-automations.ts:
 *   DATABASE_URL=postgresql://postgres@localhost:55432/cue_test \
 *   TOKEN_ENC_KEY=<64 hex> npx tsx scripts/e2e-bio.ts
 */
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { isWebUrl, slugProblem, suggestSlug, withScheme } from "@/lib/bio/config";
import { refreshGrid } from "@/lib/bio/grid";
import { bioDestination, getPublicBioPage } from "@/lib/bio/data";
import { countHit, isBot } from "@/lib/bio/clicks";

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

let mediaCalls = 0;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const u = new URL(String(input));
  const path = u.pathname.replace(/^\/v[\d.]+/, "");
  if (u.host === "graph.instagram.com") {
    if (path === "/me/media") {
      mediaCalls++;
      // Slow enough that two refreshes overlap.
      await new Promise((r) => setTimeout(r, 50));
      return json({
        data: [
          { id: "111", caption: "Cold brew is back", media_type: "IMAGE", media_url: "https://cdn.example/111.jpg", permalink: "https://www.instagram.com/p/111/" },
          { id: "222", caption: "Roasting day", media_type: "VIDEO", thumbnail_url: "https://cdn.example/222.jpg", media_url: "https://cdn.example/222.mp4", permalink: "https://www.instagram.com/reel/222/" },
          { id: "333", media_type: "IMAGE", permalink: "https://www.instagram.com/p/333/" }, // no image: skipped
        ],
      });
    }
    if (path === "/me") return json({ username: "acme.cafe", profile_picture_url: "https://cdn.example/me.jpg" });
  }
  throw new Error(`unhandled ${u.host}${u.pathname}`);
}) as typeof fetch;

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`select current_database() as db`;
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !db.includes("test")) {
    throw new Error(`Refusing to run against ${db}: needs a local database with "test" in its name.`);
  }
  for (const t of ["bioClick", "bioPage", "inboxComment", "alertLog", "automationRun", "automationRule", "lead", "postTarget", "post", "socialAccount", "client", "user", "workspace"] as const) {
    // @ts-expect-error every model here has deleteMany
    await prisma[t].deleteMany();
  }

  console.log("\naddresses and links");
  check("a client name becomes an address", suggestSlug("Kité & Co.") === "kite-co");
  check("short names are padded", suggestSlug("A") === "a-bio");
  check("good address passes", slugProblem("acme-cafe") === null);
  check("uppercase, double dashes and edges refused", !!slugProblem("Acme") && !!slugProblem("a--b") && !!slugProblem("-ab"));
  check("reserved address refused", !!slugProblem("support"));
  check("a pasted domain gets https", withScheme("example.com/menu") === "https://example.com/menu");
  check("javascript: and bare words aren't links", !isWebUrl("javascript:alert(1)") && !isWebUrl(withScheme("menu")));

  const ws = await prisma.workspace.create({ data: { name: "Bio WS" } });
  const client = await prisma.client.create({ data: { name: "Acme", color: "#E4572E", workspaceId: ws.id } });
  const account = await prisma.socialAccount.create({
    data: {
      clientId: client.id,
      platform: "INSTAGRAM",
      externalId: "IGBIZ",
      displayName: "@acme.cafe",
      accessToken: encrypt("t"),
      tokenExpires: new Date(Date.now() + 30 * 86400_000),
      scopes: "instagram_business_basic,instagram_business_content_publish",
    },
  });
  const page = await prisma.bioPage.create({
    data: {
      clientId: client.id,
      slug: "acme",
      title: "Acme Cafe",
      accountId: account.id,
      links: [{ id: "menu000001", label: "Menu", url: "https://acme.example/menu" }],
      postLinks: { "111": "https://acme.example/cold-brew" },
      published: false,
    },
  });

  console.log("\ngrid");
  const [a, b] = await Promise.all([refreshGrid(page.id), refreshGrid(page.id)]);
  const read = await prisma.bioPage.findUniqueOrThrow({ where: { id: page.id } });
  const grid = read.grid as { id: string; image: string; video: boolean }[];
  check("two views at once read Instagram once", mediaCalls === 1 && [a, b].filter(Boolean).length === 1, { mediaCalls, a, b });
  check("posts without an image are skipped", grid.length === 2 && !grid.some((t) => t.id === "333"));
  check("a reel uses its cover image", grid.find((t) => t.id === "222")?.image === "https://cdn.example/222.jpg" && grid.find((t) => t.id === "222")?.video === true);
  check("profile picture kept", read.avatarUrl === "https://cdn.example/me.jpg");
  check("within 15 minutes it isn't read again", (await refreshGrid(page.id)) === false && mediaCalls === 1);
  check("Refresh in the editor reads it anyway", (await refreshGrid(page.id, true)) === true && mediaCalls === 2);

  console.log("\npublic page");
  check("a draft isn't public", (await getPublicBioPage("acme")) === null);
  await prisma.bioPage.update({ where: { id: page.id }, data: { published: true } });
  const pub = await getPublicBioPage("acme");
  check("published page shows links and posts", pub?.view.links.length === 1 && pub.view.tiles.length === 2);
  check("every link goes through the counter", pub?.view.links[0].href === "/b/acme/go/menu000001" && pub.view.tiles[0].href === "/b/acme/go/111");
  check("a fresh grid isn't refreshed after the view", pub?.refreshAfter === false);

  await prisma.bioPage.update({ where: { id: page.id }, data: { gridAt: new Date(Date.now() - 20 * 60_000) } });
  check("a 20-minute-old grid refreshes after the view", (await getPublicBioPage("acme"))?.refreshAfter === true);

  await prisma.bioPage.update({ where: { id: page.id }, data: { gridAt: new Date(Date.now() - 2 * 86400_000) } });
  const before = mediaCalls;
  const old = await getPublicBioPage("acme");
  check("a 2-day-old grid is read before showing (its image links expire)", mediaCalls === before + 1 && old?.refreshAfter === false);

  await prisma.workspace.update({ where: { id: ws.id }, data: { disabledFeatures: ["bio_pages"] } });
  check("switched off for the workspace: not found", (await getPublicBioPage("acme")) === null);
  await prisma.workspace.update({ where: { id: ws.id }, data: { disabledFeatures: [], suspendedAt: new Date() } });
  check("suspended workspace: not found", (await getPublicBioPage("acme")) === null);
  await prisma.workspace.update({ where: { id: ws.id }, data: { suspendedAt: null } });

  console.log("\ntaps");
  check("a link goes to its address", (await bioDestination("acme", "menu000001"))?.url === "https://acme.example/menu");
  check("a post with its own link goes there", (await bioDestination("acme", "111"))?.url === "https://acme.example/cold-brew");
  check("other posts open on Instagram", (await bioDestination("acme", "222"))?.url === "https://www.instagram.com/reel/222/");
  check("anything else goes nowhere", (await bioDestination("acme", "https://evil.example"))?.url === null);
  check("unknown page: not found", (await bioDestination("nope", "menu000001")) === null);
  await prisma.bioPage.update({
    where: { id: page.id },
    data: { links: [{ id: "bad0000001", label: "x", url: "javascript:alert(1)" }] },
  });
  check("a stored non-web link is never followed", (await bioDestination("acme", "bad0000001"))?.url === null);

  await Promise.all([countHit(page.id, "view"), countHit(page.id, "view"), countHit(page.id, "111")]);
  const hits = await prisma.bioClick.findMany({ where: { pageId: page.id }, orderBy: { target: "asc" } });
  check("taps add up on one row per target per day", hits.length === 2 && hits.find((h) => h.target === "view")?.count === 2);
  check("Instagram's in-app browser counts", !isBot("Mozilla/5.0 (iPhone) Instagram 300.0"));
  check("link previews and crawlers don't", isBot("facebookexternalhit/1.1") && isBot("WhatsApp/2.23") && isBot("Googlebot/2.1") && isBot(null));

  await prisma.bioPage.delete({ where: { id: page.id } });
  check("deleting the page deletes its counts", (await prisma.bioClick.count()) === 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
