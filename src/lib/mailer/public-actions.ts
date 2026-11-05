"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { suppress, verifyUnsubscribeToken } from "@/lib/mailer/suppression";

// The unsubscribe page's actions. Public on purpose: the signed token in the
// link is the permission, and it only ever acts on its own address.

const token = z.string().min(10).max(600);

export async function unsubscribeWithToken(raw: string): Promise<{ ok: boolean }> {
  const email = verifyUnsubscribeToken(token.parse(raw));
  if (!email) return { ok: false };
  await suppress(email, "unsubscribed", { note: "Unsubscribe page" });
  return { ok: true };
}

/** Undo for someone who unsubscribed by mistake. Bounces and complaints stay blocked. */
export async function resubscribeWithToken(raw: string): Promise<{ ok: boolean }> {
  const email = verifyUnsubscribeToken(token.parse(raw));
  if (!email) return { ok: false };
  await prisma.mailerSuppression.deleteMany({ where: { email, reason: "unsubscribed" } });
  return { ok: true };
}
