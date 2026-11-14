/*
 * Engage demo data on top of help-demo-seed.ts (run that first): Instagram
 * automations with a week of activity, leads, Reply Desk comments on
 * Instagram and YouTube, and a link-in-bio page with taps. Every name is
 * invented. For screenshots and UI reviews.
 *
 * LOCAL ONLY. It refuses any database that isn't on localhost with "test" in
 * its name, because .env points at production.
 *
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:55434/cue_test pnpm tsx scripts/engage-demo-seed.ts
 *
 * Re-running replaces the engage data, with dates relative to now.
 */
import { PrismaClient, type AutomationRunStatus, type CommentKind, type InboxState, type RunStage } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url) || !/test/.test(url.split("/").pop() ?? "")) {
  console.error("Refusing: DATABASE_URL must be a local database with 'test' in its name.");
  process.exit(1);
}

const prisma = new PrismaClient();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = Date.now();
const ago = (ms: number) => new Date(now - ms);

const IG_ALL =
  "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages";
const IG_PUBLISH = "instagram_business_basic,instagram_business_content_publish";

async function main() {
  const sun = await prisma.client.findFirstOrThrow({ where: { name: "Sunmeadow Organics" } });
  const kiln = await prisma.client.findFirstOrThrow({ where: { name: "Kiln Coffee" } });
  const atlas = await prisma.client.findFirstOrThrow({ where: { name: "Atlas Fitness" } });
  const ws = sun.workspaceId;
  const inWs = { client: { workspaceId: ws } };

  await prisma.automationRule.deleteMany({ where: inWs });
  await prisma.lead.deleteMany({ where: inWs });
  await prisma.inboxComment.deleteMany({ where: { account: inWs } });
  await prisma.bioPage.deleteMany({ where: inWs });

  // Accounts: Sunmeadow and Kiln can do everything; Atlas connected before
  // comment access, so it shows the reconnect path.
  await prisma.socialAccount.update({
    where: { id: "demo-acc-sun-ig" },
    data: { scopes: IG_ALL, webhooksSubscribedAt: ago(9 * DAY), commentsCheckedAt: ago(3 * MIN), inboxSyncedAt: ago(2 * MIN), externalId: "17841400000001001" },
  });
  await prisma.socialAccount.update({
    where: { id: "demo-acc-kiln-ig" },
    data: { scopes: IG_ALL, webhooksSubscribedAt: ago(20 * DAY), commentsCheckedAt: ago(1 * MIN), inboxSyncedAt: ago(4 * MIN), externalId: "17841400000001002" },
  });
  await prisma.socialAccount.update({
    where: { id: "demo-acc-atlas-ig" },
    data: { scopes: IG_PUBLISH, webhooksSubscribedAt: null, commentsCheckedAt: null, inboxSyncedAt: null, externalId: "17841400000001003" },
  });
  await prisma.socialAccount.update({
    where: { id: "demo-acc-sun-yt" },
    data: { scopes: "youtube.upload youtube.force-ssl openid email profile", inboxSyncedAt: ago(12 * MIN) },
  });

  // ------------------------------------------------------------ automations
  const latte = await prisma.automationRule.create({
    data: {
      clientId: kiln.id, accountId: "demo-acc-kiln-ig", name: "Latte art class",
      trigger: "COMMENT", scope: "ONE_POST", mediaId: "17900000000000001",
      mediaPermalink: "https://www.instagram.com/p/demo1/", mediaCaption: "Latte art class, Saturday 10 am. Six spots left, comment CLASS for the link.",
      mediaThumbUrl: "/marketing/demo-latte.jpg",
      keywords: ["class", "link"], matchMode: "WORD",
      replies: ["Sent you a DM, @{username}!", "Check your messages ☕", "Link's in your DMs!"],
      dmText: "Hi {username}! Here's the booking page for Saturday's latte art class. Six spots, first come first served.",
      dmButtonLabel: "Book a spot", dmButtonUrl: "https://kilncoffee.example/class",
      followGate: true, gateText: "Thanks for the comment! Tap below and I'll send the link.",
      holdWords: ["refund", "scam"],
      matchedCount: 142, dmSentCount: 131, replyCount: 128, deliveredCount: 117, heldCount: 3,
      activeSince: ago(12 * DAY), lastTriggeredAt: ago(8 * MIN), createdAt: ago(12 * DAY),
    },
  });
  const wholesale = await prisma.automationRule.create({
    data: {
      clientId: kiln.id, accountId: "demo-acc-kiln-ig", name: "Wholesale enquiries",
      trigger: "DM_KEYWORD", keywords: ["wholesale", "cafe order"], matchMode: "CONTAINS",
      dmText: "Thanks for asking about wholesale! Our price list is below.",
      dmButtonLabel: "Price list", dmButtonUrl: "https://kilncoffee.example/wholesale",
      collect: "EMAIL", askText: "What's the best email for our wholesale team to reach you?",
      followUpText: "Still keen on the price list? Just reply with your email.", followUpMinutes: 120,
      matchedCount: 31, dmSentCount: 31, deliveredCount: 23, leadCount: 23,
      activeSince: ago(30 * DAY), lastTriggeredAt: ago(5 * HOUR), createdAt: ago(30 * DAY),
    },
  });
  const recipe = await prisma.automationRule.create({
    data: {
      clientId: sun.id, accountId: "demo-acc-sun-ig", name: "Recipe PDF",
      trigger: "COMMENT", scope: "ANY_POST", keywords: ["recipe"], matchMode: "WORD", fuzzy: true,
      replies: ["Recipe's on its way to your DMs 🌱"],
      dmText: "Here's the full recipe card, {username}. Enjoy!",
      dmVariants: ["Hi {username}, here's the recipe card you asked for.", "Your recipe card, as promised!"],
      dmButtonLabel: "Get the recipe", dmButtonUrl: "https://sunmeadow.example/recipes/oats",
      collect: "EMAIL", askText: "Where should I send it? Drop your email and it's yours.",
      aiModeration: true,
      matchedCount: 389, dmSentCount: 376, replyCount: 371, deliveredCount: 298, leadCount: 61, heldCount: 7,
      activeSince: ago(40 * DAY), lastTriggeredAt: ago(34 * MIN), createdAt: ago(40 * DAY),
    },
  });
  await prisma.automationRule.create({
    data: {
      clientId: sun.id, accountId: "demo-acc-sun-ig", name: "Story replies: spring code",
      enabled: false, trigger: "STORY_REPLY", keywords: ["code"], matchMode: "WORD",
      dmText: "Here's 15% off your first box: SPRING15",
      matchedCount: 54, dmSentCount: 54, deliveredCount: 54,
      activeSince: ago(60 * DAY), lastTriggeredAt: ago(19 * DAY), createdAt: ago(60 * DAY),
    },
  });
  await prisma.automationRule.create({
    data: {
      clientId: atlas.id, accountId: "demo-acc-atlas-ig", name: "Free trial pass",
      trigger: "COMMENT", scope: "ANY_POST", keywords: ["trial"], matchMode: "WORD",
      replies: ["Check your DMs!"], dmText: "Here's your free 7-day pass.",
      dmButtonLabel: "Claim pass", dmButtonUrl: "https://atlasfitness.example/trial",
      activeSince: ago(2 * DAY), createdAt: ago(2 * DAY),
    },
  });

  type Run = {
    rule: string; user: string; text: string; at: number; status: AutomationRunStatus;
    stage?: RunStage; dmError?: string; replyError?: string; held?: string; trigger?: "COMMENT" | "DM_KEYWORD" | "STORY_REPLY";
  };
  const runs: Run[] = [
    { rule: latte.id, user: "ana.brews", text: "CLASS please!", at: 8 * MIN, status: "SENT", stage: "DONE" },
    { rule: latte.id, user: "milkfoam_mo", text: "class", at: 22 * MIN, status: "SENT", stage: "WAIT_TAP" },
    { rule: recipe.id, user: "plantbased.priya", text: "recipe pls 😍", at: 34 * MIN, status: "SENT", stage: "WAIT_ANSWER" },
    { rule: latte.id, user: "jules.v", text: "Is there a CLASS on Sunday too?", at: 51 * MIN, status: "SENT", stage: "DONE" },
    { rule: recipe.id, user: "the.oat.diaries", text: "Recipe!!", at: 2 * HOUR, status: "SENT", stage: "DONE" },
    { rule: latte.id, user: "coffee.karl", text: "this is a scam lol, link?", at: 3 * HOUR, status: "HELD", held: 'Hold word "scam"' },
    { rule: recipe.id, user: "greens_gal", text: "recipe", at: 4 * HOUR, status: "PARTIAL", stage: "DONE", replyError: "Instagram: the comment was deleted before the reply." },
    { rule: wholesale.id, user: "corner.cafe.leeds", text: "Hi, do you do wholesale for a small cafe?", at: 5 * HOUR, status: "SENT", stage: "DONE", trigger: "DM_KEYWORD" },
    { rule: recipe.id, user: "plantbased.priya", text: "recipe again?", at: 6 * HOUR, status: "SKIPPED" },
    { rule: latte.id, user: "private.acct_22", text: "link", at: 9 * HOUR, status: "FAILED", dmError: "Instagram: this person can't receive messages from you." },
    { rule: recipe.id, user: "anon_9921", text: "recipe you idiots", at: 11 * HOUR, status: "HELD", held: "AI: insulting language" },
    { rule: latte.id, user: "barista.ben", text: "LINK", at: 1 * DAY, status: "SENT", stage: "WAIT_FOLLOW" },
    { rule: recipe.id, user: "soup.season", text: "recipe 🙏", at: 1 * DAY + 3 * HOUR, status: "SENT", stage: "DONE" },
    { rule: latte.id, user: "noor.sips", text: "class!", at: 2 * DAY, status: "SENT", stage: "DONE" },
    { rule: recipe.id, user: "kale.and.co", text: "recipe", at: 3 * DAY, status: "QUEUED" },
  ];
  let n = 0;
  for (const r of runs) {
    n++;
    const sent = r.status === "SENT" || r.status === "PARTIAL";
    await prisma.automationRun.create({
      data: {
        ruleId: r.rule, commentId: `demo_c${n}`, trigger: r.trigger ?? "COMMENT", mediaId: "m",
        commenterId: `igsid_${r.user}`, commenterUsername: r.user, commentText: r.text,
        commentedAt: ago(r.at), source: n % 3 ? "WEBHOOK" : "POLL", status: r.status,
        replyId: sent && !r.replyError ? `rep_${n}` : null, replyError: r.replyError ?? null,
        dmMessageId: sent ? `mid_${n}` : null, dmError: r.dmError ?? null,
        dmSentAt: sent ? ago(r.at - 5000) : null, recipientId: sent ? `igsid_${r.user}` : null,
        stage: r.stage ?? "START", deliveredAt: r.stage === "DONE" && sent ? ago(r.at - 60_000) : null,
        heldReason: r.held ?? null, attempts: r.status === "QUEUED" ? 0 : 1,
        createdAt: ago(r.at), updatedAt: ago(r.at),
      },
    });
  }

  const leads: [string, string | null, string | null, "COMMENT" | "DM_KEYWORD", string, number][] = [
    ["plantbased.priya", "priya.r@example.com", null, "COMMENT", "Recipe PDF", 2 * HOUR],
    ["corner.cafe.leeds", "orders@cornercafe.example", null, "DM_KEYWORD", "Wholesale enquiries", 5 * HOUR],
    ["the.oat.diaries", "hello@oatdiaries.example", null, "COMMENT", "Recipe PDF", 7 * HOUR],
    ["soup.season", "sam.k@example.com", null, "COMMENT", "Recipe PDF", 1 * DAY],
    ["bean.there.cafe", "beanthere@example.com", "+44 7700 900123", "DM_KEYWORD", "Wholesale enquiries", 2 * DAY],
    ["greens_gal", "greens.gal@example.com", null, "COMMENT", "Recipe PDF", 3 * DAY],
    ["mornings.with.mira", "mira@example.com", null, "COMMENT", "Recipe PDF", 4 * DAY],
    ["roast.republic", "buying@roastrepublic.example", null, "DM_KEYWORD", "Wholesale enquiries", 6 * DAY],
  ];
  for (const [username, email, phone, source, rule, at] of leads) {
    const isKiln = rule === "Wholesale enquiries";
    await prisma.lead.create({
      data: {
        clientId: isKiln ? kiln.id : sun.id, accountId: isKiln ? "demo-acc-kiln-ig" : "demo-acc-sun-ig",
        igsid: `igsid_${username}`, username, email, phone, source, lastRule: rule,
        touches: username === "plantbased.priya" ? 3 : 1, createdAt: ago(at + DAY), lastSeenAt: ago(at),
      },
    });
  }

  // ------------------------------------------------------------ Reply Desk
  type C = { acct: string; client: string; platform: "INSTAGRAM" | "YOUTUBE"; author: string; text: string; at: number; kind: CommentKind; state?: InboxState; media: string; reply?: string };
  const yt = { acct: "demo-acc-sun-yt", client: sun.id, platform: "YOUTUBE" as const };
  const sunIg = { acct: "demo-acc-sun-ig", client: sun.id, platform: "INSTAGRAM" as const };
  const kilnIg = { acct: "demo-acc-kiln-ig", client: kiln.id, platform: "INSTAGRAM" as const };
  const comments: C[] = [
    { ...kilnIg, author: "ana.brews", text: "Do you ship the Ethiopia beans to Ireland? And is there a grind option for a moka pot?", at: 6 * MIN, kind: "QUESTION", media: "Latte art class, Saturday 10 am. Six spots left" },
    { ...yt, author: "Hannah Cooks", text: "Can I swap the oat milk for almond milk in this one? My son has an oat allergy.", at: 40 * MIN, kind: "QUESTION", media: "Overnight oats 3 ways | 5-minute breakfast" },
    { ...sunIg, author: "greens_gal", text: "How long does the granola keep once opened?", at: 2 * HOUR, kind: "QUESTION", media: "New: maple pecan granola, small batch" },
    { ...kilnIg, author: "jules.v", text: "What time do you open on bank holidays?", at: 3 * HOUR, kind: "QUESTION", media: "Our new opening hours" },
    { ...yt, author: "Marco Bianchi", text: "Made this yesterday and the whole family loved it. Thank you!", at: 5 * HOUR, kind: "OTHER", media: "Overnight oats 3 ways | 5-minute breakfast" },
    { ...sunIg, author: "the.oat.diaries", text: "That colour though 😍😍", at: 7 * HOUR, kind: "NOISE", media: "New: maple pecan granola, small batch" },
    { ...kilnIg, author: "milkfoam_mo", text: "@barista.ben we have to go", at: 9 * HOUR, kind: "NOISE", media: "Latte art class, Saturday 10 am. Six spots left" },
    { ...sunIg, author: "anon_9921", text: "overpriced rubbish, nobody should buy this", at: 12 * HOUR, kind: "ABUSE", media: "Spring veg box is back" },
    { ...yt, author: "Lena P", text: "Is the recipe card linked anywhere? I can't find it in the description.", at: 1 * DAY, kind: "QUESTION", state: "REPLIED", media: "Overnight oats 3 ways | 5-minute breakfast", reply: "Hi Lena! It's the first link in the description now, sorry about that." },
    { ...kilnIg, author: "noor.sips", text: "Best flat white in town, no contest", at: 1 * DAY + 4 * HOUR, kind: "OTHER", media: "Our new opening hours" },
    { ...sunIg, author: "soup.season", text: "Are the boxes plastic-free?", at: 2 * DAY, kind: "QUESTION", state: "REPLIED", media: "Spring veg box is back", reply: "They are! Card box, paper tape and compostable bags." },
    { ...kilnIg, author: "coffee.karl", text: "🔥🔥", at: 2 * DAY + 6 * HOUR, kind: "NOISE", state: "DONE", media: "Latte art class, Saturday 10 am. Six spots left" },
    { ...sunIg, author: "mornings.with.mira", text: "Saving this for Sunday!", at: 3 * DAY, kind: "OTHER", media: "Overnight oats with roasted plums" },
  ];
  n = 0;
  for (const c of comments) {
    n++;
    await prisma.inboxComment.create({
      data: {
        accountId: c.acct, clientId: c.client, platform: c.platform, externalId: `demo_ic${n}`,
        mediaId: `media_${c.media.length}`, mediaTitle: c.media,
        mediaUrl: c.platform === "YOUTUBE" ? "https://www.youtube.com/watch?v=demo" : "https://www.instagram.com/p/demo/",
        author: c.author, authorId: `a_${n}`, text: c.text, postedAt: ago(c.at), kind: c.kind,
        state: c.state ?? "OPEN", replyText: c.reply ?? null, replyId: c.reply ? `r_${n}` : null,
        repliedAt: c.reply ? ago(c.at - HOUR) : null, repliedBy: c.reply ? "Maya Chen" : null,
        createdAt: ago(c.at),
      },
    });
  }

  // ------------------------------------------------------------ link in bio
  const links = [
    { id: "lnkclass01", label: "Book the latte art class", url: "https://kilncoffee.example/class" },
    { id: "lnkshop001", label: "Shop beans", url: "https://kilncoffee.example/shop" },
    { id: "lnkwhole01", label: "Wholesale price list", url: "https://kilncoffee.example/wholesale" },
    { id: "lnkmap0001", label: "Find us: 14 Mill Lane", url: "https://maps.example/kiln" },
  ];
  const images = ["/marketing/demo-latte.jpg", "/marketing/demo-library.jpg", "/marketing/demo-plant.jpg"];
  const captions = [
    "Latte art class, Saturday 10 am. Six spots left, comment CLASS for the link.",
    "Our new opening hours, from Monday.",
    "Meet the plant that lives on table 4.",
    "Ethiopia Guji is back on the shelf.",
    "Behind the bar: Sunday morning rush.",
    "",
  ];
  const grid = captions.map((caption, i) => ({
    id: `1790000000000000${i + 1}`, image: images[i % 3], permalink: `https://www.instagram.com/p/demo${i + 1}/`, caption, video: i === 4,
  }));
  const page = await prisma.bioPage.create({
    data: {
      clientId: kiln.id, slug: "kilncoffee", title: "Kiln Coffee",
      bio: "Small-batch roastery and café on Mill Lane. Classes every Saturday.",
      accountId: "demo-acc-kiln-ig", links, postLinks: { "17900000000000001": "https://kilncoffee.example/class" },
      grid, gridAt: ago(20 * MIN), published: true,
    },
  });
  const day = (d: number) => {
    const x = new Date(now - d * DAY);
    return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
  };
  const taps: Record<string, number> = { view: 60, lnkclass01: 9, lnkshop001: 5, lnkwhole01: 1, "17900000000000001": 4, "17900000000000002": 1 };
  for (let d = 0; d < 14; d++) {
    for (const [target, base] of Object.entries(taps)) {
      const count = Math.max(0, Math.round(base * (0.6 + ((d * 7 + target.length) % 9) / 10)));
      if (count) await prisma.bioClick.create({ data: { pageId: page.id, target, day: day(d), count } });
    }
  }

  console.log("Engage demo ready: 5 automations, 15 runs, 8 leads, 13 Reply Desk comments, /b/kilncoffee.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
