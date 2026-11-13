import type { AutomationTrigger } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Adds someone to the account's leads, or updates them: one row per person
 * per Instagram account. Email and phone only ever fill in, never clear.
 */
export async function recordLead(p: {
  clientId: string;
  accountId: string;
  igsid: string;
  username?: string | null;
  source: AutomationTrigger;
  ruleName: string;
  email?: string | null;
  phone?: string | null;
}) {
  // A commenter Instagram gave no id for can't be messaged again, so skip them.
  if (!p.igsid || p.igsid.startsWith("@") || p.igsid.startsWith("comment:")) return;
  const filled = {
    ...(p.username ? { username: p.username } : {}),
    ...(p.email ? { email: p.email } : {}),
    ...(p.phone ? { phone: p.phone } : {}),
  };
  await prisma.lead.upsert({
    where: { accountId_igsid: { accountId: p.accountId, igsid: p.igsid } },
    create: {
      clientId: p.clientId,
      accountId: p.accountId,
      igsid: p.igsid,
      source: p.source,
      lastRule: p.ruleName,
      ...filled,
    },
    update: {
      lastRule: p.ruleName,
      lastSeenAt: new Date(),
      ...(p.email || p.phone ? {} : { touches: { increment: 1 } }),
      ...filled,
    },
  });
}
