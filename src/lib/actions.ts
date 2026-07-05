"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuth, requireUser, requireAdmin } from "@/lib/auth";
import { publishPostNow } from "@/lib/publish";

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
  if (user) redirect("/");
  if (!email) throw new Error("UNAUTHENTICATED");
  const wsName = workspaceNameSchema.parse(name);

  await prisma.workspace.create({
    data: {
      name: wsName,
      users: { create: { email, name: email.split("@")[0], role: "ADMIN" } },
    },
  });
  redirect("/");
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

export async function inviteMember(input: z.infer<typeof inviteSchema>) {
  const admin = await requireAdmin();
  const data = inviteSchema.parse(input);
  const email = data.email.toLowerCase();

  // Email is globally unique - a person can belong to one workspace.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("That email already has an account.");

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
// Clients - all scoped to the caller's workspace
// ---------------------------------------------------------------------------

const clientSchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().optional(),
});

export async function createClient(input: z.infer<typeof clientSchema>) {
  const user = await requireUser();
  const data = clientSchema.parse(input);
  const client = await prisma.client.create({
    data: { ...data, workspaceId: user.workspaceId },
  });
  revalidatePath("/clients");
  return client;
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

// LinkedIn-only content types.
const linkSchema = z.object({
  url: z.string().url(),
  title: z.string().max(200).optional(),
  description: z.string().max(300).optional(),
});
const pollSchema = z.object({
  question: z.string().min(1).max(140),
  options: z.array(z.string().min(1).max(30)).min(2).max(4),
  duration: z.enum(["ONE_DAY", "THREE_DAYS", "SEVEN_DAYS", "FOURTEEN_DAYS"]),
});

const postSchema = z
  .object({
    clientId: z.string().min(1),
    body: z.string().min(1).max(3000),
    accountIds: z.array(z.string()).min(1),
    scheduledAt: z.string().datetime().nullable().optional(),
    media: z
      .array(
        z.object({
          type: z.enum(["IMAGE", "VIDEO", "DOCUMENT"]),
          url: z.string(),
          storageKey: z.string(),
          title: z.string().optional(),
        }),
      )
      .optional(),
    link: linkSchema.nullable().optional(),
    poll: pollSchema.nullable().optional(),
    // Per-account caption overrides; anything not listed uses `body`.
    overrides: z
      .array(z.object({ accountId: z.string(), body: z.string().max(3000) }))
      .optional(),
    action: z.enum(["draft", "schedule", "now"]),
  })
  .refine((d) => d.action !== "schedule" || Boolean(d.scheduledAt), {
    message: "A scheduled post needs a date and time.",
    path: ["scheduledAt"],
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

  // Accounts are matched within the caller's workspace, so a client/account id
  // from another tenant simply yields nothing → the guard below rejects it.
  const accounts = await prisma.socialAccount.findMany({
    where: {
      id: { in: data.accountIds },
      clientId: data.clientId,
      client: { workspaceId: user.workspaceId },
    },
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
      link: data.link ?? undefined,
      poll: data.poll ?? undefined,
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
              title: m.title,
            })),
          }
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
  const user = await requireUser();
  const data = postSchema.parse(input);

  const existing = await prisma.post.findFirst({
    where: { id, client: { workspaceId: user.workspaceId } },
  });
  if (!existing) throw new Error("Post not found.");
  // Only drafts and not-yet-published scheduled posts can be edited.
  if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") {
    throw new Error("Only drafts and scheduled posts can be edited.");
  }

  const accounts = await prisma.socialAccount.findMany({
    where: {
      id: { in: data.accountIds },
      clientId: data.clientId,
      client: { workspaceId: user.workspaceId },
    },
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

  // Replace media + targets wholesale - safe because nothing has published yet.
  await prisma.$transaction([
    prisma.mediaAsset.deleteMany({ where: { postId: id } }),
    prisma.postTarget.deleteMany({ where: { postId: id } }),
    prisma.post.update({
      where: { id },
      data: {
        clientId: data.clientId,
        body: data.body,
        status,
        // Provided on every edit, so DbNull clears a removed link/poll.
        link: data.link ?? Prisma.DbNull,
        poll: data.poll ?? Prisma.DbNull,
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
                title: m.title,
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

export async function retryPost(id: string) {
  const user = await requireUser();
  const owned = await prisma.post.findFirst({
    where: { id, client: { workspaceId: user.workspaceId } },
    select: { id: true },
  });
  if (!owned) throw new Error("Post not found.");
  await prisma.postTarget.updateMany({
    where: { postId: id, status: "FAILED" },
    data: { status: "SCHEDULED", attempts: 0, error: null },
  });
  await publishPostNow(id);
  revalidatePath("/queue");
}
