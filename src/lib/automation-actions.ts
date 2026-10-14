"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { toResult } from "@/lib/to-result";
import { workspaceHasFeature } from "@/lib/plans";
import { ensureFreshAccessToken } from "@/lib/tokens";
import {
  automationsEnabled,
  hasAutomationScopes,
  LIMITS,
} from "@/lib/automations/config";
import { cleanKeywords } from "@/lib/automations/match";
import { listRecentMedia, InstagramApiError } from "@/lib/automations/instagram-api";
import { pollAccount } from "@/lib/automations/engine";

// Instagram comment automations (src/app/(app)/automations). Every action is
// scoped to the caller's workspace and refused while the feature is off.

async function automationUser() {
  const user = await requireUser();
  if (!automationsEnabled()) {
    throw new ApiError(403, "Instagram automations aren't available yet.");
  }
  if (!(await workspaceHasFeature(user.workspaceId, "ig_automations"))) {
    throw new ApiError(403, "Instagram automations are switched off for this workspace.");
  }
  return user;
}

/** An Instagram account in the caller's workspace that has comment access. */
async function ownedAccount(workspaceId: string, accountId: string) {
  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, platform: "INSTAGRAM", client: { workspaceId } },
  });
  if (!account) throw new ApiError(404, "Instagram account not found.");
  if (!hasAutomationScopes(account.scopes)) {
    throw new ApiError(
      400,
      `Reconnect ${account.displayName} and allow comment and message access first.`,
    );
  }
  return account;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const ruleSchema = z
  .object({
    accountId: z.string().min(1, "Pick an Instagram account."),
    name: z.string().trim().min(1, "Give the automation a name.").max(LIMITS.name),
    enabled: z.boolean(),
    scope: z.enum(["ANY_POST", "ONE_POST"]),
    media: z
      .object({
        id: z.string().min(1),
        permalink: z.string().nullish(),
        caption: z.string().nullish(),
        thumbUrl: z.string().nullish(),
      })
      .nullish(),
    postId: z.string().nullish(),
    matchMode: z.enum(["WORD", "CONTAINS", "ANY_COMMENT"]),
    keywords: z
      .array(z.string().max(LIMITS.keywordLength, "Keep each keyword short."))
      .max(LIMITS.keywords, `Up to ${LIMITS.keywords} keywords.`),
    replies: z
      .array(
        z.string().trim().max(LIMITS.replyLength, `Keep replies under ${LIMITS.replyLength} characters.`),
      )
      .max(LIMITS.replies, `Up to ${LIMITS.replies} reply variations.`)
      .transform((list) => list.filter(Boolean)),
    dmText: optionalText(LIMITS.dmLength),
    dmButtonLabel: optionalText(LIMITS.buttonLabel),
    dmButtonUrl: optionalText(2000),
    oncePerPerson: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (v.matchMode !== "ANY_COMMENT" && cleanKeywords(v.keywords).length === 0) {
      issue("Add at least one keyword, or trigger on every comment.");
    }
    if (!v.dmText && v.replies.length === 0) {
      issue("Add a public reply, a DM, or both.");
    }
    if (!v.dmText && (v.dmButtonLabel || v.dmButtonUrl)) {
      issue("A link button needs a DM to sit under.");
    }
    if (!!v.dmButtonLabel !== !!v.dmButtonUrl) {
      issue("A link button needs both a label and a link.");
    }
    if (v.dmButtonUrl) {
      let ok = false;
      try {
        ok = new URL(v.dmButtonUrl).protocol === "https:";
      } catch {}
      if (!ok) issue("The button link must be a full https:// address.");
    }
    if (v.scope === "ONE_POST" && !v.media && !v.postId) {
      issue("Pick the post this automation watches.");
    }
  });

export type AutomationInput = z.input<typeof ruleSchema>;

export async function saveAutomation(id: string | null, input: AutomationInput) {
  return toResult(async () => {
    const user = await automationUser();
    const data = ruleSchema.parse(input);
    const account = await ownedAccount(user.workspaceId, data.accountId);

    // Which post: one of the account's Instagram posts, or a Cue post that
    // will publish to this account (its media id is filled in when it does).
    let target = {
      mediaId: null as string | null,
      mediaPermalink: null as string | null,
      mediaCaption: null as string | null,
      mediaThumbUrl: null as string | null,
      postId: null as string | null,
    };
    if (data.scope === "ONE_POST" && data.postId) {
      const post = await prisma.post.findFirst({
        where: { id: data.postId, clientId: account.clientId },
        select: {
          id: true,
          body: true,
          targets: {
            where: { accountId: account.id },
            select: { status: true, externalPostId: true, permalink: true },
          },
        },
      });
      const igTarget = post?.targets[0];
      if (!post || !igTarget) {
        throw new ApiError(400, `That post isn't going to ${account.displayName}.`);
      }
      target = {
        mediaId: igTarget.status === "PUBLISHED" ? igTarget.externalPostId : null,
        mediaPermalink: igTarget.permalink,
        mediaCaption: post.body.slice(0, 300),
        mediaThumbUrl: null,
        postId: post.id,
      };
    } else if (data.scope === "ONE_POST" && data.media) {
      target = {
        mediaId: data.media.id,
        mediaPermalink: data.media.permalink ?? null,
        mediaCaption: data.media.caption?.slice(0, 300) ?? null,
        mediaThumbUrl: data.media.thumbUrl ?? null,
        postId: null,
      };
    }

    const fields = {
      clientId: account.clientId,
      accountId: account.id,
      name: data.name,
      enabled: data.enabled,
      scope: data.scope,
      ...target,
      matchMode: data.matchMode,
      keywords: data.matchMode === "ANY_COMMENT" ? [] : cleanKeywords(data.keywords),
      replies: data.replies,
      dmText: data.dmText,
      dmButtonLabel: data.dmText ? data.dmButtonLabel : null,
      dmButtonUrl: data.dmText ? data.dmButtonUrl : null,
      oncePerPerson: data.oncePerPerson,
    };

    if (id) {
      const existing = await prisma.automationRule.findFirst({
        where: { id, client: { workspaceId: user.workspaceId } },
        select: { enabled: true },
      });
      if (!existing) throw new ApiError(404, "Automation not found.");
      await prisma.automationRule.update({
        where: { id },
        data: {
          ...fields,
          // Switched back on: start from now, not from before it was off.
          ...(!existing.enabled && data.enabled ? { activeSince: new Date() } : {}),
        },
      });
    } else {
      const rule = await prisma.automationRule.create({ data: fields, select: { id: true } });
      id = rule.id;
    }
    revalidatePath("/automations");
    return { id };
  });
}

async function ownedRule(workspaceId: string, id: string) {
  const rule = await prisma.automationRule.findFirst({
    where: { id, client: { workspaceId } },
    select: { id: true, enabled: true },
  });
  if (!rule) throw new ApiError(404, "Automation not found.");
  return rule;
}

export async function setAutomationEnabled(id: string, enabled: boolean) {
  return toResult(async () => {
    const user = await automationUser();
    const rule = await ownedRule(user.workspaceId, id);
    await prisma.automationRule.update({
      where: { id: rule.id },
      data: {
        enabled,
        ...(!rule.enabled && enabled ? { activeSince: new Date() } : {}),
      },
    });
    revalidatePath("/automations");
  });
}

export async function deleteAutomation(id: string) {
  return toResult(async () => {
    const user = await automationUser();
    const rule = await ownedRule(user.workspaceId, id);
    await prisma.automationRule.delete({ where: { id: rule.id } });
    revalidatePath("/automations");
  });
}

/** Reads the account's comments now instead of waiting for the next minute. */
export async function checkCommentsNow(accountId: string) {
  return toResult(async () => {
    const user = await automationUser();
    const account = await ownedAccount(user.workspaceId, accountId);
    const result = await pollAccount(account.id);
    if (result.error && result.comments === 0) throw new ApiError(502, result.error);
    revalidatePath("/automations");
    return result;
  });
}

export interface PickableMedia {
  id: string;
  caption: string | null;
  thumbUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
  type: string | null;
}

/** The account's recent Instagram posts, for picking the one a rule watches. */
export async function listAccountMedia(accountId: string) {
  return toResult(async (): Promise<PickableMedia[]> => {
    const user = await automationUser();
    const account = await ownedAccount(user.workspaceId, accountId);
    try {
      const token = await ensureFreshAccessToken(account);
      const media = await listRecentMedia(token, 24);
      return media.map((m) => ({
        id: m.id,
        caption: m.caption ?? null,
        // Videos and Reels only have a cover image as thumbnail_url.
        thumbUrl: m.thumbnail_url ?? (m.media_type === "VIDEO" ? null : m.media_url ?? null),
        permalink: m.permalink ?? null,
        timestamp: m.timestamp ?? null,
        type: m.media_product_type ?? m.media_type ?? null,
      }));
    } catch (err) {
      if (err instanceof InstagramApiError) throw new ApiError(502, err.message);
      throw err;
    }
  });
}
