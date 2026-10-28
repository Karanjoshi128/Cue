import { prisma } from "@/lib/prisma";
import { automationsEnabled, RUN_RETENTION_DAYS } from "./config";
import { pollAccount, processRun } from "./engine";
import { sendFollowUps } from "./conversation";
import { runSpikeAlerts } from "@/lib/alerts";

/**
 * The every-minute job (POST /api/cron/automations): check comments on every
 * account with a live comment rule, send anything queued or due for a retry,
 * send due follow-ups, and delete activity older than RUN_RETENTION_DAYS.
 * Stops starting new work once `budgetMs` is used.
 */
export async function runAutomations(budgetMs = 45_000) {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const summary = {
    accounts: 0,
    polled: 0,
    matched: 0,
    sent: 0,
    retried: 0,
    followUps: 0,
    spikeAlerts: 0,
    purged: 0,
    errors: 0,
  };
  if (!automationsEnabled()) return { ...summary, skipped: true };

  const accounts = await prisma.socialAccount.findMany({
    where: {
      platform: "INSTAGRAM",
      automationRules: { some: { enabled: true, trigger: "COMMENT" } },
    },
    select: { id: true },
    orderBy: { commentsCheckedAt: { sort: "asc", nulls: "first" } },
  });
  summary.accounts = accounts.length;
  for (const { id } of accounts) {
    if (elapsed() > budgetMs * 0.5) break;
    try {
      const r = await pollAccount(id);
      summary.polled++;
      summary.matched += r.matched;
      summary.sent += r.sent;
      if (r.error) summary.errors++;
    } catch (err) {
      summary.errors++;
      console.error(`[automations] poll of account ${id} failed:`, err);
    }
  }

  // Retries, paced runs, and runs a webhook queued but couldn't finish (give
  // those a minute, in case the webhook's own send is still in flight).
  const due = await prisma.automationRun.findMany({
    where: {
      status: "QUEUED",
      OR: [
        { nextAttemptAt: { lte: new Date() } },
        { nextAttemptAt: null, createdAt: { lt: new Date(Date.now() - 60_000) } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  for (const { id } of due) {
    if (elapsed() > budgetMs * 0.8) break;
    const status = await processRun(id);
    if (status) summary.retried++;
    if (status === "SENT" || status === "PARTIAL") summary.sent++;
  }

  if (elapsed() < budgetMs) summary.followUps = await sendFollowUps();
  summary.spikeAlerts = await runSpikeAlerts().catch((err) => {
    console.error("[alerts] spike alerts failed:", err);
    return 0;
  });

  const purged = await prisma.automationRun.deleteMany({
    where: {
      createdAt: { lt: new Date(Date.now() - RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000) },
    },
  });
  summary.purged = purged.count;
  return summary;
}
