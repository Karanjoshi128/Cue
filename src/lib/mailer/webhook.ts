import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { refreshCampaignCounts } from "@/lib/mailer/audience";
import { suppress } from "@/lib/mailer/suppression";

/*
 * Resend's delivery events (sent through Svix): delivered, bounced,
 * complained, opened, clicked. Bounces that aren't temporary and spam
 * complaints put the address on the do-not-email list, which protects the
 * sending domain's reputation.
 */

const TOLERANCE_S = 5 * 60;

/** Checks a Svix signature. `secret` is the "whsec_..." signing secret from Resend. */
export function verifySvix(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  payload: string,
  nowS = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowS - ts) > TOLERANCE_S) return false;
  let key: Buffer;
  try {
    key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  } catch {
    return false;
  }
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest();
  return signature
    .split(" ")
    .map((part) => part.split(","))
    .some(([version, sig]) => {
      if (version !== "v1" || !sig) return false;
      const given = Buffer.from(sig, "base64");
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: { email_id?: string; to?: string[]; bounce?: { type?: string; message?: string } };
}

/** Applies one event. Unknown emails are ignored (a test event, or a send this app didn't make). */
export async function applyResendEvent(event: ResendEvent): Promise<"applied" | "ignored"> {
  const emailId = event.data?.email_id;
  if (!emailId || !event.type) return "ignored";
  const send = await prisma.mailerSend.findUnique({
    where: { providerMessageId: emailId },
    select: { id: true, email: true, campaignId: true, deliveredAt: true, openedAt: true, clickedAt: true },
  });
  if (!send) return "ignored";
  const at = event.created_at ? new Date(event.created_at) : new Date();
  const when = Number.isNaN(at.getTime()) ? new Date() : at;

  switch (event.type) {
    case "email.delivered":
      if (!send.deliveredAt) await prisma.mailerSend.update({ where: { id: send.id }, data: { deliveredAt: when } });
      break;
    case "email.opened":
      if (!send.openedAt) await prisma.mailerSend.update({ where: { id: send.id }, data: { openedAt: when } });
      break;
    case "email.clicked":
      if (!send.clickedAt) await prisma.mailerSend.update({ where: { id: send.id }, data: { clickedAt: when } });
      break;
    case "email.bounced": {
      const temporary = (event.data?.bounce?.type ?? "").toLowerCase() === "transient";
      await prisma.mailerSend.update({
        where: { id: send.id },
        data: {
          bouncedAt: when,
          error: `Bounced${temporary ? " (temporary)" : ""}: ${event.data?.bounce?.message ?? "the receiving server refused it"}`.slice(0, 500),
        },
      });
      if (!temporary) await suppress(send.email, "bounced", { campaignId: send.campaignId });
      break;
    }
    case "email.complained":
      await prisma.mailerSend.update({ where: { id: send.id }, data: { complainedAt: when } });
      await suppress(send.email, "complained", { campaignId: send.campaignId });
      break;
    default:
      return "ignored";
  }
  await refreshCampaignCounts(send.campaignId);
  return "applied";
}
