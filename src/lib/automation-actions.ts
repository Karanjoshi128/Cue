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
  type AutomationPreset,
} from "@/lib/automations/config";
import { cleanKeywords } from "@/lib/automations/match";
import { presetFromIdea } from "@/lib/automations/preset";
import { listRecentMedia, InstagramApiError } from "@/lib/automations/instagram-api";
import { pollAccount, processRun } from "@/lib/automations/engine";
import { aiEnabled, draftAutomation, writeDmVariants as writeVariants } from "@/lib/ai";

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
    where: { id: idSchema.parse(accountId), platform: "INSTAGRAM", client: { workspaceId } },
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

// Every export is a public POST endpoint and TypeScript types don't exist at
// runtime, so each argument is parsed before it reaches a query (an object
// where an id belongs would read as a filter matching every row).
const idSchema = z.string().min(1).max(100);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const ruleSchema = z
  .object({
    accountId: z.string().min(1, "Pick an Instagram account.").max(100),
    name: z.string().trim().min(1, "Give the automation a name.").max(LIMITS.name),
    enabled: z.boolean(),
    trigger: z.enum(["COMMENT", "STORY_REPLY", "DM_KEYWORD"]),
    scope: z.enum(["ANY_POST", "ONE_POST"]),
    media: z
      .object({
        id: z.string().min(1).max(100),
        permalink: z.string().max(2000).nullish(),
        caption: z.string().max(5000).nullish(),
        thumbUrl: z.string().max(4000).nullish(),
      })
      .nullish(),
    postId: idSchema.nullish(),
    matchMode: z.enum(["WORD", "CONTAINS", "ANY_COMMENT"]),
    fuzzy: z.boolean(),
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
    dmVariants: z
      .array(z.string().trim().max(LIMITS.dmLength, `Keep DMs under ${LIMITS.dmLength} characters.`))
      .max(LIMITS.dmVariants, `Up to ${LIMITS.dmVariants} DM variations.`)
      .transform((list) => list.filter(Boolean)),
    rotateEvery: z.number().int().min(1).max(1000),
    dmButtonLabel: optionalText(LIMITS.buttonLabel),
    dmButtonUrl: optionalText(2000),
    oncePerPerson: z.boolean(),
    followGate: z.boolean(),
    gateText: optionalText(LIMITS.dmLength),
    collect: z.enum(["EMAIL", "PHONE"]).nullish().transform((v) => v ?? null),
    askText: optionalText(LIMITS.dmLength),
    followUpText: optionalText(LIMITS.dmLength),
    followUpMinutes: z
      .number()
      .int()
      .min(1)
      .max(LIMITS.followUpMaxMinutes, "The follow-up has to go within 23 hours."),
    holdWords: z
      .array(z.string().max(LIMITS.keywordLength))
      .max(LIMITS.holdWords, `Up to ${LIMITS.holdWords} hold words.`),
    aiModeration: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (v.matchMode !== "ANY_COMMENT" && cleanKeywords(v.keywords).length === 0) {
      issue("Add at least one keyword, or trigger on every comment.");
    }
    if (!v.dmText && v.replies.length === 0) {
      issue("Add a public reply, a DM, or both.");
    }
    if (v.trigger !== "COMMENT" && !v.dmText) {
      issue("Story-reply and DM automations answer with a DM, so add one.");
    }
    if (!v.dmText && (v.followGate || v.collect)) {
      issue("The follow gate and questions lead to a DM, so add one.");
    }
    if (v.followUpText && !v.followGate && !v.collect) {
      issue("A follow-up only goes to someone part-way through: turn on the follow gate or a question.");
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
    if (v.trigger === "COMMENT" && v.scope === "ONE_POST" && !v.media && !v.postId) {
      issue("Pick the post this automation watches.");
    }
  });

export type AutomationInput = z.input<typeof ruleSchema>;

export async function saveAutomation(id: string | null, input: AutomationInput) {
  return toResult(async () => {
    const user = await automationUser();
    const ruleId = id === null ? null : idSchema.parse(id);
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
    const onePost = data.trigger === "COMMENT" && data.scope === "ONE_POST";
    if (onePost && data.postId) {
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
    } else if (onePost && data.media) {
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
      trigger: data.trigger,
      // Story replies and DMs aren't on a post.
      scope: data.trigger === "COMMENT" ? data.scope : ("ANY_POST" as const),
      ...target,
      matchMode: data.matchMode,
      fuzzy: data.fuzzy,
      keywords: data.matchMode === "ANY_COMMENT" ? [] : cleanKeywords(data.keywords),
      // A public reply only exists for a comment.
      replies: data.trigger === "COMMENT" ? data.replies : [],
      dmText: data.dmText,
      dmVariants: data.dmText ? data.dmVariants : [],
      rotateEvery: data.rotateEvery,
      dmButtonLabel: data.dmText ? data.dmButtonLabel : null,
      dmButtonUrl: data.dmText ? data.dmButtonUrl : null,
      oncePerPerson: data.oncePerPerson,
      followGate: data.followGate,
      gateText: data.followGate ? data.gateText : null,
      collect: data.collect,
      askText: data.collect ? data.askText : null,
      followUpText: data.followUpText,
      followUpMinutes: data.followUpMinutes,
      holdWords: cleanKeywords(data.holdWords),
      aiModeration: data.aiModeration && aiEnabled(),
    };

    let savedId: string;
    if (ruleId) {
      const existing = await prisma.automationRule.findFirst({
        where: { id: ruleId, client: { workspaceId: user.workspaceId } },
        select: { id: true, enabled: true },
      });
      if (!existing) throw new ApiError(404, "Automation not found.");
      await prisma.automationRule.update({
        where: { id: existing.id },
        data: {
          ...fields,
          // Switched back on: start from now, not from before it was off.
          ...(!existing.enabled && data.enabled ? { activeSince: new Date() } : {}),
        },
      });
      savedId = existing.id;
    } else {
      const rule = await prisma.automationRule.create({ data: fields, select: { id: true } });
      savedId = rule.id;
    }
    revalidatePath("/automations");
    return { id: savedId };
  });
}

async function ownedRule(workspaceId: string, id: string) {
  const rule = await prisma.automationRule.findFirst({
    where: { id: idSchema.parse(id), client: { workspaceId } },
    select: { id: true, enabled: true },
  });
  if (!rule) throw new ApiError(404, "Automation not found.");
  return rule;
}

export async function setAutomationEnabled(id: string, enabled: boolean) {
  return toResult(async () => {
    const user = await automationUser();
    const rule = await ownedRule(user.workspaceId, id);
    const on = z.boolean().parse(enabled);
    await prisma.automationRule.update({
      where: { id: rule.id },
      data: {
        enabled: on,
        ...(!rule.enabled && on ? { activeSince: new Date() } : {}),
      },
    });
    revalidatePath("/automations");
  });
}

/** A held comment: send it after all, or dismiss it. */
export async function resolveHeld(runId: string, send: boolean) {
  return toResult(async () => {
    const user = await automationUser();
    const run = await prisma.automationRun.findFirst({
      where: { id: idSchema.parse(runId), status: "HELD", rule: { client: { workspaceId: user.workspaceId } } },
      select: { id: true },
    });
    if (!run) throw new ApiError(404, "That held comment is gone.");
    if (z.boolean().parse(send)) {
      await prisma.automationRun.update({
        where: { id: run.id },
        data: { status: "QUEUED", nextAttemptAt: null },
      });
      await processRun(run.id);
    } else {
      await prisma.automationRun.update({ where: { id: run.id }, data: { status: "SKIPPED" } });
    }
    revalidatePath("/automations");
  });
}

/** AI-written other wordings of a DM, for the editor to show before saving. */
export async function writeDmVariants(text: string, count: number) {
  return toResult(async () => {
    const user = await automationUser();
    if (!aiEnabled() || !(await workspaceHasFeature(user.workspaceId, "ai"))) {
      throw new ApiError(403, "AI helpers aren't switched on.");
    }
    const clean = z.string().trim().min(1, "Write the DM first.").max(LIMITS.dmLength).parse(text);
    const n = z.number().int().min(1).max(LIMITS.dmVariants).catch(LIMITS.dmVariants).parse(count);
    return writeVariants(clean, n);
  });
}

/** Removes someone from the leads list. */
export async function deleteLead(id: string) {
  return toResult(async () => {
    const user = await automationUser();
    const { count } = await prisma.lead.deleteMany({
      where: { id: idSchema.parse(id), client: { workspaceId: user.workspaceId } },
    });
    if (!count) throw new ApiError(404, "Lead not found.");
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

/**
 * An automation described in a sentence, typed or spoken: Claude fills in the
 * settings and the editor opens with them, for the person to check and save.
 */
export async function draftAutomationFromText(text: string, accountId: string) {
  return toResult(async (): Promise<AutomationPreset> => {
    const user = await automationUser();
    if (!aiEnabled() || !(await workspaceHasFeature(user.workspaceId, "ai"))) {
      throw new ApiError(403, "AI helpers aren't switched on.");
    }
    const description = z
      .string()
      .trim()
      .min(8, "Say a little more about what it should do.")
      .max(600, "Keep it to a sentence or two.")
      .parse(text);
    const account = await ownedAccount(user.workspaceId, accountId);
    const client = await prisma.client.findUnique({ where: { id: account.clientId }, select: { name: true } });
    return presetFromIdea(await draftAutomation(description, client?.name ?? account.displayName));
  });
}
