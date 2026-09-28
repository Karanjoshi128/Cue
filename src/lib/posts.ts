import { z } from "zod";
import { Prisma, type Platform, type Post, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publishPostNow } from "@/lib/publish";
import { ApiError } from "@/lib/api";
import { cleanYoutubeTags, youtubeTagsProblem } from "@/lib/youtube-tags";

// Post creation shared by the composer's server actions and POST /api/v1/posts.
//
// Deliberately NOT a "use server" module. Every export of a "use server" file
// becomes a Server Action that any browser can invoke, and createPostForUser()
// takes the acting user as an argument - exported from there, a caller could
// simply pass someone else's. Here, only server code can reach it, and each
// caller authenticates the user itself first.

/** YouTube's description limit - the only platform allowed past 3000. */
const YOUTUBE_BODY_MAX = 5000;
/** LinkedIn's post limit; the ceiling for any target that isn't YouTube. */
const DEFAULT_BODY_MAX = 3000;

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

// Cleaned first (trimmed, empties dropped, duplicates removed) so the budget
// is measured on exactly what will be sent to YouTube.
const youtubeTagsSchema = z
  .array(z.string().max(500))
  .max(500)
  .optional()
  .transform((tags) => (tags ? cleanYoutubeTags(tags) : undefined))
  .superRefine((tags, ctx) => {
    const problem = tags ? youtubeTagsProblem(tags) : null;
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

export const postSchema = z
  .object({
    clientId: z.string().min(1),
    // 5000 is YouTube's cap. Every other platform is held to 3000 in
    // assertPostIsPublishable(), once we know which accounts are targeted.
    body: z.string().min(1).max(YOUTUBE_BODY_MAX),
    // YouTube-only fields (ignored for other platforms).
    title: z.string().max(100).optional(),
    youtubePrivacy: z.enum(["public", "unlisted", "private"]).optional(),
    youtubeTags: youtubeTagsSchema,
    youtubeCategoryId: z
      .string()
      .regex(/^\d{1,3}$/, 'youtubeCategoryId must be a YouTube category id, e.g. "24".')
      .optional(),
    accountIds: z.array(z.string()).min(1),
    // Offsets are accepted (e.g. +05:30), so callers needn't convert to UTC.
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
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
      .array(
        z.object({ accountId: z.string(), body: z.string().max(YOUTUBE_BODY_MAX) }),
      )
      .optional(),
    action: z.enum(["draft", "schedule", "now"]),
  })
  .refine((d) => d.action !== "schedule" || Boolean(d.scheduledAt), {
    message: "A scheduled post needs a date and time.",
    path: ["scheduledAt"],
  });

/** What callers send (before tags are cleaned). */
export type PostInput = z.input<typeof postSchema>;
/** What the schema produces once parsed. */
export type PostData = z.output<typeof postSchema>;

type TargetAccount = { id: string; platform: Platform; displayName: string };

/**
 * Loads the requested accounts, scoped to the caller's workspace and the post's
 * client. Every requested id must resolve: quietly dropping one would let a
 * caller believe it published to an account it never reached.
 */
export async function resolveAccounts(
  user: User,
  data: PostData,
): Promise<TargetAccount[]> {
  const client = await prisma.client.findFirst({
    where: { id: data.clientId, workspaceId: user.workspaceId },
    select: { id: true },
  });
  // Same answer for "doesn't exist" and "another workspace's", so ids from
  // other tenants can't be probed.
  if (!client) throw new ApiError(404, "Client not found.");

  const wanted = [...new Set(data.accountIds)];
  const accounts = await prisma.socialAccount.findMany({
    where: {
      id: { in: wanted },
      clientId: data.clientId,
      client: { workspaceId: user.workspaceId },
    },
    select: { id: true, platform: true, displayName: true },
  });
  if (accounts.length === 0) {
    throw new ApiError(
      400,
      "Select at least one connected account for this client.",
    );
  }
  if (accounts.length !== wanted.length) {
    const found = new Set(accounts.map((a) => a.id));
    const missing = wanted.filter((id) => !found.has(id));
    throw new ApiError(
      400,
      `These accounts aren't connected to this client: ${missing.join(", ")}`,
    );
  }
  return accounts;
}

/**
 * Rules that depend on which platforms are targeted, so they can't live in
 * the schema. Enforced for the composer and the API alike.
 */
export function assertPostIsPublishable(
  accounts: TargetAccount[],
  data: PostData,
): void {
  const overrides = new Map(
    (data.overrides ?? []).map((o) => [o.accountId, o.body]),
  );
  for (const a of accounts) {
    const cap = a.platform === "YOUTUBE" ? YOUTUBE_BODY_MAX : DEFAULT_BODY_MAX;
    const text = overrides.get(a.id) ?? data.body;
    if (text.length > cap) {
      throw new ApiError(
        400,
        `${a.displayName}: caption is over the ${cap}-character limit.`,
      );
    }
  }

  // Drafts may be incomplete. They pass through here again when scheduled or
  // published, which is when these become hard requirements.
  if (data.action === "draft") return;
  if (accounts.some((a) => a.platform === "YOUTUBE")) {
    if (!data.title?.trim()) {
      throw new ApiError(400, "A title is required when publishing to YouTube.");
    }
    if (!data.media?.some((m) => m.type === "VIDEO")) {
      throw new ApiError(400, "YouTube needs a video: add a VIDEO item to media.");
    }
  }
}

/** Builds the per-target rows, applying a caption override where one differs. */
export function buildTargets(accounts: TargetAccount[], data: PostData) {
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

/**
 * The YouTube-only columns. Empty values are written as null / [] rather than
 * left untouched, so an edit that drops YouTube also drops its settings.
 */
export function youtubeColumns(data: PostData) {
  return {
    title: data.title ?? null,
    youtubePrivacy: data.youtubePrivacy ?? null,
    youtubeTags: data.youtubeTags ?? [],
    youtubeCategoryId: data.youtubeCategoryId ?? null,
  };
}

export function statusFor(action: PostData["action"]) {
  return action === "draft"
    ? ("DRAFT" as const)
    : action === "now"
      ? ("PUBLISHING" as const)
      : ("SCHEDULED" as const);
}

export function scheduledAtFor(data: PostData): Date | null {
  if (data.action === "schedule" && data.scheduledAt) {
    return new Date(data.scheduledAt);
  }
  return data.action === "now" ? new Date() : null;
}

export function mediaCreate(data: PostData) {
  return data.media?.length
    ? {
        create: data.media.map((m) => ({
          type: m.type,
          url: m.url,
          storageKey: m.storageKey,
          title: m.title,
        })),
      }
    : undefined;
}

/**
 * What the API returns for a post. Explicit selects rather than whole rows, so
 * a column added to Post later can't leak into responses by accident.
 */
export const apiPostSummarySelect = {
  id: true,
  status: true,
  scheduledAt: true,
  title: true,
} satisfies Prisma.PostSelect;

export const apiPostDetailSelect = {
  ...apiPostSummarySelect,
  targets: {
    select: {
      id: true,
      platform: true,
      status: true,
      permalink: true,
      externalPostId: true,
      error: true,
      publishedAt: true,
    },
  },
} satisfies Prisma.PostSelect;

function findByIdempotencyKey(user: User, clientId: string, key: string) {
  return prisma.post.findFirst({
    where: {
      clientId,
      idempotencyKey: key,
      client: { workspaceId: user.workspaceId },
    },
  });
}

function isUniqueViolation(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
  );
}

/**
 * Creates a post as `user`, who must already be authenticated by the caller
 * (the composer's server action, or an API key). The only way posts are made.
 *
 * `idempotencyKey` makes retries safe: a repeat with the same key for the same
 * client returns the original post (`created: false`) and creates nothing.
 * That matters most for `now`, where a duplicate would publish twice to a live
 * channel.
 *
 * Publishing still goes through the one existing path: `now` calls
 * publishPostNow(), and `schedule` is left for the /api/cron/publish sweep.
 */
export async function createPostForUser(
  user: User,
  data: PostData,
  { idempotencyKey }: { idempotencyKey?: string } = {},
): Promise<{ post: Post; created: boolean }> {
  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(
      user,
      data.clientId,
      idempotencyKey,
    );
    if (existing) return { post: existing, created: false };
  }

  const accounts = await resolveAccounts(user, data);
  assertPostIsPublishable(accounts, data);

  let post: Post;
  try {
    post = await prisma.post.create({
      data: {
        clientId: data.clientId,
        authorId: user.id,
        body: data.body,
        ...youtubeColumns(data),
        idempotencyKey,
        status: statusFor(data.action),
        link: data.link ?? undefined,
        poll: data.poll ?? undefined,
        scheduledAt: scheduledAtFor(data),
        media: mediaCreate(data),
        targets: { create: buildTargets(accounts, data) },
      },
    });
  } catch (e) {
    // Two requests with the same key raced past the lookup above. The unique
    // index let exactly one win; hand the loser the winner's post.
    if (idempotencyKey && isUniqueViolation(e)) {
      const existing = await findByIdempotencyKey(
        user,
        data.clientId,
        idempotencyKey,
      );
      if (existing) return { post: existing, created: false };
    }
    throw e;
  }

  if (data.action === "now") {
    await publishPostNow(post.id);
    // Report where publishing actually landed, not the PUBLISHING it started as.
    post = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
  }

  return { post, created: true };
}
