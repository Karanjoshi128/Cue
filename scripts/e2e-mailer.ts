/*
 * End-to-end check of the mailer core: merge and escaping, rendering,
 * unsubscribe tokens, queueing, the worker (batches, the 422 fallback,
 * retries, limits, scheduling, pause), webhooks and suppression.
 *
 * LOCAL ONLY: it wipes the mailer tables. It refuses any database that isn't
 * local with "test" in its name, and sends to a fake Resend:
 *   node scripts/fake-resend.mjs 3399
 *   MAILER_RESEND_BASE_URL=http://127.0.0.1:3399 pnpm tsx --env-file=.env scripts/e2e-mailer.ts
 */
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { queueCampaignSends, countAudience, refreshCampaignCounts } from "@/lib/mailer/audience";
import { runMailer } from "@/lib/mailer/runner";
import { unsubscribeToken, verifyUnsubscribeToken, suppress } from "@/lib/mailer/suppression";
import { applyResendEvent, verifySvix } from "@/lib/mailer/webhook";
import { renderEmail } from "@/lib/mailer/render";
import { mergeHtml } from "@/lib/mailer/merge";

const FAKE = process.env.MAILER_RESEND_BASE_URL!;
const DB = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(DB) || !/test/.test(DB.split("/").pop() ?? "") || !FAKE?.includes("127.0.0.1")) {
  throw new Error("Refusing: needs a local test database and a fake Resend (see the top of this file).");
}

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra === undefined ? "" : "  " + JSON.stringify(extra)}`);
  if (!cond) failures++;
}
type SentEmail = { to: string[]; subject: string; html: string; headers?: Record<string, string> };
const fakeLog = async () =>
  (await (await fetch(`${FAKE}/__log`)).json()) as { path: string; auth?: string; idem?: string; body: SentEmail | SentEmail[] }[];

async function main() {
  await fetch(`${FAKE}/__reset`);
  await prisma.mailerSend.deleteMany();
  await prisma.mailerCampaign.deleteMany();
  await prisma.mailerContact.deleteMany();
  await prisma.mailerSuppression.deleteMany();
  await prisma.mailerAccount.deleteMany();
  await prisma.mailerSettings.deleteMany();

  // merge + escaping
  check("merge escapes HTML in values", mergeHtml("Hi {{first_name|there}}", { first_name: "<b>x</b>" }) === "Hi &lt;b&gt;x&lt;/b&gt;");
  check("merge fallback", mergeHtml("Hi {{first_name | there}}!", {}) === "Hi there!");
  const r = renderEmail({
    subject: "Hello {{first_name|friend}}",
    preheader: "Preview",
    bodyHtml: '<p>Hi {{name}}</p><p><a href="https://x.com">Link</a></p><img src="a.png">',
    vars: { name: "Ana" },
    footer: { name: "Cue", contactEmail: "hello@trycue.space" },
    unsubscribeUrl: "https://trycue.space/unsubscribe/t",
  });
  check("render subject", r.subject === "Hello friend", r.subject);
  check("render text has link and unsubscribe", r.text.includes("Link (https://x.com)") && r.text.includes("Unsubscribe: https://trycue.space/unsubscribe/t"), r.text);
  check("render responsive img", r.html.includes('<img src="a.png" style="max-width:100%;height:auto;">'));

  // tokens
  const t = unsubscribeToken("Ana@Example.com");
  check("token round-trips (lowercased)", verifyUnsubscribeToken(t) === "ana@example.com");
  const [a] = t.split(".");
  const forged = `${Buffer.from("victim@example.com").toString("base64url")}.${t.split(".")[1]}`;
  check("token for another address is refused", verifyUnsubscribeToken(forged) === null && !!a);

  // setup
  const account = await prisma.mailerAccount.create({
    data: { name: "Marketing", fromName: "Cue", fromEmail: "hello@trycue.space", apiKey: encrypt("re_test_key_123"), perMinute: 60, perDay: 1000, webhookSecret: encrypt("whsec_" + Buffer.from("secret-key-bytes").toString("base64")) },
  });
  const mk = (email: string, tags: string[], name?: string) =>
    prisma.mailerContact.create({ data: { email, tags, name, fields: { city: "Pune <script>" } } });
  await mk("one@example.com", ["leads"], "Priya Sharma");
  await mk("two@example.com", ["leads"], "<b>Bold</b> Name");
  await mk("three@example.com", ["leads", "vip"]);
  await mk("four@example.com", ["other"]);
  await mk("bad422@example.com", ["leads"]);
  await mk("off@example.com", ["leads"]);
  await mk("flaky@example.com", ["leads"]);
  await suppress("off@example.com", "unsubscribed");

  const aud = { tags: ["leads"], excludeTags: ["vip"] };
  const cnt = await countAudience(aud);
  check("audience count: 5 matched (leads minus vip), 1 suppressed", cnt.matched === 5 && cnt.suppressed === 1 && cnt.reachable === 4, cnt);

  const camp = await prisma.mailerCampaign.create({
    data: { name: "Launch", accountId: account.id, subject: "Hi {{first_name|there}}", bodyHtml: "<p>Hello {{name|friend}} from {{city}}</p>", audience: aud, status: "SENDING", startedAt: new Date(), createdBy: "test" },
  });
  const q = await queueCampaignSends(camp.id, aud);
  check("queued 4, skipped 1", q.queued === 4 && q.skipped === 1, q);
  const q2 = await queueCampaignSends(camp.id, aud);
  const total = await prisma.mailerSend.count({ where: { campaignId: camp.id } });
  check("queueing twice doesn't duplicate", total === 5, { total, q2 });

  const s1 = await runMailer();
  const rows = await prisma.mailerSend.findMany({ where: { campaignId: camp.id } });
  const by = (e: string) => rows.find((x) => x.email === e)!;
  check("3 good ones SENT with provider ids", ["one@example.com", "two@example.com"].every((e) => by(e).status === "SENT" && by(e).providerMessageId), rows.map((x) => [x.email, x.status, x.error]));
  check("422 address FAILED (batch fell back to singles)", by("bad422@example.com").status === "FAILED", by("bad422@example.com"));
  check("flaky address back to PENDING with a later retry", by("flaky@example.com").status === "PENDING" && by("flaky@example.com").attempts === 1 && by("flaky@example.com").nextAttemptAt > new Date(), by("flaky@example.com"));
  check("suppressed one SKIPPED", by("off@example.com").status === "SKIPPED");
  check("campaign still SENDING (one waiting to retry)", (await prisma.mailerCampaign.findUnique({ where: { id: camp.id } }))!.status === "SENDING");
  console.log("run summary", s1);

  const log = await fakeLog();
  const sentOne = log.flatMap((l) => (Array.isArray(l.body) ? l.body : [l.body])).find((m) => m.to[0] === "two@example.com");
  check("subject merged", sentOne?.subject === "Hi <b>Bold</b>", sentOne?.subject);
  check("body escapes contact name and field", !!sentOne?.html.includes("&lt;b&gt;Bold&lt;/b&gt; Name") && !!sentOne?.html.includes("Pune &lt;script&gt;"));
  check("one-click unsubscribe headers", sentOne?.headers?.["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click" && /<http.*\/api\/mailer\/unsubscribe\/.+>, <mailto:hello@trycue.space\?subject=unsubscribe>/.test(sentOne?.headers?.["List-Unsubscribe"] ?? ""), sentOne?.headers);
  check("api key decrypted and sent", log[0]?.auth === "Bearer re_test_key_123");
  check("batch had an idempotency key", log.some((l) => l.path === "/emails/batch" && l.idem?.startsWith("cue-batch-")));

  // flaky: force it due again, 3 attempts total then FAILED
  for (let i = 0; i < 2; i++) {
    await prisma.mailerSend.updateMany({ where: { email: "flaky@example.com" }, data: { nextAttemptAt: new Date(0) } });
    await runMailer();
  }
  const flaky = await prisma.mailerSend.findFirst({ where: { email: "flaky@example.com" } });
  check("flaky FAILED after 3 attempts", flaky?.status === "FAILED" && flaky.attempts === 3, flaky);
  const done = await prisma.mailerCampaign.findUnique({ where: { id: camp.id } });
  check("campaign SENT with counts", done?.status === "SENT" && done.sent === 2 && done.failed === 2 && done.skipped === 1 && done.total === 5, done);

  // webhook
  const secret = "whsec_" + Buffer.from("secret-key-bytes").toString("base64");
  const payload = JSON.stringify({ type: "email.bounced", created_at: new Date().toISOString(), data: { email_id: by("one@example.com").providerMessageId, bounce: { type: "Permanent", message: "No such user" } } });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from("secret-key-bytes")).update(`msg_1.${ts}.${payload}`).digest("base64");
  check("svix signature verifies", verifySvix(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, payload));
  check("svix rejects tampered payload", !verifySvix(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, payload + " "));
  check("svix rejects old timestamp", !verifySvix(secret, { id: "msg_1", timestamp: String(Number(ts) - 3600), signature: `v1,${sig}` }, payload));
  await applyResendEvent(JSON.parse(payload));
  check("hard bounce suppresses the address", (await prisma.mailerSuppression.findUnique({ where: { email: "one@example.com" } }))?.reason === "bounced");
  await applyResendEvent({ type: "email.delivered", data: { email_id: by("two@example.com").providerMessageId! } });
  const after = await refreshCampaignCounts(camp.id);
  check("delivered + bounced counted", after.delivered === 1 && after.bounced === 1, after);

  // per-minute limit
  await prisma.mailerAccount.update({ where: { id: account.id }, data: { perMinute: 3 } });
  for (let i = 0; i < 5; i++) await prisma.mailerContact.create({ data: { email: `bulk${i}@example.com`, tags: ["bulk"] } });
  const c2 = await prisma.mailerCampaign.create({ data: { name: "Bulk", accountId: account.id, subject: "x", bodyHtml: "<p>x</p>", audience: { tags: ["bulk"], excludeTags: [] }, status: "SENDING", startedAt: new Date(), createdBy: "t" } });
  await queueCampaignSends(c2.id, { tags: ["bulk"], excludeTags: [] });
  await runMailer();
  const sentBulk = await prisma.mailerSend.count({ where: { campaignId: c2.id, status: "SENT" } });
  // the first campaign already sent 2 in the last minute, so a limit of 3 leaves room for 1
  check("per-minute limit holds (1 sent: 2 already this minute)", sentBulk === 1, { sentBulk });

  // scheduled campaign starts when due
  await prisma.mailerAccount.update({ where: { id: account.id }, data: { perMinute: 60 } });
  const c3 = await prisma.mailerCampaign.create({ data: { name: "Later", accountId: account.id, subject: "s", bodyHtml: "<p>s</p>", audience: { tags: ["other"], excludeTags: [] }, status: "SCHEDULED", scheduledAt: new Date(Date.now() - 1000), createdBy: "t" } });
  const s3 = await runMailer();
  const c3d = await prisma.mailerCampaign.findUnique({ where: { id: c3.id } });
  check("scheduled campaign started, sent and closed", s3.started === 1 && c3d?.status === "SENT" && c3d.sent === 1, { s3, status: c3d?.status, sent: c3d?.sent });

  // pause
  await prisma.mailerSettings.create({ data: { id: "global", paused: true } });
  const sp = await runMailer();
  check("paused run does nothing", sp.paused === true && sp.sent === 0);
  await prisma.mailerSettings.update({ where: { id: "global" }, data: { paused: false } });

  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exitCode = failures ? 1 : 0;
}
main().finally(() => prisma.$disconnect());
