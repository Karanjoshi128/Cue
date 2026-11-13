import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/*
 * Unsubscribe links and the do-not-email list.
 *
 * A link carries the address and an HMAC of it, so it can't be guessed or
 * edited to unsubscribe someone else, and needs no database row per email.
 * The key is derived from TOKEN_ENC_KEY, so there's no new secret to manage.
 */

export type SuppressionReason = "unsubscribed" | "bounced" | "complained" | "manual";

const APP_URL = () => (process.env.APP_URL ?? "https://trycue.space").replace(/\/+$/, "");

function key(): Buffer {
  const raw = process.env.TOKEN_ENC_KEY;
  if (!raw) throw new Error("TOKEN_ENC_KEY is not set");
  return createHmac("sha256", raw).update("cue-mailer-unsubscribe-v1").digest();
}

function sign(email: string): Buffer {
  return createHmac("sha256", key()).update(email.toLowerCase()).digest();
}

export function unsubscribeToken(email: string): string {
  const e = email.toLowerCase();
  return `${Buffer.from(e).toString("base64url")}.${sign(e).toString("base64url")}`;
}

/** The address a token is for, or null when it's malformed or the signature doesn't match. */
export function verifyUnsubscribeToken(token: string): string | null {
  const [a, b] = token.split(".");
  if (!a || !b || token.length > 600) return null;
  let email: string;
  try {
    email = Buffer.from(a, "base64url").toString("utf8").toLowerCase();
  } catch {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const given = Buffer.from(b, "base64url");
  const want = sign(email);
  return given.length === want.length && timingSafeEqual(given, want) ? email : null;
}

/** The page people land on from the link in the email footer. */
export function unsubscribePageUrl(email: string): string {
  return `${APP_URL()}/unsubscribe/${unsubscribeToken(email)}`;
}

/** The endpoint mail apps call for one-click unsubscribe (RFC 8058). */
export function unsubscribeOneClickUrl(email: string): string {
  return `${APP_URL()}/api/mailer/unsubscribe/${unsubscribeToken(email)}`;
}

/** Adds an address to the do-not-email list. Keeps the first reason if it's already there. */
export async function suppress(
  email: string,
  reason: SuppressionReason,
  extra: { campaignId?: string | null; note?: string | null; createdBy?: string | null } = {},
) {
  const e = email.toLowerCase();
  await prisma.mailerSuppression.upsert({
    where: { email: e },
    create: {
      email: e,
      reason,
      campaignId: extra.campaignId ?? null,
      note: extra.note ?? null,
      createdBy: extra.createdBy ?? null,
    },
    update: {},
  });
}

export async function isSuppressed(email: string): Promise<boolean> {
  return !!(await prisma.mailerSuppression.findUnique({ where: { email: email.toLowerCase() }, select: { email: true } }));
}
