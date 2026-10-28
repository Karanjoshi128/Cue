/*
 * Email alerts against a THROWAWAY local Postgres, with Resend faked. Same
 * setup and safety checks as scripts/e2e-automations.ts:
 *   DATABASE_URL=postgresql://postgres@localhost:55432/cue_test \
 *   RESEND_API_KEY=test TOKEN_ENC_KEY=<64 hex> npx tsx scripts/e2e-alerts.ts
 */
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { runPublishAlerts, runSpikeAlerts } from "@/lib/alerts";

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

const sent: { to: string[]; subject: string; text: string }[] = [];
let resendDown = false;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input) !== "https://api.resend.com/emails") throw new Error(`unexpected fetch ${input}`);
  if (resendDown) return new Response("down", { status: 503 });
  sent.push(JSON.parse(String(init!.body)));
  return new Response(JSON.stringify({ id: "e1" }), { status: 200 });
}) as typeof fetch;

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`select current_database() as db`;
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !db.includes("test")) {
    throw new Error(`Refusing to run against ${db}: needs a local database with "test" in its name.`);
  }
  for (const t of ["alertLog", "automationRun", "automationRule", "lead", "postTarget", "post", "socialAccount", "client", "user", "workspace"] as const) {
    // @ts-expect-error every model here has deleteMany
    await prisma[t].deleteMany();
  }

  const ws = await prisma.workspace.create({ data: { name: "Alerts WS" } });
  await prisma.user.create({ data: { email: "admin@example.com", role: "ADMIN", workspaceId: ws.id } });
  await prisma.user.create({ data: { email: "quiet@example.com", role: "ADMIN", emailAlerts: false, workspaceId: ws.id } });
  const manager = await prisma.user.create({ data: { email: "mgr@example.com", role: "MANAGER", workspaceId: ws.id } });
  const client = await prisma.client.create({ data: { name: "Acme", workspaceId: ws.id } });
  const ig = await prisma.socialAccount.create({
    data: { clientId: client.id, platform: "INSTAGRAM", externalId: "ig1", displayName: "@acme", accessToken: encrypt("x"), refreshToken: null, tokenExpires: new Date(Date.now() + 2 * 86400_000) },
  });
  await prisma.socialAccount.create({
    data: { clientId: client.id, platform: "LINKEDIN", externalId: "li1", displayName: "Acme", accessToken: encrypt("x"), refreshToken: encrypt("r"), tokenExpires: new Date(Date.now() + 6 * 86400_000) },
  });
  const post = await prisma.post.create({ data: { clientId: client.id, authorId: manager.id, body: "Launch day!", status: "FAILED", scheduledAt: new Date(Date.now() - 3600_000) } });
  await prisma.postTarget.create({ data: { postId: post.id, accountId: ig.id, platform: "INSTAGRAM", status: "FAILED", attempts: 3, error: "IG media processing timed out" } });
  const retrying = await prisma.post.create({ data: { clientId: client.id, authorId: manager.id, body: "Still trying", status: "SCHEDULED", scheduledAt: new Date() } });
  await prisma.postTarget.create({ data: { postId: retrying.id, accountId: ig.id, platform: "INSTAGRAM", status: "FAILED", attempts: 1, error: "x" } });

  console.log("\nfailed posts + expiring accounts");
  resendDown = true;
  await runPublishAlerts(3);
  check("a failed send leaves nothing claimed", (await prisma.alertLog.count()) === 0);
  resendDown = false;
  const r1 = await runPublishAlerts(3);
  const failedMail = sent.find((m) => /didn't go out/.test(m.subject));
  check("one failed-post email, to opted-in admins only", failedMail?.to.join() === "admin@example.com", sent);
  check("it names the post and the reason", /Launch day!/.test(failedMail?.text ?? "") && /timed out/.test(failedMail?.text ?? ""));
  check("a post with retries left isn't reported", !/Still trying/.test(failedMail?.text ?? ""));
  const expMail = sent.find((m) => /reconnecting/.test(m.subject));
  check("expiring account without a refresh token is reported", /@acme/.test(expMail?.text ?? ""), expMail);
  check("a self-renewing token 6 days out isn't", !/linkedin/.test(expMail?.text ?? ""));
  check("counts returned", r1.failed === 1 && r1.expiring === 1, r1);
  const before = sent.length;
  await runPublishAlerts(3);
  check("nothing is sent twice", sent.length === before);

  console.log("\nspikes");
  const rule = await prisma.automationRule.create({ data: { clientId: client.id, accountId: ig.id, name: "Giveaway", dmText: "hi" } });
  await prisma.automationRun.createMany({
    data: Array.from({ length: 49 }, (_, i) => ({ ruleId: rule.id, commentId: `s${i}`, commenterId: `u${i}`, commentText: "x", commentedAt: new Date(), source: "POLL" as const })),
  });
  check("49 in 15 minutes is not a spike", (await runSpikeAlerts()) === 0);
  await prisma.automationRun.create({ data: { ruleId: rule.id, commentId: "s49", commenterId: "u49", commentText: "x", commentedAt: new Date(), source: "POLL" } });
  check("50 is", (await runSpikeAlerts()) === 1 && /Giveaway is busier/.test(sent.at(-1)!.subject));
  check("once per hour", (await runSpikeAlerts()) === 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
