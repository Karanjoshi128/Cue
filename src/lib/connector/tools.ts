import type { User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { workspaceFeatureAvailable, workspaceHasFeature } from "@/lib/plans";
import {
  apiPostDetailSelect,
  createPostForUser,
  deletePostForUser,
  postSchema,
} from "@/lib/posts";
import { REPLY_LIMIT } from "@/lib/reply-desk/config";
import { postDeskReply } from "@/lib/reply-desk/reply";

// What an assistant can do in Cue through the connector. Each tool is one
// zod schema (validation, and the JSON Schema the assistant sees) and a
// function over the same code the app and /api/v1 use, run as the member.

export interface ToolContext {
  user: User;
  /** This site, for links back into Cue. */
  origin: string;
}

interface Annotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

interface Tool<S extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  input: S;
  annotations: Annotations;
  /** Hidden unless this is true for the caller (features that may be off). */
  available?: (user: User) => Promise<boolean>;
  run: (args: z.output<S>, ctx: ToolContext) => Promise<Record<string, unknown>>;
}

const tool = <S extends z.ZodType>(t: Tool<S>) => t as unknown as Tool;

const STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHING", "PUBLISHED", "PARTIAL", "FAILED"] as const;
const NO_ARGS = z.object({}).strict();

const deskOn = async (user: User) =>
  (await workspaceFeatureAvailable(user.workspaceId, "reply_desk")) &&
  (await workspaceHasFeature(user.workspaceId, "reply_desk"));

export const TOOLS: Tool[] = [
  tool({
    name: "list_clients",
    title: "List clients and accounts",
    description:
      "The agency's clients and each one's connected LinkedIn, Instagram and YouTube accounts. Call this first: posts need a clientId and accountIds from here. Also returns the current time.",
    input: NO_ARGS,
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (_args, { user }) => {
      const clients = await prisma.client.findMany({
        where: { workspaceId: user.workspaceId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          accounts: {
            orderBy: { createdAt: "asc" },
            select: { id: true, platform: true, displayName: true },
          },
        },
      });
      return {
        now: new Date().toISOString(),
        clients: clients.map((c) => ({
          id: c.id,
          name: c.name,
          accounts: c.accounts.map((a) => ({ id: a.id, platform: a.platform, name: a.displayName })),
        })),
      };
    },
  }),

  tool({
    name: "list_posts",
    title: "List posts",
    description:
      "Posts in Cue, newest first, or soonest first when status is SCHEDULED. Filter by client and status.",
    input: z
      .object({
        clientId: z.string().min(1).optional().describe("Only this client's posts."),
        status: z.enum(STATUSES).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      })
      .strict(),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async ({ clientId, status, limit }, { user }) => {
      const posts = await prisma.post.findMany({
        where: {
          client: { workspaceId: user.workspaceId },
          ...(clientId ? { clientId } : {}),
          ...(status ? { status } : {}),
        },
        orderBy: status === "SCHEDULED" ? { scheduledAt: "asc" } : { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          title: true,
          body: true,
          client: { select: { id: true, name: true } },
          targets: { select: { platform: true, status: true } },
        },
      });
      return {
        posts: posts.map((p) => ({
          id: p.id,
          status: p.status,
          client: p.client,
          scheduledAt: p.scheduledAt?.toISOString() ?? null,
          title: p.title,
          text: p.body.length > 280 ? `${p.body.slice(0, 280)}…` : p.body,
          targets: p.targets,
        })),
      };
    },
  }),

  tool({
    name: "get_post",
    title: "Get a post",
    description: "One post in full, with where it went out, links to it, and any errors.",
    input: z.object({ postId: z.string().min(1) }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async ({ postId }, { user, origin }) => {
      const post = await prisma.post.findFirst({
        where: { id: postId, client: { workspaceId: user.workspaceId } },
        select: { ...apiPostDetailSelect, body: true, client: { select: { id: true, name: true } } },
      });
      if (!post) throw new ApiError(404, "Post not found.");
      return { ...post, openInCue: `${origin}/composer?edit=${post.id}` };
    },
  }),

  tool({
    name: "create_post",
    title: "Create a post",
    description:
      "Creates a post for one client on one or more of its accounts. action draft saves it for review in Cue; schedule publishes it at scheduledAt; now publishes immediately, so use now only when the person asked to publish right away. Instagram and YouTube need a photo or video, which can't be attached here: create those as drafts and finish them in Cue (openInCue).",
    input: z
      .object({
        clientId: z.string().min(1).describe("From list_clients."),
        accountIds: z.array(z.string().min(1)).min(1).describe("Accounts of that client, from list_clients."),
        text: z.string().min(1).describe("The post's text (LinkedIn up to 3000 characters, YouTube 5000)."),
        action: z.enum(["draft", "schedule", "now"]),
        scheduledAt: z
          .string()
          .optional()
          .describe("For schedule: ISO 8601 with a UTC offset, e.g. 2026-11-03T18:30:00+05:30. Must be in the future."),
        title: z.string().max(100).optional().describe("YouTube video title."),
        firstComment: z.string().optional().describe("Posted as the first comment on YouTube and Instagram."),
        link: z
          .object({
            url: z.string(),
            title: z.string().optional(),
            description: z.string().optional(),
          })
          .optional()
          .describe("A link preview card (LinkedIn)."),
        perAccountText: z
          .array(z.object({ accountId: z.string(), text: z.string() }))
          .optional()
          .describe("Different text for some accounts; the rest use text."),
      })
      .strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    run: async (a, { user, origin }) => {
      if (a.action === "schedule") {
        const at = a.scheduledAt ? Date.parse(a.scheduledAt) : NaN;
        if (Number.isNaN(at)) {
          throw new ApiError(400, "schedule needs scheduledAt, an ISO 8601 time with a UTC offset.");
        }
        if (at < Date.now() + 60_000) {
          throw new ApiError(400, `scheduledAt must be in the future. It's ${new Date().toISOString()} now.`);
        }
      }
      const data = postSchema.parse({
        clientId: a.clientId,
        accountIds: a.accountIds,
        body: a.text,
        action: a.action,
        scheduledAt: a.action === "schedule" ? a.scheduledAt : null,
        title: a.title,
        firstComment: a.firstComment,
        link: a.link ?? null,
        overrides: a.perAccountText?.map((o) => ({ accountId: o.accountId, body: o.text })),
      });
      const { post } = await createPostForUser(user, data);
      return {
        id: post.id,
        status: post.status,
        scheduledAt: post.scheduledAt?.toISOString() ?? null,
        openInCue: `${origin}/composer?edit=${post.id}`,
      };
    },
  }),

  tool({
    name: "delete_post",
    title: "Delete a post",
    description: "Deletes a draft or scheduled post. Posts already publishing or published can't be deleted.",
    input: z.object({ postId: z.string().min(1) }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: async ({ postId }, { user }) => {
      await deletePostForUser(user, postId);
      return { id: postId, deleted: true };
    },
  }),

  tool({
    name: "list_open_comments",
    title: "List comments waiting for a reply",
    description:
      "Comments on the clients' Instagram and YouTube posts that nobody has answered yet, from Cue's Reply Desk. Questions only by default.",
    input: z
      .object({
        clientId: z.string().min(1).optional(),
        questionsOnly: z.boolean().default(true),
        limit: z.number().int().min(1).max(50).default(20),
      })
      .strict(),
    annotations: { readOnlyHint: true, openWorldHint: false },
    available: deskOn,
    run: async ({ clientId, questionsOnly, limit }, { user }) => {
      const comments = await prisma.inboxComment.findMany({
        where: {
          account: { client: { workspaceId: user.workspaceId } },
          ...(clientId ? { clientId } : {}),
          state: "OPEN",
          kind: questionsOnly ? "QUESTION" : { in: ["QUESTION", "OTHER"] },
        },
        orderBy: { postedAt: "desc" },
        take: limit,
        include: { account: { select: { displayName: true, client: { select: { name: true } } } } },
      });
      return {
        comments: comments.map((c) => ({
          id: c.id,
          platform: c.platform,
          client: c.account.client.name,
          account: c.account.displayName,
          author: c.author,
          text: c.text,
          on: c.mediaTitle,
          postUrl: c.mediaUrl,
          postedAt: c.postedAt.toISOString(),
        })),
      };
    },
  }),

  tool({
    name: "reply_to_comment",
    title: "Reply to a comment",
    description:
      "Replies publicly under a comment from list_open_comments, as the client's account. Show the person the reply before sending it.",
    input: z
      .object({
        commentId: z.string().min(1),
        text: z.string().min(1).max(REPLY_LIMIT),
      })
      .strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    available: deskOn,
    run: async ({ commentId, text }, { user }) => {
      await postDeskReply(user, commentId, text);
      return { commentId, replied: true };
    },
  }),
];

/** The tools this member can use, as tools/list describes them. */
export async function listTools(user: User) {
  const visible: Tool[] = [];
  for (const t of TOOLS) {
    if (!t.available || (await t.available(user))) visible.push(t);
  }
  return visible.map((t) => {
    const inputSchema = z.toJSONSchema(t.input, { io: "input" }) as Record<string, unknown>;
    delete inputSchema.$schema; // 2020-12 is MCP's default
    return { name: t.name, title: t.title, description: t.description, inputSchema, annotations: t.annotations };
  });
}

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}
