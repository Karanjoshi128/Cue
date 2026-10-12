import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { isPlatformAdminEmail } from "@/lib/platform-admin";

// Gatekeeping and the audit trail for the platform admin panel.

/** The signed-in platform admin's email, or null for everyone else. */
export async function getPlatformAdminEmail(): Promise<string | null> {
  const { email } = await getAuth();
  return isPlatformAdminEmail(email) ? email : null;
}

/**
 * For admin pages and data loaders: anyone who isn't a platform admin gets a
 * plain 404, so the panel's existence isn't advertised. Called in every
 * loader, not just the layout, since a layout check alone doesn't cover
 * every way a page's data can be requested.
 */
export async function requirePlatformAdmin(): Promise<string> {
  const email = await getPlatformAdminEmail();
  if (!email) notFound();
  return email;
}

export interface AuditEntry {
  actor: string;
  action: string;
  targetType: "workspace" | "user" | "post" | "target" | "apiKey" | "storage" | "platform";
  targetId?: string | null;
  workspaceId?: string | null;
  reason?: string | null;
  details?: Prisma.InputJsonValue;
}

export async function audit(entry: AuditEntry) {
  await prisma.adminAuditLog.create({
    data: {
      actorEmail: entry.actor,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      workspaceId: entry.workspaceId ?? null,
      reason: entry.reason?.trim() || null,
      details: entry.details,
    },
  });
}
