import { prisma } from "@/lib/prisma";

/** Closing queued work as well as the conversation prevents a later resume reviving old sends. */
export async function closeContactAutomations(accountId: string, igsid: string) {
  const where = { commenterId: igsid, rule: { accountId } };
  await prisma.$transaction([
    prisma.automationRun.updateMany({ where: { ...where, status: "QUEUED" }, data: { status: "SKIPPED", stage: "DONE", followUpAt: null, nextAttemptAt: null, lastError: "Automation paused for this person." } }),
    prisma.automationRun.updateMany({ where, data: { stage: "DONE", followUpAt: null } }),
  ]);
}
