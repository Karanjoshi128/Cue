"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { workspaceHasFeature } from "@/lib/plans";
import type { ActionResult } from "@/lib/action-result";
import {
  clearPending,
  MAX_PAGES,
  PAGE_SCOPES,
  pageUrn,
  readPending,
} from "@/lib/linkedin-pages";

const EXPIRED =
  "This LinkedIn connection has expired. Start again from Clients with the LinkedIn Page button.";

const assignmentsSchema = z
  .array(z.object({ pageId: z.string().min(1), clientId: z.string().min(1) }))
  .max(MAX_PAGES);

/**
 * Saves the picker's choices: each Page the user assigned to a client becomes
 * a LINKEDIN account on that client, sharing the one token LinkedIn issued.
 * Page ids are checked against the encrypted list from the callback, not
 * trusted from the form. Re-assigning a Page a client already has refreshes
 * its token, which is how reconnecting works.
 */
export async function connectLinkedInPages(
  input: { pageId: string; clientId: string }[],
): Promise<ActionResult<{ connected: number }>> {
  try {
    const user = await requireUser();
    if (!(await workspaceHasFeature(user.workspaceId, "linkedin"))) {
      throw new ApiError(403, "Connecting LinkedIn is turned off for your workspace.");
    }
    const pending = await readPending(user.id);
    if (!pending) throw new ApiError(400, EXPIRED);

    const assignments = assignmentsSchema.parse(input);
    if (assignments.length === 0) {
      throw new ApiError(400, "Choose a client for at least one Page.");
    }
    const names = new Map(pending.pages.map((p) => [p.id, p.name]));
    if (assignments.some((a) => !names.has(a.pageId))) {
      throw new ApiError(400, EXPIRED);
    }
    const clientIds = [...new Set(assignments.map((a) => a.clientId))];
    const owned = await prisma.client.count({
      where: { id: { in: clientIds }, workspaceId: user.workspaceId },
    });
    if (owned !== clientIds.length) {
      throw new ApiError(403, "One of those clients isn't in your workspace.");
    }

    const { token } = pending;
    const tokens = {
      accessToken: encrypt(token.accessToken),
      refreshToken: token.refreshToken ? encrypt(token.refreshToken) : null,
      tokenExpires: new Date(token.expiresAt),
    };
    await prisma.$transaction(
      assignments.map((a) =>
        prisma.socialAccount.upsert({
          where: {
            clientId_platform_externalId: {
              clientId: a.clientId,
              platform: "LINKEDIN",
              externalId: pageUrn(a.pageId),
            },
          },
          update: { ...tokens, displayName: names.get(a.pageId)!, scopes: PAGE_SCOPES },
          create: {
            clientId: a.clientId,
            platform: "LINKEDIN",
            externalId: pageUrn(a.pageId),
            displayName: names.get(a.pageId)!,
            scopes: PAGE_SCOPES,
            ...tokens,
          },
        }),
      ),
    );

    await clearPending();
    revalidatePath("/clients");
    return { ok: true, data: { connected: assignments.length } };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: "Check your choices and try again." };
    throw e;
  }
}

/** Drops the pending connection without saving anything. */
export async function cancelLinkedInPages(): Promise<void> {
  await requireUser();
  await clearPending();
}
