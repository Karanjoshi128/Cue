"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/auth";
import { publishPostNow } from "@/lib/publish";

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
// Team (admin only)
// ---------------------------------------------------------------------------

const inviteSchema = z.object({
  email: z.string().email().max(120),
  role: z.enum(["ADMIN", "MANAGER"]),
});

export async function inviteMember(input: z.infer<typeof inviteSchema>) {
  await requireAdmin();
  const data = inviteSchema.parse(input);
  const email = data.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("That email is already on the team.");

  // Pre-create the member row so their role is set when they first sign in
  // with this email (auth.ts returns the existing row on sign-in).
  await prisma.user.create({
    data: { email, name: email.split("@")[0], role: data.role },
  });
  revalidatePath("/settings");
}

export async function updateMemberRole(
  id: string,
  role: "ADMIN" | "MANAGER",
) {
  const me = await requireAdmin();
  if (id === me.id && role !== "ADMIN") {
    throw new Error("You can't remove your own admin access.");
  }
  if (role === "MANAGER") {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    const target = await prisma.user.findUnique({ where: { id } });
    if (target?.role === "ADMIN" && admins <= 1) {
      throw new Error("Keep at least one admin on the team.");
    }
  }
  await prisma.user.update({ where: { id }, data: { role } });
  revalidatePath("/settings");
}

export async function removeMember(id: string) {
  const me = await requireAdmin();
  if (id === me.id) throw new Error("You can't remove yourself.");

  const target = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { posts: true } } },
  });
  if (!target) throw new Error("Member not found.");
  if (target.role === "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1) throw new Error("Keep at least one admin on the team.");
  }
  if (target._count.posts > 0) {
    throw new Error(
      "This member has authored posts — reassign or delete them first.",
    );
  }
  await prisma.user.delete({ where: { id } });
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const clientSchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().optional(),
});

export async function createClient(input: z.infer<typeof clientSchema>) {
  await requireUser();
  const data = clientSchema.parse(input);
  const client = await prisma.client.create({ data });
  revalidatePath("/clients");
  return client;
}

export async function updateClient(
  id: string,
  input: z.infer<typeof clientSchema>,
) {
  await requireUser();
  const data = clientSchema.parse(input);
  const client = await prisma.client.update({ where: { id }, data });
  revalidatePath("/clients");
  return client;
}

export async function deleteClient(id: string) {
  await requireUser();
  await prisma.client.delete({ where: { id } });
  revalidatePath("/clients");
}

export async function disconnectAccount(accountId: string) {
  await requireUser();
  await prisma.socialAccount.delete({ where: { id: accountId } });
  revalidatePath("/clients");
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

const postSchema = z.object({
  clientId: z.string().min(1),
  body: z.string().min(1).max(3000),
  accountIds: z.array(z.string()).min(1),
  scheduledAt: z.string().datetime().nullable().optional(),
  media: z
    .array(z.object({ type: z.enum(["IMAGE", "VIDEO"]), url: z.string(), storageKey: z.string() }))
    .optional(),
  // Per-account caption overrides; anything not listed uses `body`.
  overrides: z
    .array(z.object({ accountId: z.string(), body: z.string().max(3000) }))
    .optional(),
  action: z.enum(["draft", "schedule", "now"]),
});

/** Builds the per-target rows, applying a caption override where one differs. */
function buildTargets(
  accounts: { id: string; platform: "LINKEDIN" | "INSTAGRAM" }[],
  data: z.infer<typeof postSchema>,
) {
  const overrides = new Map(
    (data.overrides ?? []).map((o) => [o.accountId, o.body.trim()]),
  );
  return accounts.map((a) => {
    const ov = overrides.get(a.id);
    return {
      accountId: a.id,
      platform: a.platform,
      status: "SCHEDULED" as const,
      bodyOverride: ov && ov !== data.body.trim() ? ov : null,
    };
  });
}

export async function savePost(input: z.infer<typeof postSchema>) {
  const user = await requireUser();
  const data = postSchema.parse(input);

  const accounts = await prisma.socialAccount.findMany({
    where: { id: { in: data.accountIds }, clientId: data.clientId },
  });
  if (accounts.length === 0) {
    throw new Error("Select at least one connected account for this client.");
  }

  const status =
    data.action === "draft"
      ? "DRAFT"
      : data.action === "now"
        ? "PUBLISHING"
        : "SCHEDULED";

  const post = await prisma.post.create({
    data: {
      clientId: data.clientId,
      authorId: user.id,
      body: data.body,
      status,
      scheduledAt:
        data.action === "schedule" && data.scheduledAt
          ? new Date(data.scheduledAt)
          : data.action === "now"
            ? new Date()
            : null,
      media: data.media?.length
        ? { create: data.media.map((m) => ({ type: m.type, url: m.url, storageKey: m.storageKey })) }
        : undefined,
      targets: { create: buildTargets(accounts, data) },
    },
  });

  if (data.action === "now") {
    await publishPostNow(post.id);
  }

  revalidatePath("/queue");
  revalidatePath("/calendar");
  revalidatePath("/");
  return post;
}

export async function updatePost(
  id: string,
  input: z.infer<typeof postSchema>,
) {
  await requireUser();
  const data = postSchema.parse(input);

  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) throw new Error("Post not found.");
  // Only drafts and not-yet-published scheduled posts can be edited.
  if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") {
    throw new Error("Only drafts and scheduled posts can be edited.");
  }

  const accounts = await prisma.socialAccount.findMany({
    where: { id: { in: data.accountIds }, clientId: data.clientId },
  });
  if (accounts.length === 0) {
    throw new Error("Select at least one connected account for this client.");
  }

  const status =
    data.action === "draft"
      ? "DRAFT"
      : data.action === "now"
        ? "PUBLISHING"
        : "SCHEDULED";

  // Replace media + targets wholesale — safe because nothing has published yet.
  await prisma.$transaction([
    prisma.mediaAsset.deleteMany({ where: { postId: id } }),
    prisma.postTarget.deleteMany({ where: { postId: id } }),
    prisma.post.update({
      where: { id },
      data: {
        clientId: data.clientId,
        body: data.body,
        status,
        scheduledAt:
          data.action === "schedule" && data.scheduledAt
            ? new Date(data.scheduledAt)
            : data.action === "now"
              ? new Date()
              : null,
        media: data.media?.length
          ? {
              create: data.media.map((m) => ({
                type: m.type,
                url: m.url,
                storageKey: m.storageKey,
              })),
            }
          : undefined,
        targets: { create: buildTargets(accounts, data) },
      },
    }),
  ]);

  if (data.action === "now") {
    await publishPostNow(id);
  }

  revalidatePath("/queue");
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function deletePost(id: string) {
  await requireUser();
  await prisma.post.delete({ where: { id } });
  revalidatePath("/queue");
  revalidatePath("/calendar");
}

export async function retryPost(id: string) {
  await requireUser();
  await prisma.postTarget.updateMany({
    where: { postId: id, status: "FAILED" },
    data: { status: "SCHEDULED", attempts: 0, error: null },
  });
  await publishPostNow(id);
  revalidatePath("/queue");
}
