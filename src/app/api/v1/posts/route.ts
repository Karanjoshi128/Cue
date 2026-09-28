import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  apiErrorResponse,
  readIdempotencyKey,
  readJson,
  requireApiUser,
} from "@/lib/api";
import {
  apiPostSummarySelect,
  createPostForUser,
  postSchema,
} from "@/lib/posts";

export const dynamic = "force-dynamic";
// `action: "now"` publishes inline: the video is pulled from R2, then uploaded
// to YouTube with a resumable PUT (~30 MB for a Short). That needs far longer
// than the default function budget.
export const maxDuration = 300;

/**
 * POST /api/v1/posts - create a post, and schedule or publish it.
 * Returns `{ id, status }`: 201 when created, 200 when an Idempotency-Key
 * matched an earlier request (nothing new is created in that case).
 */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const idempotencyKey = readIdempotencyKey(req);
    const data = postSchema.parse(await readJson(req));
    const { post, created } = await createPostForUser(user, data, {
      idempotencyKey,
    });
    return NextResponse.json(
      { id: post.id, status: post.status },
      { status: created ? 201 : 200 },
    );
  } catch (e) {
    return apiErrorResponse(e);
  }
}

const listQuerySchema = z.object({
  clientId: z.string().min(1).optional(),
  status: z
    .enum(["DRAFT", "SCHEDULED", "PUBLISHING", "PUBLISHED", "PARTIAL", "FAILED"])
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, "limit must be between 1 and 100.")
    .max(100, "limit must be between 1 and 100.")
    .default(20),
});

/**
 * GET /api/v1/posts?clientId=&status=&limit= - newest first. Empty query
 * params are treated as absent, so `?clientId=&status=` lists everything.
 */
export async function GET(req: Request) {
  try {
    const user = await requireApiUser(req);
    const params = Object.fromEntries(
      [...new URL(req.url).searchParams].filter(([, v]) => v !== ""),
    );
    const query = listQuerySchema.parse(params);

    const posts = await prisma.post.findMany({
      where: {
        client: { workspaceId: user.workspaceId },
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.limit,
      select: apiPostSummarySelect,
    });
    return NextResponse.json(posts);
  } catch (e) {
    return apiErrorResponse(e);
  }
}
