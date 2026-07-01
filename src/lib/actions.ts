"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { publishPostNow } from "@/lib/publish";

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
  action: z.enum(["draft", "schedule", "now"]),
});

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
      targets: {
        create: accounts.map((a) => ({
          accountId: a.id,
          platform: a.platform,
          status: data.action === "draft" ? "SCHEDULED" : "SCHEDULED",
        })),
      },
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
        targets: {
          create: accounts.map((a) => ({
            accountId: a.id,
            platform: a.platform,
            status: "SCHEDULED",
          })),
        },
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
