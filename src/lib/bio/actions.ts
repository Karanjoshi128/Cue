"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { toResult } from "@/lib/to-result";
import { workspaceHasFeature } from "@/lib/plans";
import { BIO_LIMITS, LINK_ID, isWebUrl, slugProblem, withScheme } from "./config";
import { refreshGrid } from "./grid";

// Link page actions (src/app/(app)/bio). Scoped to the caller's workspace and
// refused while link pages are switched off for it.

async function bioUser() {
  const user = await requireUser();
  if (!(await workspaceHasFeature(user.workspaceId, "bio_pages"))) {
    throw new ApiError(403, "Link-in-bio pages are switched off for this workspace.");
  }
  return user;
}

const webUrl = z
  .string()
  .trim()
  .max(BIO_LIMITS.url, "That link is too long.")
  .transform(withScheme)
  .refine(isWebUrl, "Links need to be web addresses, like https://example.com.");

const pageSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .superRefine((s, ctx) => {
      const problem = slugProblem(s);
      if (problem) ctx.addIssue({ code: "custom", message: `Address: ${problem}` });
    }),
  title: z.string().trim().min(1, "Give the page a title.").max(BIO_LIMITS.title),
  bio: z
    .string()
    .trim()
    .max(BIO_LIMITS.bio)
    .transform((v) => v || null),
  accountId: z.string().min(1).nullable(),
  links: z
    .array(
      z.object({
        id: z.string().regex(LINK_ID),
        label: z.string().trim().min(1, "Every link needs a label.").max(BIO_LIMITS.label),
        url: webUrl,
      }),
    )
    .max(BIO_LIMITS.links, `Up to ${BIO_LIMITS.links} links.`)
    .refine((ls) => new Set(ls.map((l) => l.id)).size === ls.length, "Two links share an id."),
  // Instagram media ids are digits. A blank address means "the post itself".
  postLinks: z
    .record(z.string().regex(/^\d{1,40}$/), z.string())
    .transform((r) => Object.entries(r).filter(([, url]) => url.trim()))
    .pipe(z.array(z.tuple([z.string(), webUrl])).max(BIO_LIMITS.grid * 4))
    .transform((entries) => Object.fromEntries(entries)),
  published: z.boolean(),
});

export type BioPageInput = z.input<typeof pageSchema>;

async function ownedClient(workspaceId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, workspaceId },
    select: { id: true, bioPage: { select: { id: true, accountId: true, gridAt: true } } },
  });
  if (!client) throw new ApiError(404, "That client is gone.");
  return client;
}

function gridError(err: unknown): string {
  return err instanceof Error ? err.message : "Instagram didn't answer.";
}

/**
 * Creates or updates a client's page. Saving never fails on Instagram: when
 * the grid can't be read, the page saves and the reason comes back.
 */
export async function saveBioPage(clientId: string, input: BioPageInput) {
  return toResult(async () => {
    const user = await bioUser();
    const data = pageSchema.parse(input);
    const client = await ownedClient(user.workspaceId, clientId);

    if (data.accountId) {
      const account = await prisma.socialAccount.findFirst({
        where: { id: data.accountId, clientId: client.id, platform: "INSTAGRAM" },
        select: { id: true },
      });
      if (!account) throw new ApiError(400, "Pick one of this client's Instagram accounts.");
    }

    const accountChanged = (client.bioPage?.accountId ?? null) !== data.accountId;
    const fields = {
      slug: data.slug,
      title: data.title,
      bio: data.bio,
      accountId: data.accountId,
      links: data.links,
      postLinks: data.postLinks,
      published: data.published,
      // A different account's posts: start the grid again.
      ...(accountChanged ? { grid: [], avatarUrl: null, gridAt: null } : {}),
    };

    let page: { id: string; slug: string; gridAt: Date | null };
    try {
      page = await prisma.bioPage.upsert({
        where: { clientId: client.id },
        create: { clientId: client.id, ...fields },
        update: fields,
        select: { id: true, slug: true, gridAt: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ApiError(409, "That address is taken. Try another.");
      }
      throw err;
    }

    let warning: string | null = null;
    if (data.accountId && !page.gridAt) {
      try {
        await refreshGrid(page.id, true);
      } catch (err) {
        warning = `Saved, but the posts couldn't be read: ${gridError(err)}`;
      }
    }
    revalidatePath("/bio");
    return { slug: page.slug, warning };
  });
}

/** Reads the client's recent posts again now. */
export async function refreshBioGrid(clientId: string) {
  return toResult(async () => {
    const user = await bioUser();
    const client = await ownedClient(user.workspaceId, clientId);
    const page = client.bioPage;
    if (!page?.accountId) throw new ApiError(400, "Pick an Instagram account for the grid first.");
    try {
      await refreshGrid(page.id, true);
    } catch (err) {
      throw new ApiError(502, gridError(err));
    }
    revalidatePath("/bio");
  });
}

/** Deletes the page and its counts. The address is free again straight away. */
export async function deleteBioPage(clientId: string) {
  return toResult(async () => {
    const user = await bioUser();
    const client = await ownedClient(user.workspaceId, clientId);
    if (client.bioPage) await prisma.bioPage.delete({ where: { id: client.bioPage.id } });
    revalidatePath("/bio");
  });
}
