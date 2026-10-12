"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit, getPlatformAdminEmail } from "@/lib/admin-guard";
import {
  isPlatformAdminEmail,
  readViewAsCookie,
  signViewAs,
  VIEW_AS_COOKIE,
  VIEW_AS_MINUTES,
} from "@/lib/platform-admin";
import { isFeatureKey, PLANS } from "@/lib/plans";
import { updatePlatformSettings } from "@/lib/platform-settings";
import { MAX_ATTEMPTS, rollUpPostStatus, staleProcessingWhere } from "@/lib/publish";
import { STUCK_AFTER_MS } from "@/lib/admin-data";
import { cueMediaKey, defaultStorage, deleteObjects, settingsFromConfig } from "@/lib/storage";
import { testStorage, type StorageTestResult } from "@/lib/storage-config";

// Write side of the platform admin panel. Every action re-checks that the
// caller is a platform admin (a "use server" export is callable by anyone),
// validates its input, returns failures as values so the message survives a
// production build, and records itself in the audit log.

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string };

const NOT_ALLOWED: AdminResult = { ok: false, error: "Not found." };
const id = z.string().min(1).max(100);
const optionalReason = z.string().trim().max(500).optional();
const requiredReason = z
  .string()
  .trim()
  .min(3, "Add a short reason; it goes in the audit log.")
  .max(500);

function fail(e: unknown): AdminResult {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input." };
  console.error("[admin] action failed:", e);
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
}

function done(message?: string): AdminResult {
  revalidatePath("/admin", "layout");
  return { ok: true, message };
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export async function suspendWorkspace(workspaceId: string, reason: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const why = requiredReason.parse(reason);
    const ws = await prisma.workspace.update({
      where: { id: id.parse(workspaceId) },
      data: { suspendedAt: new Date(), suspendedReason: why },
      select: { id: true, name: true },
    });
    await audit({ actor, action: "workspace.suspend", targetType: "workspace", targetId: ws.id, workspaceId: ws.id, reason: why });
    return done(`${ws.name} is suspended.`);
  } catch (e) {
    return fail(e);
  }
}

export async function unsuspendWorkspace(workspaceId: string, reason?: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const ws = await prisma.workspace.update({
      where: { id: id.parse(workspaceId) },
      data: { suspendedAt: null, suspendedReason: null },
      select: { id: true, name: true },
    });
    await audit({ actor, action: "workspace.unsuspend", targetType: "workspace", targetId: ws.id, workspaceId: ws.id, reason: optionalReason.parse(reason) });
    return done(`${ws.name} is active again.`);
  } catch (e) {
    return fail(e);
  }
}

export async function setWorkspacePlan(workspaceId: string, plan: string, reason?: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const next = z.enum(["FREE", "PRO", "AGENCY", "UNLIMITED"]).parse(plan);
    const before = await prisma.workspace.findUniqueOrThrow({ where: { id: id.parse(workspaceId) }, select: { plan: true } });
    const ws = await prisma.workspace.update({ where: { id: workspaceId }, data: { plan: next }, select: { id: true, name: true } });
    await audit({ actor, action: "workspace.plan", targetType: "workspace", targetId: ws.id, workspaceId: ws.id, reason: optionalReason.parse(reason), details: { from: before.plan, to: next } });
    return done(`${ws.name} is on ${PLANS[next].label}.`);
  } catch (e) {
    return fail(e);
  }
}

export async function setWorkspaceFeature(
  workspaceId: string,
  feature: string,
  enabled: boolean,
  reason?: string,
): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    if (!isFeatureKey(feature)) return { ok: false, error: "Unknown feature." };
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { id: id.parse(workspaceId) },
      select: { id: true, disabledFeatures: true },
    });
    const disabled = new Set(ws.disabledFeatures);
    if (enabled) disabled.delete(feature);
    else disabled.add(feature);
    await prisma.workspace.update({ where: { id: ws.id }, data: { disabledFeatures: [...disabled] } });
    await audit({ actor, action: enabled ? "workspace.feature_on" : "workspace.feature_off", targetType: "workspace", targetId: ws.id, workspaceId: ws.id, reason: optionalReason.parse(reason), details: { feature } });
    return done();
  } catch (e) {
    return fail(e);
  }
}

/**
 * Deletes a workspace and everything in it. The admin must type its exact
 * name. Media in Cue's own bucket is removed too; a workspace's own bucket is
 * theirs and is left alone.
 */
export async function deleteWorkspace(workspaceId: string, confirmName: string, reason: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const why = requiredReason.parse(reason);
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { id: id.parse(workspaceId) },
      select: { id: true, name: true, users: { select: { email: true } } },
    });
    if (confirmName.trim() !== ws.name) {
      return { ok: false, error: "Type the workspace's name exactly to confirm." };
    }
    if (ws.users.some((u) => isPlatformAdminEmail(u.email))) {
      return { ok: false, error: "A platform admin belongs to this workspace. Remove them from it first." };
    }

    // Every object it kept in Cue's own bucket, whichever host it was served from.
    const media = await prisma.mediaAsset.findMany({
      where: { post: { client: { workspaceId: ws.id } } },
      select: { url: true },
    });
    const keys = [...new Set(media.map((m) => cueMediaKey(m.url)).filter((k): k is string => !!k))];
    const counts = await prisma.$transaction(async (tx) => {
      const history = await tx.postHistory.deleteMany({ where: { workspaceId: ws.id } });
      // Clients cascade to their posts, targets, media rows and comments.
      const clients = await tx.client.deleteMany({ where: { workspaceId: ws.id } });
      const users = await tx.user.deleteMany({ where: { workspaceId: ws.id } });
      // API keys and the storage config cascade with the workspace.
      await tx.workspace.delete({ where: { id: ws.id } });
      return { history: history.count, clients: clients.count, users: users.count };
    }, { maxWait: 10_000, timeout: 120_000 });
    await audit({
      actor,
      action: "workspace.delete",
      targetType: "workspace",
      targetId: ws.id,
      workspaceId: ws.id,
      reason: why,
      details: { name: ws.name, ...counts, mediaObjects: keys.length },
    });
    // After the commit, and best effort: a stray object is harmless, a
    // half-deleted workspace is not.
    await deleteObjects(defaultStorage(), keys).catch((e) =>
      console.error("[admin] media cleanup failed:", e),
    );
    revalidatePath("/admin", "layout");
  } catch (e) {
    return fail(e);
  }
  redirect("/admin/workspaces?deleted=1");
}

// ---------------------------------------------------------------------------
// View as (read-only)
// ---------------------------------------------------------------------------

export async function startViewAs(workspaceId: string, reason?: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { id: id.parse(workspaceId) },
      select: { id: true, _count: { select: { users: true } } },
    });
    if (ws._count.users === 0) return { ok: false, error: "This workspace has no members to view as." };
    const expiresAt = Date.now() + VIEW_AS_MINUTES * 60_000;
    (await cookies()).set(VIEW_AS_COOKIE, signViewAs({ workspaceId: ws.id, adminEmail: actor, expiresAt }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: VIEW_AS_MINUTES * 60,
    });
    await audit({ actor, action: "workspace.view_as_start", targetType: "workspace", targetId: ws.id, workspaceId: ws.id, reason: optionalReason.parse(reason) });
  } catch (e) {
    return fail(e);
  }
  redirect("/dashboard");
}

/** Ends a read-only view. A form action, so it always navigates away. */
export async function stopViewAs(): Promise<void> {
  const actor = await getPlatformAdminEmail();
  if (!actor) redirect("/");
  const token = await readViewAsCookie();
  (await cookies()).delete(VIEW_AS_COOKIE);
  if (token) {
    await audit({ actor, action: "workspace.view_as_stop", targetType: "workspace", targetId: token.workspaceId, workspaceId: token.workspaceId });
  }
  redirect(token ? `/admin/workspaces/${token.workspaceId}` : "/admin");
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

async function userForAction(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: id.parse(userId) },
    select: {
      id: true,
      email: true,
      role: true,
      workspaceId: true,
      _count: { select: { posts: true, comments: true } },
    },
  });
}

export async function banUser(userId: string, reason: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const why = requiredReason.parse(reason);
    const u = await userForAction(userId);
    if (isPlatformAdminEmail(u.email)) return { ok: false, error: "Platform admins can't be banned." };
    await prisma.user.update({ where: { id: u.id }, data: { bannedAt: new Date(), bannedReason: why } });
    await audit({ actor, action: "user.ban", targetType: "user", targetId: u.id, workspaceId: u.workspaceId, reason: why, details: { email: u.email } });
    return done(`${u.email} is banned.`);
  } catch (e) {
    return fail(e);
  }
}

export async function unbanUser(userId: string, reason?: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const u = await userForAction(userId);
    await prisma.user.update({ where: { id: u.id }, data: { bannedAt: null, bannedReason: null } });
    await audit({ actor, action: "user.unban", targetType: "user", targetId: u.id, workspaceId: u.workspaceId, reason: optionalReason.parse(reason), details: { email: u.email } });
    return done(`${u.email} can sign in again.`);
  } catch (e) {
    return fail(e);
  }
}

async function otherAdmins(workspaceId: string, exceptId: string) {
  return prisma.user.count({ where: { workspaceId, role: "ADMIN", id: { not: exceptId } } });
}

export async function setUserRole(userId: string, role: string, reason?: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const next = z.enum(["ADMIN", "MANAGER"]).parse(role);
    const u = await userForAction(userId);
    if (u.role === next) return done();
    if (u.role === "ADMIN" && (await otherAdmins(u.workspaceId, u.id)) === 0) {
      return { ok: false, error: "This is the workspace's only admin. Make someone else admin first." };
    }
    await prisma.user.update({ where: { id: u.id }, data: { role: next } });
    await audit({ actor, action: "user.role", targetType: "user", targetId: u.id, workspaceId: u.workspaceId, reason: optionalReason.parse(reason), details: { email: u.email, from: u.role, to: next } });
    return done(`${u.email} is now ${next === "ADMIN" ? "an admin" : "a manager"}.`);
  } catch (e) {
    return fail(e);
  }
}

export async function removeUser(userId: string, reason: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const why = requiredReason.parse(reason);
    const u = await userForAction(userId);
    if (isPlatformAdminEmail(u.email)) return { ok: false, error: "Platform admins can't be removed here." };
    if (u.role === "ADMIN" && (await otherAdmins(u.workspaceId, u.id)) === 0) {
      return { ok: false, error: "This is the workspace's only admin. Make someone else admin first, or delete the workspace." };
    }
    if (u._count.posts > 0 || u._count.comments > 0) {
      return {
        ok: false,
        error: `${u.email} wrote ${u._count.posts} post(s) and ${u._count.comments} comment(s), which would be lost. Ban them instead.`,
      };
    }
    await prisma.user.delete({ where: { id: u.id } });
    await audit({ actor, action: "user.remove", targetType: "user", targetId: u.id, workspaceId: u.workspaceId, reason: why, details: { email: u.email } });
    return done(`${u.email} was removed.`);
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Posts and publishing
// ---------------------------------------------------------------------------

async function targetForAction(targetId: string) {
  return prisma.postTarget.findUniqueOrThrow({
    where: { id: id.parse(targetId) },
    select: {
      id: true,
      status: true,
      platform: true,
      postId: true,
      post: { select: { approval: true, client: { select: { workspaceId: true } } } },
    },
  });
}

/** Puts a failed target back in the queue for the publisher's next run. */
export async function retryTarget(targetId: string, reason?: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const t = await targetForAction(targetId);
    if (t.status !== "FAILED") return { ok: false, error: "Only failed posts can be retried." };
    if (t.post.approval !== "APPROVED") return { ok: false, error: "This post is waiting for approval in its workspace." };
    await prisma.$transaction([
      prisma.postTarget.update({ where: { id: t.id }, data: { status: "SCHEDULED", attempts: 0, error: null } }),
      prisma.post.update({ where: { id: t.postId }, data: { status: "PUBLISHING" } }),
    ]);
    await audit({ actor, action: "target.retry", targetType: "target", targetId: t.id, workspaceId: t.post.client.workspaceId, reason: optionalReason.parse(reason), details: { postId: t.postId, platform: t.platform } });
    return done("Queued. The publisher picks it up within 5 minutes.");
  } catch (e) {
    return fail(e);
  }
}

/** Stops a scheduled target from going out. */
export async function cancelTarget(targetId: string, reason: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const why = requiredReason.parse(reason);
    const t = await targetForAction(targetId);
    if (t.status !== "SCHEDULED") {
      return { ok: false, error: "Only posts still waiting to go out can be cancelled." };
    }
    // Conditional on status, so a publisher run that claimed it in the
    // meantime wins and nothing is half-cancelled.
    const res = await prisma.postTarget.updateMany({
      where: { id: t.id, status: "SCHEDULED" },
      data: { status: "FAILED", attempts: MAX_ATTEMPTS, error: `Cancelled by Cue support: ${why}` },
    });
    if (res.count === 0) return { ok: false, error: "It started publishing just now, so it couldn't be cancelled." };
    // Only settle the post once nothing else is waiting: a post with other
    // accounts still to go keeps its status (and stays editable if future).
    const pending = await prisma.postTarget.count({
      where: { postId: t.postId, status: { in: ["SCHEDULED", "PROCESSING"] } },
    });
    if (pending === 0) await rollUpPostStatus(t.postId);
    await audit({ actor, action: "target.cancel", targetType: "target", targetId: t.id, workspaceId: t.post.client.workspaceId, reason: why, details: { postId: t.postId, platform: t.platform } });
    return done("Cancelled.");
  } catch (e) {
    return fail(e);
  }
}

/** Hands a target stuck mid-publish back to the queue. */
export async function releaseStuckTarget(targetId: string, reason?: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const t = await targetForAction(targetId);
    if (t.status !== "PROCESSING") return { ok: false, error: "It isn't stuck any more." };
    // Releasing one a live run still holds would publish it twice.
    const res = await prisma.postTarget.updateMany({
      where: { id: t.id, ...staleProcessingWhere(new Date(), STUCK_AFTER_MS) },
      data: { status: "SCHEDULED", error: "Released by Cue support after a publish attempt stalled." },
    });
    if (res.count === 0) {
      return { ok: false, error: "A publisher run picked it up under 10 minutes ago and may still be uploading. Try again later." };
    }
    await rollUpPostStatus(t.postId);
    await audit({ actor, action: "target.release", targetType: "target", targetId: t.id, workspaceId: t.post.client.workspaceId, reason: optionalReason.parse(reason), details: { postId: t.postId, platform: t.platform } });
    return done("Released. The publisher retries it within 5 minutes.");
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// API keys and storage
// ---------------------------------------------------------------------------

export async function adminRevokeApiKey(keyId: string, reason?: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const key = await prisma.apiKey.findUniqueOrThrow({
      where: { id: id.parse(keyId) },
      select: { id: true, name: true, prefix: true, workspaceId: true, revokedAt: true },
    });
    if (key.revokedAt) return done();
    await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await audit({ actor, action: "apiKey.revoke", targetType: "apiKey", targetId: key.id, workspaceId: key.workspaceId, reason: optionalReason.parse(reason), details: { name: key.name, prefix: key.prefix } });
    return done(`Revoked "${key.name}".`);
  } catch (e) {
    return fail(e);
  }
}

export async function adminRetestStorage(
  workspaceId: string,
): Promise<StorageTestResult | { ok: false; checks: []; error: string }> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return { ok: false, checks: [], error: "Not found." };
  try {
    const cfg = await prisma.storageConfig.findUniqueOrThrow({ where: { workspaceId: id.parse(workspaceId) } });
    const result = await testStorage(settingsFromConfig(cfg));
    // The browser part of the test is for the workspace's own admins.
    delete result.browserTest;
    if (result.ok) {
      await prisma.storageConfig.update({ where: { id: cfg.id }, data: { verifiedAt: new Date() } });
    }
    await audit({ actor, action: "storage.retest", targetType: "storage", targetId: cfg.id, workspaceId: cfg.workspaceId, details: { ok: result.ok } });
    revalidatePath("/admin", "layout");
    return result;
  } catch (e) {
    console.error("[admin] storage retest failed:", e);
    return { ok: false, checks: [], error: "Couldn't run the test. Try again." };
  }
}

/** Sends a workspace's uploads back to Cue's storage. */
export async function adminRemoveStorage(workspaceId: string, reason: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const why = requiredReason.parse(reason);
    const cfg = await prisma.storageConfig.findUniqueOrThrow({
      where: { workspaceId: id.parse(workspaceId) },
      select: { id: true, provider: true, bucket: true },
    });
    await prisma.storageConfig.delete({ where: { id: cfg.id } });
    await audit({ actor, action: "storage.remove", targetType: "storage", targetId: cfg.id, workspaceId, reason: why, details: { provider: cfg.provider, bucket: cfg.bucket } });
    return done("Disconnected. New uploads go to Cue's storage.");
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

export async function setPublishingPaused(paused: boolean, reason?: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const why = paused ? requiredReason.parse(reason) : optionalReason.parse(reason);
    await updatePlatformSettings({ publishingPaused: paused, pausedReason: paused ? why : null, updatedBy: actor });
    await audit({ actor, action: paused ? "platform.pause" : "platform.resume", targetType: "platform", reason: why });
    return done(paused ? "Publishing is paused everywhere." : "Publishing resumed. Overdue posts go out on the next run.");
  } catch (e) {
    return fail(e);
  }
}

export async function setAnnouncement(text: string, tone: string): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    const message = z.string().trim().min(3, "Write the message first.").max(280).parse(text);
    const t = z.enum(["info", "warning"]).parse(tone);
    await updatePlatformSettings({ announcement: message, announcementTone: t, announcementAt: new Date(), updatedBy: actor });
    await audit({ actor, action: "platform.announce", targetType: "platform", details: { message, tone: t } });
    return done("The banner is live for everyone.");
  } catch (e) {
    return fail(e);
  }
}

export async function clearAnnouncement(): Promise<AdminResult> {
  const actor = await getPlatformAdminEmail();
  if (!actor) return NOT_ALLOWED;
  try {
    await updatePlatformSettings({ announcement: null, announcementAt: null, updatedBy: actor });
    await audit({ actor, action: "platform.announce_clear", targetType: "platform" });
    return done("Banner removed.");
  } catch (e) {
    return fail(e);
  }
}
