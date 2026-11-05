/*
 * Demo data for the help centre's screenshots: an agency ("Northwind Studio")
 * with four clients, connected accounts, a week of posts, one failure, one
 * post in review, a teammate and a pending invite. Every name is invented.
 *
 * LOCAL ONLY. It refuses any database that isn't on localhost with "test" in
 * its name, because .env points at production.
 *
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:55433/cue_test pnpm tsx scripts/help-demo-seed.ts
 *
 * Re-running replaces the demo workspace, with dates relative to now.
 */
import { PrismaClient, type Platform } from "@prisma/client";
import { encrypt } from "@/lib/crypto";
import { newInviteToken } from "@/lib/invites";

export const DEMO_EMAIL = "maya@northwind.example";

const url = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url) || !/test/.test(url.split("/").pop() ?? "")) {
  console.error("Refusing: DATABASE_URL must be a local database with 'test' in its name.");
  process.exit(1);
}

const prisma = new PrismaClient();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();

/** A time `days` from today at hh:mm local time. */
function at(days: number, hh: number, mm = 0) {
  const d = new Date(now + days * DAY);
  d.setHours(hh, mm, 0, 0);
  return d;
}

const CLIENTS = [
  { key: "sun", name: "Sunmeadow Organics", color: "#2f9e5b" },
  { key: "law", name: "Harbor & Pine Law", color: "#1f4e8c" },
  { key: "kiln", name: "Kiln Coffee", color: "#c2410c" },
  { key: "atlas", name: "Atlas Fitness", color: "#b42345" },
] as const;

type ClientKey = (typeof CLIENTS)[number]["key"];

const ACCOUNTS: {
  id: string;
  client: ClientKey;
  platform: Platform;
  name: string;
  expiresInDays: number | null;
  refresh?: boolean;
}[] = [
  { id: "demo-acc-sun-li", client: "sun", platform: "LINKEDIN", name: "Sunmeadow Organics", expiresInDays: 48 },
  { id: "demo-acc-sun-ig", client: "sun", platform: "INSTAGRAM", name: "@sunmeadow.organics", expiresInDays: 52 },
  { id: "demo-acc-sun-yt", client: "sun", platform: "YOUTUBE", name: "Sunmeadow Kitchen", expiresInDays: null, refresh: true },
  { id: "demo-acc-law-li", client: "law", platform: "LINKEDIN", name: "Harbor & Pine LLP", expiresInDays: 5 },
  { id: "demo-acc-kiln-ig", client: "kiln", platform: "INSTAGRAM", name: "@kilncoffee", expiresInDays: 39 },
  { id: "demo-acc-kiln-li", client: "kiln", platform: "LINKEDIN", name: "Ana Ruiz", expiresInDays: -2 },
  { id: "demo-acc-atlas-ig", client: "atlas", platform: "INSTAGRAM", name: "@atlasfitness", expiresInDays: 44 },
  { id: "demo-acc-atlas-yt", client: "atlas", platform: "YOUTUBE", name: "Atlas Training", expiresInDays: null, refresh: true },
];

type PostSeed = {
  client: ClientKey;
  accounts: string[];
  body: string;
  when: Date | null;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED" | "PARTIAL";
  approval?: "PENDING" | "CHANGES_REQUESTED";
  error?: string;
  title?: string;
};

const POSTS: PostSeed[] = [
  {
    client: "sun",
    accounts: ["demo-acc-sun-li", "demo-acc-sun-ig"],
    body: "Harvest week is here. 🌾 This season's oats come from three family farms within 60 km of our mill.",
    when: at(0, 18, 0),
    status: "SCHEDULED",
  },
  {
    client: "kiln",
    accounts: ["demo-acc-kiln-ig"],
    body: "New single origin on the bar: Huila, Colombia. Red apple, panela, a long cocoa finish. ☕",
    when: at(1, 9, 0),
    status: "SCHEDULED",
  },
  {
    client: "law",
    accounts: ["demo-acc-law-li"],
    body: "Three things every founder should check before signing a commercial lease. A short guide from our property team.",
    when: at(1, 11, 30),
    status: "SCHEDULED",
    approval: "PENDING",
  },
  {
    client: "atlas",
    accounts: ["demo-acc-atlas-ig"],
    body: "Monday reset: 20 minutes, no equipment, all levels. Save this for your next session. 💪",
    when: at(2, 7, 0),
    status: "SCHEDULED",
  },
  {
    client: "sun",
    accounts: ["demo-acc-sun-yt"],
    body: "Five breakfasts from one bag of oats, start to finish in our test kitchen.",
    title: "5 oat breakfasts in 10 minutes",
    when: at(3, 17, 0),
    status: "SCHEDULED",
  },
  {
    client: "kiln",
    accounts: ["demo-acc-kiln-ig"],
    body: "Latte art class, Saturday 10 am. Six spots left, link in bio.",
    when: at(4, 12, 0),
    status: "SCHEDULED",
  },
  {
    client: "law",
    accounts: ["demo-acc-law-li"],
    body: "We're hiring a trainee solicitor for our Bristol office.",
    when: at(6, 10, 0),
    status: "SCHEDULED",
  },
  {
    client: "atlas",
    accounts: ["demo-acc-atlas-yt", "demo-acc-atlas-ig"],
    body: "Coach Dev breaks down the perfect squat.",
    title: "The perfect squat, step by step",
    when: at(8, 16, 0),
    status: "SCHEDULED",
  },
  {
    client: "kiln",
    accounts: ["demo-acc-kiln-li"],
    body: "Why we roast lighter than most: a note from our head roaster.",
    when: at(-1, 9, 0),
    status: "FAILED",
    error:
      'LinkedIn publish failed (401): {"status":401,"message":"Invalid access token"}',
  },
  {
    client: "sun",
    accounts: ["demo-acc-sun-li", "demo-acc-sun-ig"],
    body: "Meet the farmers behind this month's oats.",
    when: at(-2, 10, 0),
    status: "PUBLISHED",
  },
  {
    client: "atlas",
    accounts: ["demo-acc-atlas-ig"],
    body: "Member of the month: Priya, who just ran her first 10k.",
    when: at(-3, 8, 0),
    status: "PUBLISHED",
  },
  {
    client: "sun",
    accounts: ["demo-acc-sun-ig"],
    body: "Recipe idea: overnight oats with roasted plums. (Needs a photo.)",
    when: null,
    status: "DRAFT",
  },
  {
    client: "law",
    accounts: ["demo-acc-law-li"],
    body: "Year-end round-up: what changed in employment law this year.",
    when: null,
    status: "DRAFT",
    approval: "CHANGES_REQUESTED",
  },
];

async function main() {
  // Start clean: remove any earlier demo workspace (cascades to its data).
  const old = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (old) {
    const wsId = old.workspaceId;
    // Clients first (their posts go with them), then people, then the workspace.
    await prisma.client.deleteMany({ where: { workspaceId: wsId } });
    await prisma.postHistory.deleteMany({ where: { workspaceId: wsId } });
    await prisma.membership.deleteMany({ where: { workspaceId: wsId } });
    await prisma.user.deleteMany({ where: { workspaceId: wsId } });
    await prisma.workspace.delete({ where: { id: wsId } });
  }

  const ws = await prisma.workspace.create({ data: { name: "Northwind Studio" } });
  const maya = await prisma.user.create({
    data: { email: DEMO_EMAIL, name: "Maya Chen", role: "ADMIN", workspaceId: ws.id, lastSeenAt: new Date() },
  });
  const sam = await prisma.user.create({
    data: {
      email: "sam@northwind.example",
      name: "Sam Okafor",
      role: "MANAGER",
      workspaceId: ws.id,
      lastSeenAt: new Date(now - 3 * HOUR),
    },
  });
  await prisma.membership.createMany({
    data: [
      { userId: maya.id, workspaceId: ws.id, role: "ADMIN" },
      { userId: sam.id, workspaceId: ws.id, role: "MANAGER" },
    ],
  });
  const { tokenHash, tokenEnc } = newInviteToken();
  await prisma.invite.create({
    data: {
      workspaceId: ws.id,
      email: "jordan@northwind.example",
      role: "MANAGER",
      tokenHash,
      tokenEnc,
      invitedById: maya.id,
      lastSentAt: new Date(now - DAY),
      expiresAt: new Date(now + 6 * DAY),
    },
  });

  const clientIds = {} as Record<ClientKey, string>;
  for (const c of CLIENTS) {
    const row = await prisma.client.create({
      data: { name: c.name, color: c.color, workspaceId: ws.id },
    });
    clientIds[c.key] = row.id;
  }

  for (const a of ACCOUNTS) {
    await prisma.socialAccount.create({
      data: {
        id: a.id,
        clientId: clientIds[a.client],
        platform: a.platform,
        displayName: a.name,
        externalId: a.id,
        accessToken: encrypt("demo-not-a-real-token"),
        refreshToken: a.refresh ? encrypt("demo-refresh") : null,
        tokenExpires: a.expiresInDays === null ? null : new Date(now + a.expiresInDays * DAY),
        scopes: "demo",
      },
    });
  }

  const platformOf = new Map(ACCOUNTS.map((a) => [a.id, a.platform]));
  for (const p of POSTS) {
    const yt = p.accounts.some((id) => platformOf.get(id) === "YOUTUBE");
    const post = await prisma.post.create({
      data: {
        clientId: clientIds[p.client],
        authorId: p.client === "atlas" ? sam.id : maya.id,
        body: p.body,
        title: p.title ?? null,
        youtubePrivacy: yt ? "public" : null,
        scheduledAt: p.when,
        status: p.status,
        approval: p.approval ?? "APPROVED",
      },
    });
    for (const accountId of p.accounts) {
      const published = p.status === "PUBLISHED";
      await prisma.postTarget.create({
        data: {
          postId: post.id,
          accountId,
          platform: platformOf.get(accountId)!,
          status: published ? "PUBLISHED" : p.status === "FAILED" ? "FAILED" : "SCHEDULED",
          publishedAt: published ? p.when : null,
          externalPostId: published ? `demo-${post.id}-${accountId}` : null,
          permalink: published ? "https://example.com/post" : null,
          error: p.status === "FAILED" ? p.error : null,
          attempts: p.status === "FAILED" ? 3 : 0,
        },
      });
      if (published) {
        await prisma.postHistory.create({
          data: {
            workspaceId: ws.id,
            clientId: clientIds[p.client],
            clientName: CLIENTS.find((c) => c.key === p.client)!.name,
            platform: platformOf.get(accountId)!,
            externalPostId: `demo-${post.id}-${accountId}`,
            permalink: "https://example.com/post",
            publishedAt: p.when!,
          },
        });
      }
    }
  }

  console.log(`Demo workspace ready: Northwind Studio, sign in as ${DEMO_EMAIL} (cue_dev_user cookie).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
