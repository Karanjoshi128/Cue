import crypto from "crypto";
import type { Invite, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";

// Workspace invitations. The emailed link carries a random token; the
// database keeps its sha256 (to look it up) and an encrypted copy (so the
// team page can show the link again). Opening the link never joins anyone:
// joining is a signed-in Accept, so mail scanners that pre-open links can't.

export const INVITE_DAYS = 7;
const FROM = process.env.INVITE_FROM ?? "Cue <invites@trycue.space>";

export function newInviteToken() {
  const token = crypto.randomBytes(24).toString("base64url");
  return { token, tokenHash: hashInviteToken(token), tokenEnc: encrypt(token) };
}

export function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function inviteExpiry(from = new Date()): Date {
  return new Date(from.getTime() + INVITE_DAYS * 86_400_000);
}

function appUrl(): string {
  return (process.env.APP_URL ?? "https://trycue.space").replace(/\/$/, "");
}

export function inviteLink(invite: Pick<Invite, "tokenEnc">): string {
  return `${appUrl()}/invite/${decrypt(invite.tokenEnc)}`;
}

export type InviteState = "pending" | "accepted" | "declined" | "revoked" | "expired";

export function inviteState(
  i: Pick<Invite, "acceptedAt" | "declinedAt" | "revokedAt" | "expiresAt">,
): InviteState {
  if (i.acceptedAt) return "accepted";
  if (i.revokedAt) return "revoked";
  if (i.declinedAt) return "declined";
  if (i.expiresAt.getTime() <= Date.now()) return "expired";
  return "pending";
}

/** Invites still open for this email (any workspace), newest first. */
export async function pendingInvitesFor(email: string) {
  return prisma.invite.findMany({
    where: {
      email: email.toLowerCase(),
      acceptedAt: null,
      declinedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    include: {
      workspace: { select: { id: true, name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/**
 * Sends the invitation email through Resend. Returns false (and sends
 * nothing) when RESEND_API_KEY isn't set, so invites still work by link.
 */
export async function sendInviteEmail(args: {
  to: string;
  link: string;
  workspaceName: string;
  inviterName: string;
  inviterEmail: string;
  role: Role;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const ws = escapeHtml(args.workspaceName);
  const who = escapeHtml(args.inviterName);
  const role = args.role === "ADMIN" ? "an admin" : "a manager";
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15151f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border:1px solid #e7e3da;border-radius:16px" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px 32px 8px"><img src="${appUrl()}/brand/cue-logo-horizontal.png" alt="Cue" height="28" style="display:block"></td></tr>
<tr><td style="padding:16px 32px 0">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:600">${who} invited you to ${ws}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4a4a57">You've been invited to join <strong>${ws}</strong> on Cue as ${role}. Cue is where the team plans and schedules posts for every client on LinkedIn, Instagram and YouTube.</p>
<a href="${args.link}" style="display:inline-block;background:#196bf5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">Accept invitation</a>
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b6b78">Sign in with <strong>${escapeHtml(args.to)}</strong>, this address, to accept. The invitation expires in ${INVITE_DAYS} days.</p>
</td></tr>
<tr><td style="padding:24px 32px 32px;font-size:12px;line-height:1.6;color:#8a8a96;border-top:1px solid #eeeae2">If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all;color:#4a4a57">${args.link}</span><br><br>Not expecting this? You can ignore it. Nothing happens unless you accept.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${args.inviterName} invited you to join ${args.workspaceName} on Cue as ${role}.

Accept: ${args.link}

Sign in with ${args.to} to accept. The invitation expires in ${INVITE_DAYS} days. Not expecting this? Ignore it; nothing happens unless you accept.`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [args.to],
      reply_to: args.inviterEmail,
      // Fixed wording: the names are the inviter's choice, and a subject line
      // is where a phishing message would go.
      subject: "You've been invited to a workspace on Cue",
      html,
      text,
    }),
  });
  if (!res.ok) {
    console.error("[invites] Resend refused the email:", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}
