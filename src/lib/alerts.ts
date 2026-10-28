import { prisma } from "@/lib/prisma";

/*
 * Email alerts to workspace admins (who can switch them off in Settings):
 *   - a post that failed for good (every retry used)
 *   - an account that's about to expire, or needs reconnecting
 *   - an automation suddenly busier than usual (a post going viral)
 * Each thing is emailed once: an AlertLog row is claimed before sending.
 * Sent through Resend's API (RESEND_API_KEY, from ALERTS_FROM); without a key
 * nothing is sent and nothing is logged, so turning it on later doesn't
 * skip anything.
 */

const APP_URL = () => (process.env.APP_URL ?? "https://trycue.space").replace(/\/$/, "");
/** Comments an automation matched within 15 minutes that count as a spike. */
const SPIKE_PER_15_MIN = Number(process.env.ALERT_SPIKE_THRESHOLD) || 50;

export function alertsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

async function sendEmail(to: string[], subject: string, lines: string[], link: { label: string; href: string }) {
  const html = `<!doctype html><html><body style="margin:0;background:#f7f5f0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#14141c">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#6b6b76;margin:0 0 16px">Cue alert</p>
<h1 style="font-size:22px;line-height:1.3;margin:0 0 16px">${escapeHtml(subject)}</h1>
${lines.map((l) => `<p style="font-size:15px;line-height:1.6;margin:0 0 10px">${escapeHtml(l)}</p>`).join("")}
<p style="margin:24px 0 0"><a href="${link.href}" style="display:inline-block;background:#196bf5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px">${escapeHtml(link.label)}</a></p>
<p style="font-size:12px;color:#8a8a94;margin:28px 0 0">You get these as a workspace admin. Turn them off in Settings, under Account.</p>
</div></body></html>`;
  const text = [subject, "", ...lines, "", `${link.label}: ${link.href}`, "", "Turn these off in Settings, under Account."].join("\n");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.ALERTS_FROM || "Cue <alerts@trycue.space>",
      to,
      subject,
      html,
      text,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function adminEmails(workspaceId: string): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { workspaceId, role: "ADMIN", emailAlerts: true, bannedAt: null },
    select: { email: true },
  });
  return admins.map((a) => a.email);
}

/**
 * Claims the alerts not sent yet, by key. Returns the keys this call won, so
 * two runs can't send the same alert.
 */
async function claim(workspaceId: string, kind: string, keys: string[]): Promise<string[]> {
  if (!keys.length) return [];
  // One statement that skips what's already logged and returns what it took:
  // no duplicate-key errors in the logs every five minutes.
  const rows = await prisma.$queryRaw<{ key: string }[]>`
    INSERT INTO "AlertLog" ("id", "workspaceId", "kind", "key", "sentAt")
    SELECT gen_random_uuid()::text, ${workspaceId}, ${kind}, k, now()
    FROM unnest(${keys}::text[]) AS k
    ON CONFLICT ("workspaceId", "kind", "key") DO NOTHING
    RETURNING "key"`;
  return rows.map((r) => r.key);
}

/** Releases claims whose email didn't go, so the next run tries again. */
async function release(workspaceId: string, kind: string, keys: string[]) {
  await prisma.alertLog.deleteMany({ where: { workspaceId, kind, key: { in: keys } } });
}

async function notify(
  workspaceId: string,
  kind: string,
  items: { key: string; line: string }[],
  subject: (n: number) => string,
  link: { label: string; href: string },
): Promise<number> {
  if (!items.length) return 0;
  const to = await adminEmails(workspaceId);
  if (!to.length) return 0;
  const won = new Set(await claim(workspaceId, kind, items.map((i) => i.key)));
  const fresh = items.filter((i) => won.has(i.key));
  if (!fresh.length) return 0;
  try {
    await sendEmail(to, subject(fresh.length), fresh.map((i) => i.line).slice(0, 20), link);
    return fresh.length;
  } catch (err) {
    await release(workspaceId, kind, fresh.map((i) => i.key));
    console.error(`[alerts] ${kind} email failed:`, err);
    return 0;
  }
}

/**
 * Failed posts and expiring accounts, for every workspace. Runs after each
 * publish sweep (every 5 minutes); cheap when there's nothing new.
 */
export async function runPublishAlerts(maxAttempts: number) {
  if (!alertsConfigured()) return { failed: 0, expiring: 0 };
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const failed = await prisma.postTarget.findMany({
    where: {
      status: "FAILED",
      attempts: { gte: maxAttempts },
      post: { scheduledAt: { gte: since } },
    },
    select: {
      id: true,
      platform: true,
      error: true,
      post: { select: { body: true, title: true, client: { select: { name: true, workspaceId: true } } } },
    },
    take: 200,
  });

  const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const accounts = await prisma.socialAccount.findMany({
    where: {
      OR: [
        { platform: { not: "YOUTUBE" }, tokenExpires: { lte: soon } },
        { platform: "YOUTUBE", refreshToken: null },
      ],
    },
    select: {
      id: true,
      platform: true,
      displayName: true,
      tokenExpires: true,
      refreshToken: true,
      client: { select: { name: true, workspaceId: true } },
    },
    take: 200,
  });

  const byWorkspace = <T extends { ws: string }>(list: T[]) => {
    const map = new Map<string, T[]>();
    for (const x of list) map.set(x.ws, [...(map.get(x.ws) ?? []), x]);
    return map;
  };

  let failedSent = 0;
  const failedItems = failed.map((t) => ({
    ws: t.post.client.workspaceId,
    key: t.id,
    line: `${t.post.client.name} (${t.platform.toLowerCase()}): "${(t.post.title || t.post.body).slice(0, 60)}". ${t.error ?? "No reason given."}`,
  }));
  for (const [ws, items] of byWorkspace(failedItems)) {
    failedSent += await notify(
      ws,
      "failed",
      items,
      (n) => (n === 1 ? "A post didn't go out" : `${n} posts didn't go out`),
      { label: "Open the queue", href: `${APP_URL()}/queue?status=FAILED` },
    );
  }

  let expiringSent = 0;
  const now = Date.now();
  const expiringItems = accounts
    // A token that renews itself isn't a problem until a renewal fails, and
    // that shows up as expiry getting close with no refresh token.
    .filter((a) => a.platform === "YOUTUBE" || !a.refreshToken || (a.tokenExpires && a.tokenExpires.getTime() < now + 3 * 24 * 60 * 60 * 1000))
    .map((a) => {
      const gone = a.platform === "YOUTUBE" || (a.tokenExpires ? a.tokenExpires.getTime() <= now : false);
      return {
        ws: a.client.workspaceId,
        // Once per expiry date, so a reconnect that sets a new date can alert again later.
        key: `${a.id}:${a.tokenExpires?.toISOString().slice(0, 10) ?? "none"}`,
        line: `${a.client.name}: ${a.displayName} on ${a.platform.toLowerCase()} ${gone ? "needs reconnecting" : `expires ${a.tokenExpires!.toISOString().slice(0, 10)}`}.`,
      };
    });
  for (const [ws, items] of byWorkspace(expiringItems)) {
    expiringSent += await notify(
      ws,
      "expiring",
      items,
      (n) => (n === 1 ? "An account needs reconnecting" : `${n} accounts need reconnecting`),
      { label: "Open Clients", href: `${APP_URL()}/clients` },
    );
  }
  return { failed: failedSent, expiring: expiringSent };
}

/**
 * Automations far busier than usual: SPIKE_PER_15_MIN matches in 15 minutes.
 * At most one email per automation per hour. Runs from the automations job.
 */
export async function runSpikeAlerts() {
  if (!alertsConfigured()) return 0;
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const busy = await prisma.automationRun.groupBy({
    by: ["ruleId"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    having: { ruleId: { _count: { gte: SPIKE_PER_15_MIN } } },
  });
  if (!busy.length) return 0;
  const rules = await prisma.automationRule.findMany({
    where: { id: { in: busy.map((b) => b.ruleId) } },
    select: { id: true, name: true, client: { select: { name: true, workspaceId: true } } },
  });
  const hour = new Date().toISOString().slice(0, 13);
  let sent = 0;
  for (const rule of rules) {
    const count = busy.find((b) => b.ruleId === rule.id)?._count._all ?? 0;
    sent += await notify(
      rule.client.workspaceId,
      "spike",
      [
        {
          key: `${rule.id}:${hour}`,
          line: `"${rule.name}" for ${rule.client.name} matched ${count} comments in the last 15 minutes. Cue is pacing the DMs. Pause it in Automations if that's not expected.`,
        },
      ],
      () => `${rule.name} is busier than usual`,
      { label: "Open Automations", href: `${APP_URL()}/automations` },
    );
  }
  return sent;
}

/** Old alert bookkeeping: rows only matter while the thing they're about could repeat. */
export async function pruneAlertLog() {
  await prisma.alertLog.deleteMany({
    where: { sentAt: { lt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } },
  });
}
