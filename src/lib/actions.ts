"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuth, requireUser, requireAdmin } from "@/lib/auth";
import { publishPostNow } from "@/lib/publish";
import { ApiError, generateApiKey } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import { encrypt } from "@/lib/crypto";
import { limitProblem, workspaceHasFeature } from "@/lib/plans";
import { isPublishingPaused, PAUSED_MESSAGE } from "@/lib/platform-settings";
import { deleteObject, makeTarget, settingsFromConfig } from "@/lib/storage";
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

/**
 * Runs an action body and returns its failure as a value when it's one the
 * user should read (ApiError or a validation error), so the message survives
 * a production build. Anything unexpected is rethrown and stays private.
 */
async function toResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    if (e instanceof ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

const workspaceNameSchema = z.string().trim().min(1).max(60);

/**
 * Onboarding: the signed-in email creates its own workspace and becomes its
 * admin. Only reachable when getAuth() reported needsOnboarding (no member row
 * yet); an already-onboarded user is bounced to the dashboard.
 */
export async function createWorkspace(name: string) {
  const { user, email } = await getAuth();
  if (user) redirect("/dashboard");
  if (!email) throw new Error("UNAUTHENTICATED");
  const wsName = workspaceNameSchema.parse(name);

  await prisma.workspace.create({
    data: {
      name: wsName,
      users: { create: { email, name: email.split("@")[0], role: "ADMIN" } },
    },
  });
  redirect("/dashboard");
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

// ---------------------------------------------------------------------------
// Team (admin only) - all scoped to the admin's workspace
// ---------------------------------------------------------------------------

const inviteSchema = z.object({
  email: z.string().email().max(120),
  role: z.enum(["ADMIN", "MANAGER"]),
});

export async function inviteMember(
  input: z.infer<typeof inviteSchema>,
): Promise<ActionResult> {
  return toResult(async () => {
  const admin = await requireAdmin();
  const data = inviteSchema.parse(input);
  const email = data.email.toLowerCase();

  // Email is globally unique - a person can belong to one workspace.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, "That email already has an account.");
  const overLimit = await limitProblem(admin.workspaceId, "members");
  if (overLimit) throw new ApiError(403, overLimit);

  // Pre-create the member row in THIS workspace so their role + tenant are set
  // when they first sign in (auth.ts returns the existing row on sign-in, so
  // they skip onboarding and land straight in this workspace).
  await prisma.user.create({
    data: {
      email,
      name: email.split("@")[0],
      role: data.role,
      workspaceId: admin.workspaceId,
    },
  });
  revalidatePath("/settings");
  });
}

export async function updateMemberRole(id: string, role: "ADMIN" | "MANAGER") {
  const me = await requireAdmin();
  if (id === me.id && role !== "ADMIN") {
    throw new Error("You can't remove your own admin access.");
  }
  const target = await prisma.user.findFirst({
    where: { id, workspaceId: me.workspaceId },
  });
  if (!target) throw new Error("Member not found.");
  if (role === "MANAGER" && target.role === "ADMIN") {
    const admins = await prisma.user.count({
      where: { role: "ADMIN", workspaceId: me.workspaceId },
    });
    if (admins <= 1) throw new Error("Keep at least one admin on the team.");
  }
  await prisma.user.update({ where: { id }, data: { role } });
  revalidatePath("/settings");
}

export async function removeMember(id: string) {
  const me = await requireAdmin();
  if (id === me.id) throw new Error("You can't remove yourself.");

  const target = await prisma.user.findFirst({
    where: { id, workspaceId: me.workspaceId },
    include: { _count: { select: { posts: true } } },
  });
  if (!target) throw new Error("Member not found.");
  if (target.role === "ADMIN") {
    const admins = await prisma.user.count({
      where: { role: "ADMIN", workspaceId: me.workspaceId },
    });
    if (admins <= 1) throw new Error("Keep at least one admin on the team.");
  }
  if (target._count.posts > 0) {
    throw new Error(
      "This member has authored posts - reassign or delete them first.",
    );
  }
  await prisma.user.delete({ where: { id } });
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
    where: { id, workspaceId: admin.workspaceId, revokedAt: null },
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
  color: z.string().optional(),
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
    where: { id, workspaceId: user.workspaceId },
    select: { id: true },
  });
  if (!owned) throw new Error("Client not found.");
  const client = await prisma.client.update({ where: { id }, data });
  revalidatePath("/clients");
  return client;
}

export async function deleteClient(id: string) {
  const user = await requireUser();
  const owned = await prisma.client.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: { id: true },
  });
  if (!owned) throw new Error("Client not found.");
  await prisma.client.delete({ where: { id } });
  revalidatePath("/clients");
}

export async function disconnectAccount(accountId: string) {
  const user = await requireUser();
  const owned = await prisma.socialAccount.findFirst({
    where: { id: accountId, client: { workspaceId: user.workspaceId } },
    select: { id: true },
  });
  if (!owned) throw new Error("Account not found.");
  await prisma.socialAccount.delete({ where: { id: accountId } });
  revalidatePath("/clients");
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

// The schema, validation and creation logic live in src/lib/posts.ts so the
// composer (below) and POST /api/v1/posts share one code path. These actions
// only add what's specific to a cookie session: requireUser() and cache
// revalidation.

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
    where: { id, client: { workspaceId: user.workspaceId } },
  });
  if (!existing) throw new ApiError(404, "Post not found.");
  // Only drafts and not-yet-published scheduled posts can be edited.
  if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") {
    throw new ApiError(409, "Only drafts and scheduled posts can be edited.");
  }

  // Same account + platform rules as creating a post.
  const accounts = await resolveAccounts(user, data);
  assertPostIsPublishable(accounts, data);
  // Before the edit is written: a paused "now" must leave the post as it was.
  if (data.action === "now" && (await isPublishingPaused())) {
    throw new ApiError(503, PAUSED_MESSAGE);
  }
  const measured = await withMeasuredMedia(data);

  // Replace media + targets wholesale - safe because nothing has published yet.
  await prisma.$transaction([
    prisma.mediaAsset.deleteMany({ where: { postId: id } }),
    prisma.postTarget.deleteMany({ where: { postId: id } }),
    prisma.post.update({
      where: { id },
      data: {
        clientId: data.clientId,
        body: data.body,
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
    await publishPostNow(id);
  }

  revalidatePath("/queue");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  });
}

export async function deletePost(id: string) {
  const user = await requireUser();
  const owned = await prisma.post.findFirst({
    where: { id, client: { workspaceId: user.workspaceId } },
    select: { id: true },
  });
  if (!owned) throw new Error("Post not found.");
  await prisma.post.delete({ where: { id } });
  revalidatePath("/queue");
  revalidatePath("/calendar");
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
    where: { id: postId, client: { workspaceId: user.workspaceId } },
    data: { approval },
  });
  revalidatePath("/queue");
}

const commentSchema = z.string().trim().min(1).max(2000);

export async function addComment(postId: string, body: string) {
  const user = await requireUser();
  const text = commentSchema.parse(body);
  const owned = await prisma.post.findFirst({
    where: { id: postId, client: { workspaceId: user.workspaceId } },
    select: { id: true },
  });
  if (!owned) throw new Error("Post not found.");
  await prisma.comment.create({
    data: { postId, authorId: user.id, body: text },
  });
  revalidatePath("/queue");
}

export async function deleteComment(id: string) {
  const user = await requireUser();
  const comment = await prisma.comment.findFirst({
    where: { id, post: { client: { workspaceId: user.workspaceId } } },
  });
  if (!comment) return;
  // Authors can delete their own comments; admins can delete any (in-workspace).
  if (comment.authorId !== user.id && user.role !== "ADMIN") {
    throw new Error("You can only delete your own comments.");
  }
  await prisma.comment.delete({ where: { id } });
  revalidatePath("/queue");
}

export async function retryPost(id: string): Promise<ActionResult> {
  return toResult(async () => {
    const user = await requireUser();
    const owned = await prisma.post.findFirst({
      where: { id, client: { workspaceId: user.workspaceId } },
      select: { id: true },
    });
    if (!owned) throw new ApiError(404, "Post not found.");
    // Before resetting anything, so a paused retry leaves the post as it was.
    if (await isPublishingPaused()) throw new ApiError(503, PAUSED_MESSAGE);
    await prisma.postTarget.updateMany({
      where: { postId: id, status: "FAILED" },
      data: { status: "SCHEDULED", attempts: 0, error: null },
    });
    await publishPostNow(id);
    revalidatePath("/queue");
  });
}
