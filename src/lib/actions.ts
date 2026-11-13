"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuth, requireUser, requireAdmin } from "@/lib/auth";
import { publishPostNow } from "@/lib/publish";
import { ApiError, generateApiKey } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import { toResult } from "@/lib/to-result";
import { encrypt } from "@/lib/crypto";
import { limitProblem, workspaceHasFeature } from "@/lib/plans";
import { isPublishingPaused, PAUSED_MESSAGE } from "@/lib/platform-settings";
import { deleteObject, makeTarget, settingsFromConfig } from "@/lib/storage";
import { removeUnusedMedia } from "@/lib/media";
import { revokeGoogleGrant } from "@/lib/tokens";
import { SCOPE_COOKIE } from "@/lib/scope";
import {
  hashInviteToken,
  inviteExpiry,
  inviteLink,
  inviteState,
  newInviteToken,
  sendInviteEmail,
} from "@/lib/invites";
import {
  BROWSER_TEST_KEY,
  settingsFromInput,
  testStorage,
  type StorageTestResult,
} from "@/lib/storage-config";
import {
  assertPostIsPublishable,
  buildTargets,
  createPostForUser,
  mediaCreate,
  postSchema,
  resolveAccounts,
  scheduledAtFor,
  statusFor,
  withMeasuredMedia,
  youtubeColumns,
  type PostInput,
} from "@/lib/posts";

// Every export here is a public POST endpoint, and parameter types exist only
// in TypeScript: a caller can send {"not": ""} where an id is expected, which
// Prisma reads as a filter matching every row. So each argument is parsed
// before it reaches a query, as in admin-actions.ts.
const idSchema = z.string().min(1).max(100);
const isoSchema = z.string().max(40);
const roleSchema = z.enum(["ADMIN", "MANAGER"]);

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

const workspaceNameSchema = z.string().trim().min(1).max(60);
const MAX_ADMIN_WORKSPACES = 10;
const BANNED_MESSAGE = "This account has been suspended. Contact Cue support.";

/** A different workspace's client ids mean nothing here: drop the client scope. */
async function resetClientScope() {
  (await cookies()).set(SCOPE_COOKIE, "all", {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });
}

/**
 * The signed-in email creates a workspace and becomes its admin, then works in
 * it. First-time sign-ins come here from onboarding; people who already belong
 * somewhere come from the workspace switcher's "Create a workspace".
 */
export async function createWorkspace(name: string) {
  const { email, viewAs, blocked } = await getAuth();
  if (!email) throw new Error("UNAUTHENTICATED");
  if (viewAs) throw new Error("Exit view mode first.");
  if (blocked?.kind === "banned") throw new Error(BANNED_MESSAGE);
  const wsName = workspaceNameSchema.parse(name);
  // Each workspace comes with its own allowances (invite emails, storage,
  // posts), so how many one person can run is capped.
  const adminOf = await prisma.membership.count({ where: { user: { email }, role: "ADMIN" } });
  if (adminOf >= MAX_ADMIN_WORKSPACES) {
    throw new Error(
      `You're already an admin of ${MAX_ADMIN_WORKSPACES} workspaces. Contact Cue support to add more.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({ data: { name: wsName } });
    const existing = await tx.user.findUnique({ where: { email } });
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { workspaceId: ws.id, role: "ADMIN" },
        })
      : await tx.user.create({
          data: { email, name: email.split("@")[0], role: "ADMIN", workspaceId: ws.id },
        });
    await tx.membership.create({
      data: { userId: user.id, workspaceId: ws.id, role: "ADMIN" },
    });
  });
  await resetClientScope();
  redirect("/dashboard");
}

/** Work in another workspace this person belongs to. */
export async function switchWorkspace(id: string): Promise<ActionResult> {
  return toResult(async () => {
    const user = await requireUser();
    const workspaceId = idSchema.parse(id);
    const membership = await prisma.membership.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId } },
      select: { role: true, workspace: { select: { suspendedAt: true } } },
    });
    if (!membership) throw new ApiError(404, "You're not a member of that workspace.");
    if (membership.workspace.suspendedAt) {
      throw new ApiError(403, "That workspace is suspended. Contact Cue support.");
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { workspaceId, role: membership.role },
    });
    await resetClientScope();
    revalidatePath("/", "layout");
  });
}

export async function renameWorkspace(name: string) {
  const admin = await requireAdmin();
  const wsName = workspaceNameSchema.parse(name);
  await prisma.workspace.update({
    where: { id: admin.workspaceId },
    data: { name: wsName },
  });
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

const profileSchema = z.object({ name: z.string().min(1).max(80) });

export async function updateProfile(input: z.infer<typeof profileSchema>) {
  const user = await requireUser();
  const data = profileSchema.parse(input);
  await prisma.user.update({ where: { id: user.id }, data });
  revalidatePath("/settings");
}

/** Whether this person gets alert emails (src/lib/alerts.ts). */
export async function setEmailAlerts(enabled: boolean): Promise<ActionResult> {
  return toResult(async () => {
    const user = await requireUser();
    await prisma.user.update({ where: { id: user.id }, data: { emailAlerts: enabled } });
    revalidatePath("/settings");
  });
}

// ---------------------------------------------------------------------------
// Team (admin only) - all scoped to the admin's workspace
// ---------------------------------------------------------------------------

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email.").max(120),
  role: z.enum(["ADMIN", "MANAGER"]),
});

const openInvite = {
  acceptedAt: null,
  declinedAt: null,
  revokedAt: null,
} satisfies Prisma.InviteWhereInput;

// Invite emails go out from Cue's own address carrying names the inviter
// chose, so they're rationed: an invite is emailed again at most hourly, and
// a workspace emails at most INVITE_EMAILS_PER_DAY invites in any 24 hours.
// Past that, invites still work: their link can be shared by hand.
const RESEND_COOLDOWN_MS = 60 * 60 * 1000;
const INVITE_EMAILS_PER_DAY = 20;

async function canEmailInvite(workspaceId: string): Promise<boolean> {
  const sent = await prisma.invite.count({
    where: { workspaceId, lastSentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  return sent < INVITE_EMAILS_PER_DAY;
}

/** Admins invite anyone; managers invite managers. */
function assertCanInvite(me: { role: string }, role: "ADMIN" | "MANAGER") {
  if (role === "ADMIN" && me.role !== "ADMIN") {
    throw new ApiError(403, "Only admins can invite admins.");
  }
}

async function emailInvite(
  invite: { email: string; role: "ADMIN" | "MANAGER"; tokenEnc: string; workspaceId: string },
  me: { name: string | null; email: string },
): Promise<boolean> {
  const ws = await prisma.workspace.findUnique({
    where: { id: invite.workspaceId },
    select: { name: true },
  });
  return sendInviteEmail({
    to: invite.email,
    link: inviteLink(invite),
    workspaceName: ws?.name ?? "a workspace",
    inviterName: me.name || me.email.split("@")[0],
    inviterEmail: me.email,
    role: invite.role,
  }).catch((e) => {
    console.error("[invites] sending failed:", e);
    return false;
  });
}

/**
 * Invites an email to this workspace: an Invite row (7 days) and an email
 * with the link. Nobody joins until they sign in and accept. Returns the link
 * so it can be shared by hand, and whether the email went out.
 */
export async function inviteMember(
  input: z.infer<typeof inviteSchema>,
): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  return toResult(async () => {
    const me = await requireUser();
    const data = inviteSchema.parse(input);
    const email = data.email.toLowerCase();
    assertCanInvite(me, data.role);
    if (email === me.email.toLowerCase()) {
      throw new ApiError(400, "That's your own email.");
    }
    const member = await prisma.membership.findFirst({
      where: { workspaceId: me.workspaceId, user: { email } },
      select: { id: true },
    });
    if (member) throw new ApiError(409, "They're already in this workspace.");
    const open = await prisma.invite.findFirst({
      where: { workspaceId: me.workspaceId, email, ...openInvite, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (open) {
      throw new ApiError(409, "They already have an invite. Use Resend on it below.");
    }
    const overLimit = await limitProblem(me.workspaceId, "members");
    if (overLimit) throw new ApiError(403, overLimit);

    const t = newInviteToken();
    const sendEmail = await canEmailInvite(me.workspaceId);
    const invite = await prisma.invite.create({
      data: {
        workspaceId: me.workspaceId,
        email,
        role: data.role,
        tokenHash: t.tokenHash,
        tokenEnc: t.tokenEnc,
        invitedById: me.id,
        expiresAt: inviteExpiry(),
        lastSentAt: sendEmail ? new Date() : null,
      },
    });
    const emailed = sendEmail && (await emailInvite(invite, me));
    revalidatePath("/settings");
    return { link: inviteLink(invite), emailed };
  });
}

/** An invite in the caller's workspace that they're allowed to manage. */
async function manageableInvite(id: string) {
  const me = await requireUser();
  const invite = await prisma.invite.findFirst({
    where: { id: idSchema.parse(id), workspaceId: me.workspaceId, ...openInvite },
  });
  if (!invite) throw new ApiError(404, "That invite is no longer open.");
  assertCanInvite(me, invite.role);
  return { me, invite };
}

/** Sends the invite again and gives it a fresh 7 days. */
export async function resendInvite(id: string): Promise<ActionResult<{ emailed: boolean }>> {
  return toResult(async () => {
    const { me, invite } = await manageableInvite(id);
    if (invite.lastSentAt && Date.now() - invite.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new ApiError(429, "This invite was emailed less than an hour ago. Copy its link to share it now.");
    }
    if (!(await canEmailInvite(me.workspaceId))) {
      throw new ApiError(
        429,
        `This workspace has emailed ${INVITE_EMAILS_PER_DAY} invites in the last day. Copy the invite's link to share it by hand.`,
      );
    }
    const updated = await prisma.invite.update({
      where: { id: invite.id },
      data: { expiresAt: inviteExpiry(), lastSentAt: new Date() },
    });
    const emailed = await emailInvite(updated, me);
    revalidatePath("/settings");
    return { emailed };
  });
}

/** The invite's link, to share by hand. */
export async function getInviteLink(id: string): Promise<ActionResult<{ link: string }>> {
  return toResult(async () => {
    const { invite } = await manageableInvite(id);
    return { link: inviteLink(invite) };
  });
}

export async function revokeInvite(id: string): Promise<ActionResult> {
  return toResult(async () => {
    const { invite } = await manageableInvite(id);
    await prisma.invite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
    revalidatePath("/settings");
  });
}

/** The open invite behind a link, for the signed-in person it was sent to. */
async function inviteForMe(token: string) {
  const auth = await getAuth();
  if (!auth.email) throw new ApiError(401, "Sign in to respond to this invite.");
  if (auth.viewAs) throw new ApiError(403, "Exit view mode first.");
  if (auth.blocked?.kind === "banned") throw new ApiError(403, BANNED_MESSAGE);
  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashInviteToken(z.string().min(1).max(200).parse(token)) },
    include: { workspace: { select: { suspendedAt: true } } },
  });
  if (!invite) throw new ApiError(404, "This invite link isn't valid.");
  const state = inviteState(invite);
  if (state !== "pending") throw new ApiError(410, `This invite has been ${state}.`);
  if (invite.email !== auth.email.toLowerCase()) {
    throw new ApiError(403, `This invite is for ${invite.email}. Sign in with that email to accept it.`);
  }
  return { invite, email: auth.email.toLowerCase() };
}

/**
 * Joins the workspace: a membership with the invited role, and the workspace
 * becomes the one they're working in. Creates their account on first use.
 */
export async function acceptInvite(token: string): Promise<ActionResult> {
  return toResult(async () => {
    const { invite, email } = await inviteForMe(token);
    if (invite.workspace.suspendedAt) {
      throw new ApiError(403, "That workspace is suspended. Contact Cue support.");
    }
    const overLimit = await limitProblem(invite.workspaceId, "members");
    if (overLimit) throw new ApiError(403, "That workspace's plan is full. Ask its admin to make room.");

    await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } });
      const user = existing
        ? existing
        : await tx.user.create({
            data: {
              email,
              name: email.split("@")[0],
              role: invite.role,
              workspaceId: invite.workspaceId,
            },
          });
      const membership = await tx.membership.upsert({
        where: { userId_workspaceId: { userId: user.id, workspaceId: invite.workspaceId } },
        update: {},
        create: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { workspaceId: invite.workspaceId, role: membership.role },
      });
      await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    });
    await resetClientScope();
    revalidatePath("/", "layout");
  });
}

export async function declineInvite(token: string): Promise<ActionResult> {
  return toResult(async () => {
    const { invite } = await inviteForMe(token);
    await prisma.invite.update({ where: { id: invite.id }, data: { declinedAt: new Date() } });
    revalidatePath("/", "layout");
  });
}

// Team changes check "at least one admin" and then write. Serializable makes
// that safe against two admins demoting or removing each other at the same
// moment: Postgres rolls one of the two transactions back.
const TEAM_TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

function adminCount(tx: Prisma.TransactionClient, workspaceId: string) {
  return tx.membership.count({ where: { workspaceId, role: "ADMIN" } });
}

export async function updateMemberRole(id: string, nextRole: "ADMIN" | "MANAGER") {
  const me = await requireAdmin();
  const userId = idSchema.parse(id);
  const role = roleSchema.parse(nextRole);
  if (userId === me.id && role !== "ADMIN") {
    throw new Error("You can't remove your own admin access.");
  }
  await prisma.$transaction(async (tx) => {
    const target = await tx.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: me.workspaceId } },
    });
    if (!target) throw new Error("Member not found.");
    if (role === "MANAGER" && target.role === "ADMIN" && (await adminCount(tx, me.workspaceId)) <= 1) {
      throw new Error("Keep at least one admin on the team.");
    }
    await tx.membership.update({ where: { id: target.id }, data: { role } });
    // Admin invites they sent would otherwise bring in new admins after all.
    if (role === "MANAGER") {
      await tx.invite.updateMany({
        where: { workspaceId: me.workspaceId, invitedById: userId, role: "ADMIN", ...openInvite },
        data: { revokedAt: new Date() },
      });
    }
  }, TEAM_TX);
  revalidatePath("/settings");
}

/**
 * Takes someone out of this workspace. Their account, their other workspaces
 * and the posts they wrote all stay. What they leave behind here stops
 * working: their API keys for this workspace (which would otherwise revive
 * if they were ever added back) and the invites they sent that are still open.
 */
export async function removeMember(id: string) {
  const me = await requireAdmin();
  const userId = idSchema.parse(id);
  if (userId === me.id) throw new Error("You can't remove yourself.");
  await prisma.$transaction(async (tx) => {
    const target = await tx.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: me.workspaceId } },
    });
    if (!target) throw new Error("Member not found.");
    if (target.role === "ADMIN" && (await adminCount(tx, me.workspaceId)) <= 1) {
      throw new Error("Keep at least one admin on the team.");
    }
    await tx.membership.delete({ where: { id: target.id } });
    const now = new Date();
    await tx.apiKey.updateMany({
      where: { userId, workspaceId: me.workspaceId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.invite.updateMany({
      where: { workspaceId: me.workspaceId, invitedById: userId, ...openInvite },
      data: { revokedAt: now },
    });
  }, TEAM_TX);
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// API keys (admin only) - bearer tokens for /api/v1
// ---------------------------------------------------------------------------

const apiKeyNameSchema = z.string().trim().min(1).max(60);

/**
 * Creates a key that acts as the calling admin in their workspace, and returns
 * the plaintext exactly once. Only its hash is stored, so if it's lost the
 * answer is to revoke it and make another - nobody can recover it.
 */
export async function createApiKey(
  name: string,
): Promise<ActionResult<{ key: string }>> {
  return toResult(async () => {
  const admin = await requireAdmin();
  const label = apiKeyNameSchema.parse(name);
  if (!(await workspaceHasFeature(admin.workspaceId, "api"))) {
    throw new ApiError(403, "API access is turned off for this workspace.");
  }
  const overLimit = await limitProblem(admin.workspaceId, "apiKeys");
  if (overLimit) throw new ApiError(403, overLimit);
  const { key, prefix, hash } = generateApiKey();

  await prisma.apiKey.create({
    data: {
      name: label,
      prefix,
      hash,
      userId: admin.id,
      workspaceId: admin.workspaceId,
    },
  });
  revalidatePath("/settings");
  return { key };
  });
}

/** Revokes immediately. Kept rather than deleted, so the list shows history. */
export async function revokeApiKey(id: string) {
  const admin = await requireAdmin();
  // updateMany with a workspace guard = no cross-tenant revocation, and
  // revoking an already-revoked key is a harmless no-op.
  await prisma.apiKey.updateMany({
    where: { id: idSchema.parse(id), workspaceId: admin.workspaceId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// Media storage (admin only) - the workspace's own bucket, if any
// ---------------------------------------------------------------------------

// These return failures as values rather than throwing: production builds
// hide a thrown error's message, and here the message is the whole point
// ("the public URL refused to serve it" tells the admin what to fix).

/** Runs the live test against what's in the form, without saving anything. */
export async function testStorageConnection(
  input: unknown,
): Promise<StorageTestResult> {
  const admin = await requireAdmin();
  if (!(await workspaceHasFeature(admin.workspaceId, "custom_storage"))) {
    return { ok: false, checks: [], error: OWN_STORAGE_OFF };
  }
  const existing = await prisma.storageConfig.findUnique({
    where: { workspaceId: admin.workspaceId },
  });
  try {
    return await testStorage(settingsFromInput(input, existing));
  } catch (e) {
    return { ok: false, checks: [], error: errorMessage(e) };
  }
}

/** Re-tests the saved bucket, and records when it last passed. */
export async function retestStorage(): Promise<StorageTestResult> {
  const admin = await requireAdmin();
  const cfg = await prisma.storageConfig.findUnique({
    where: { workspaceId: admin.workspaceId },
  });
  if (!cfg) return { ok: false, checks: [], error: "No storage is connected." };
  try {
    const result = await testStorage(settingsFromConfig(cfg));
    if (result.ok) {
      await prisma.storageConfig.update({
        where: { id: cfg.id },
        data: { verifiedAt: new Date() },
      });
      revalidatePath("/settings");
    }
    return result;
  } catch (e) {
    return { ok: false, checks: [], error: errorMessage(e) };
  }
}

/**
 * Deletes the file the browser uploaded during a test. `input` is the form
 * being tested, or null to use the saved settings. Only the browser test key
 * pattern is accepted, so this can't delete anything else in the bucket.
 */
export async function cleanupStorageTest(input: unknown, key: string) {
  const admin = await requireAdmin();
  if (!BROWSER_TEST_KEY.test(key)) return;
  const existing = await prisma.storageConfig.findUnique({
    where: { workspaceId: admin.workspaceId },
  });
  try {
    const settings =
      input === null
        ? existing && settingsFromConfig(existing)
        : settingsFromInput(input, existing);
    if (settings) await deleteObject(makeTarget(settings), key);
  } catch {
    // Best effort: a stray 60-byte text file is harmless.
  }
}

/**
 * Saves the workspace's bucket. The server-side checks run again first, so
 * nothing that fails them is ever saved, whatever the browser claims.
 */
export async function saveStorageConfig(
  input: unknown,
): Promise<StorageTestResult> {
  const admin = await requireAdmin();
  if (!(await workspaceHasFeature(admin.workspaceId, "custom_storage"))) {
    return { ok: false, checks: [], error: OWN_STORAGE_OFF };
  }
  const existing = await prisma.storageConfig.findUnique({
    where: { workspaceId: admin.workspaceId },
  });
  try {
    const s = settingsFromInput(input, existing);
    const result = await testStorage(s);
    if (!result.ok) return result;
    if (result.browserTest) {
      // Nobody will PUT to this one; don't leave a signed URL lying about.
      delete result.browserTest;
    }

    const data = {
      provider: s.provider,
      accountId: s.accountId ?? null,
      jurisdiction: s.jurisdiction ?? null,
      endpoint: s.endpoint ?? null,
      region: s.region,
      bucket: s.bucket,
      forcePathStyle: s.forcePathStyle,
      accessKeyId: s.accessKeyId,
      secretAccessKey: encrypt(s.secretAccessKey),
      publicUrl: s.publicUrl,
      verifiedAt: new Date(),
    };
    await prisma.storageConfig.upsert({
      where: { workspaceId: admin.workspaceId },
      create: { ...data, workspaceId: admin.workspaceId },
      update: data,
    });
    revalidatePath("/settings");
    return result;
  } catch (e) {
    return { ok: false, checks: [], error: errorMessage(e) };
  }
}

/**
 * Goes back to Cue's default storage. Files already uploaded stay where they
 * are, and posts keep pointing at them, so the bucket must stay public for as
 * long as those posts matter.
 */
export async function removeStorageConfig() {
  const admin = await requireAdmin();
  await prisma.storageConfig.deleteMany({
    where: { workspaceId: admin.workspaceId },
  });
  revalidatePath("/settings");
}

const OWN_STORAGE_OFF =
  "Connecting your own storage is turned off for this workspace. Contact Cue support.";

function errorMessage(e: unknown): string {
  if (e instanceof Error && e.name === "StorageError") return e.message;
  console.error("[storage] unexpected error:", e);
  return "Something went wrong while checking the bucket. Try again.";
}

// ---------------------------------------------------------------------------
// Clients - all scoped to the caller's workspace
// ---------------------------------------------------------------------------

const clientSchema = z.object({
  name: z.string().min(1).max(80),
  // A hex colour only: it lands in inline styles, where anything after a ";"
  // would be extra CSS shown to every teammate (and to Cue support).
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a colour.").optional(),
});

export async function createClient(input: z.infer<typeof clientSchema>) {
  return toResult(async () => {
    const user = await requireUser();
    const data = clientSchema.parse(input);
    const overLimit = await limitProblem(user.workspaceId, "clients");
    if (overLimit) throw new ApiError(403, overLimit);
    const client = await prisma.client.create({
      data: { ...data, workspaceId: user.workspaceId },
    });
    revalidatePath("/clients");
    return client;
  });
}

export async function updateClient(
  id: string,
  input: z.infer<typeof clientSchema>,
) {
  const user = await requireUser();
  const data = clientSchema.parse(input);
  const owned = await prisma.client.findFirst({
    where: { id: idSchema.parse(id), workspaceId: user.workspaceId },
    select: { id: true },
  });
  if (!owned) throw new Error("Client not found.");
  const client = await prisma.client.update({ where: { id: owned.id }, data });
  revalidatePath("/clients");
  return client;
}

export async function deleteClient(id: string) {
  const user = await requireUser();
  const owned = await prisma.client.findFirst({
    where: { id: idSchema.parse(id), workspaceId: user.workspaceId },
    select: { id: true },
  });
  if (!owned) throw new Error("Client not found.");
  const media = await prisma.mediaAsset.findMany({
    where: { post: { clientId: owned.id } },
    select: { url: true },
  });
  const accounts = await prisma.socialAccount.findMany({
    where: { clientId: owned.id },
    select: { platform: true, externalId: true, accessToken: true, refreshToken: true },
  });
  await prisma.client.delete({ where: { id: owned.id } });
  await removeUnusedMedia(media.map((m) => m.url));
  for (const account of accounts) await revokeGoogleGrant(account);
  revalidatePath("/clients");
}

export async function disconnectAccount(accountId: string) {
  const user = await requireUser();
  const owned = await prisma.socialAccount.findFirst({
    where: { id: idSchema.parse(accountId), client: { workspaceId: user.workspaceId } },
    select: { id: true, platform: true, externalId: true, accessToken: true, refreshToken: true },
  });
  if (!owned) throw new Error("Account not found.");
  await prisma.socialAccount.delete({ where: { id: owned.id } });
  await revokeGoogleGrant(owned);
  revalidatePath("/clients");
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

// The schema, validation and creation logic live in src/lib/posts.ts so the
// composer (below) and POST /api/v1/posts share one code path. These actions
// only add what's specific to a cookie session: requireUser() and cache
// revalidation.

/** A publish run is uploading one of this post's targets right now. */
async function isBeingPublished(postId: string): Promise<boolean> {
  return (await prisma.postTarget.count({ where: { postId, status: "PROCESSING" } })) > 0;
}

export async function savePost(input: PostInput) {
  return toResult(async () => {
    const user = await requireUser();
    const data = postSchema.parse(input);
    const { post } = await createPostForUser(user, data);

    revalidatePath("/queue");
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    return post;
  });
}

export async function updatePost(
  id: string,
  input: PostInput,
): Promise<ActionResult> {
  return toResult(async () => {
  const user = await requireUser();
  const data = postSchema.parse(input);

  const existing = await prisma.post.findFirst({
    where: { id: idSchema.parse(id), client: { workspaceId: user.workspaceId } },
  });
  if (!existing) throw new ApiError(404, "Post not found.");
  // Only drafts and not-yet-published scheduled posts can be edited.
  if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") {
    throw new ApiError(409, "Only drafts and scheduled posts can be edited.");
  }
  // The post stays SCHEDULED while a run uploads it. Replacing its targets
  // then would publish it a second time once the edit is saved.
  if (await isBeingPublished(existing.id)) {
    throw new ApiError(409, "This post is being published right now and can't be edited.");
  }

  // Same account + platform rules as creating a post.
  const accounts = await resolveAccounts(user, data);
  assertPostIsPublishable(accounts, data);
  // Before the edit is written: a paused "now" must leave the post as it was.
  if (data.action === "now" && (await isPublishingPaused())) {
    throw new ApiError(503, PAUSED_MESSAGE);
  }
  const measured = await withMeasuredMedia(user.workspaceId, data);

  // Replace media + targets wholesale - safe because nothing has published yet.
  await prisma.$transaction([
    prisma.mediaAsset.deleteMany({ where: { postId: existing.id } }),
    prisma.postTarget.deleteMany({ where: { postId: existing.id } }),
    prisma.post.update({
      where: { id: existing.id },
      data: {
        clientId: data.clientId,
        body: data.body,
        // Written on every edit too, so removing the comment (or every
        // account that takes one) clears it.
        firstComment: data.firstComment ?? null,
        // Written on every edit, so dropping YouTube also clears its title,
        // visibility, tags and category.
        ...youtubeColumns(data),
        status: statusFor(data.action),
        // Provided on every edit, so DbNull clears a removed link/poll.
        link: data.link ?? Prisma.DbNull,
        poll: data.poll ?? Prisma.DbNull,
        scheduledAt: scheduledAtFor(data),
        media: mediaCreate(measured),
        targets: { create: buildTargets(accounts, data) },
      },
    }),
  ]);

  if (data.action === "now") {
    await publishPostNow(existing.id);
  }

  revalidatePath("/queue");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  });
}

export async function deletePost(id: string) {
  const user = await requireUser();
  const owned = await prisma.post.findFirst({
    where: { id: idSchema.parse(id), client: { workspaceId: user.workspaceId } },
    select: { id: true, media: { select: { url: true } } },
  });
  if (!owned) throw new Error("Post not found.");
  if (await isBeingPublished(owned.id)) {
    throw new Error("This post is being published right now. Try again in a minute.");
  }
  await prisma.post.delete({ where: { id: owned.id } });
  await removeUnusedMedia(owned.media.map((m) => m.url));
  revalidatePath("/queue");
  revalidatePath("/calendar");
}

/**
 * Moves a post to a new time: the calendar's drag-and-drop and its Undo.
 * Only drafts and scheduled posts move. A scheduled post must land in the
 * future, since the publish sweep would otherwise send it at once; a draft
 * never publishes, so it may sit on any date. One conditional update, so a
 * post the sweep has just started uploading (a PROCESSING target) is refused
 * rather than moved under it.
 */
export async function reschedulePost(
  id: string,
  iso: string,
): Promise<ActionResult<{ scheduledAt: string }>> {
  return toResult(async () => {
    const user = await requireUser();
    const when = new Date(isoSchema.parse(iso));
    if (Number.isNaN(when.getTime())) {
      throw new ApiError(400, "That isn't a valid time.");
    }
    const post = await prisma.post.findFirst({
      where: { id: idSchema.parse(id), client: { workspaceId: user.workspaceId } },
      select: { id: true, status: true },
    });
    if (!post) throw new ApiError(404, "Post not found.");
    if (post.status !== "DRAFT" && post.status !== "SCHEDULED") {
      throw new ApiError(409, "Only drafts and scheduled posts can be moved.");
    }
    if (post.status === "SCHEDULED" && when.getTime() < Date.now() + 60_000) {
      throw new ApiError(400, "Scheduled posts can only move to a time in the future.");
    }
    const { count } = await prisma.post.updateMany({
      where: {
        id: post.id,
        client: { workspaceId: user.workspaceId },
        status: post.status,
        targets: { none: { status: "PROCESSING" } },
      },
      data: { scheduledAt: when },
    });
    if (count !== 1) {
      throw new ApiError(409, "This post is being published right now and can't be moved.");
    }
    revalidatePath("/calendar");
    revalidatePath("/queue");
    revalidatePath("/dashboard");
    return { scheduledAt: when.toISOString() };
  });
}

/**
 * Copies a post as a new draft: same client, accounts, caption, media and
 * per-account captions. It goes through createPostForUser, so plan limits
 * and validation apply exactly as in the composer. With `iso` the copy is
 * placed on that date (still a draft); it never publishes by itself.
 */
export async function duplicatePost(
  id: string,
  iso?: string | null,
): Promise<ActionResult<{ id: string }>> {
  return toResult(async () => {
    const user = await requireUser();
    const src = await prisma.post.findFirst({
      where: { id: idSchema.parse(id), client: { workspaceId: user.workspaceId } },
      include: { media: true, targets: true },
    });
    if (!src) throw new ApiError(404, "Post not found.");
    if (src.targets.length === 0) {
      throw new ApiError(400, "This post has no connected accounts left to copy to.");
    }
    const data = postSchema.parse({
      clientId: src.clientId,
      body: src.body,
      firstComment: src.firstComment ?? undefined,
      title: src.title ?? undefined,
      youtubePrivacy: (src.youtubePrivacy as PostInput["youtubePrivacy"]) ?? undefined,
      youtubeTags: src.youtubeTags,
      youtubeCategoryId: src.youtubeCategoryId ?? undefined,
      accountIds: src.targets.map((t) => t.accountId),
      media: src.media.map((m) => ({
        type: m.type,
        url: m.url,
        storageKey: m.storageKey,
        title: m.title ?? undefined,
        sizeBytes: m.sizeBytes ?? undefined,
      })),
      link: (src.link as PostInput["link"]) ?? null,
      poll: (src.poll as PostInput["poll"]) ?? null,
      overrides: src.targets
        .filter((t) => t.bodyOverride)
        .map((t) => ({ accountId: t.accountId, body: t.bodyOverride as string })),
      action: "draft",
    } satisfies PostInput);
    const { post } = await createPostForUser(user, data);
    const when = iso ? new Date(isoSchema.parse(iso)) : null;
    if (when && !Number.isNaN(when.getTime())) {
      await prisma.post.update({ where: { id: post.id }, data: { scheduledAt: when } });
    }
    revalidatePath("/calendar");
    revalidatePath("/queue");
    revalidatePath("/dashboard");
    return { id: post.id };
  });
}

// ---------------------------------------------------------------------------
// Approval + comments
// ---------------------------------------------------------------------------

export async function setApproval(
  postId: string,
  approval: "PENDING" | "APPROVED" | "CHANGES_REQUESTED",
) {
  const user = await requireUser();
  // updateMany with a workspace guard = no cross-tenant writes.
  await prisma.post.updateMany({
    where: { id: idSchema.parse(postId), client: { workspaceId: user.workspaceId } },
    data: { approval: z.enum(["PENDING", "APPROVED", "CHANGES_REQUESTED"]).parse(approval) },
  });
  revalidatePath("/queue");
}

const commentSchema = z.string().trim().min(1).max(2000);

export async function addComment(postId: string, body: string) {
  const user = await requireUser();
  const text = commentSchema.parse(body);
  const owned = await prisma.post.findFirst({
    where: { id: idSchema.parse(postId), client: { workspaceId: user.workspaceId } },
    select: { id: true },
  });
  if (!owned) throw new Error("Post not found.");
  await prisma.comment.create({
    data: { postId: owned.id, authorId: user.id, body: text },
  });
  revalidatePath("/queue");
}

export async function deleteComment(id: string) {
  const user = await requireUser();
  const comment = await prisma.comment.findFirst({
    where: { id: idSchema.parse(id), post: { client: { workspaceId: user.workspaceId } } },
  });
  if (!comment) return;
  // Authors can delete their own comments; admins can delete any (in-workspace).
  if (comment.authorId !== user.id && user.role !== "ADMIN") {
    throw new Error("You can only delete your own comments.");
  }
  await prisma.comment.delete({ where: { id: comment.id } });
  revalidatePath("/queue");
}

export async function retryPost(id: string): Promise<ActionResult> {
  return toResult(async () => {
    const user = await requireUser();
    const owned = await prisma.post.findFirst({
      where: { id: idSchema.parse(id), client: { workspaceId: user.workspaceId } },
      select: { id: true },
    });
    if (!owned) throw new ApiError(404, "Post not found.");
    // Before resetting anything, so a paused retry leaves the post as it was.
    if (await isPublishingPaused()) throw new ApiError(503, PAUSED_MESSAGE);
    await prisma.postTarget.updateMany({
      where: {
        postId: owned.id,
        post: { client: { workspaceId: user.workspaceId } },
        status: "FAILED",
      },
      data: { status: "SCHEDULED", attempts: 0, error: null },
    });
    await publishPostNow(owned.id);
    revalidatePath("/queue");
  });
}
