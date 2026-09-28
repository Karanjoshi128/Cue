import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiErrorResponse, requireApiUser } from "@/lib/api";
import { apiPostDetailSelect } from "@/lib/posts";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/posts/:id - a post with each target's publish result. This is
 * what a caller polls after `schedule`, or after a `now` that came back still
 * PUBLISHING.
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireApiUser(req);
    const { id } = await params;
    const post = await prisma.post.findFirst({
      where: { id, client: { workspaceId: user.workspaceId } },
      select: apiPostDetailSelect,
    });
    // Another workspace's post gets the same 404 as a missing one.
    if (!post) throw new ApiError(404, "Post not found.");
    return NextResponse.json(post);
  } catch (e) {
    return apiErrorResponse(e);
  }
}

/**
 * DELETE /api/v1/posts/:id - only while the post is DRAFT or SCHEDULED;
 * anything further along is 409.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const user = await requireApiUser(req);
    const { id } = await params;

    // One conditional statement rather than check-then-delete: the publish
    // cron could otherwise claim the post between the two. A SCHEDULED post
    // can already have a target mid-upload (PROCESSING), so that's excluded
    // too - deleting under it would strand a live upload.
    const { count } = await prisma.post.deleteMany({
      where: {
        id,
        client: { workspaceId: user.workspaceId },
        status: { in: ["DRAFT", "SCHEDULED"] },
        targets: { none: { status: "PROCESSING" } },
      },
    });
    if (count === 1) return NextResponse.json({ id, deleted: true });

    // Nothing was deleted - find out why, to answer 404 vs 409.
    const post = await prisma.post.findFirst({
      where: { id, client: { workspaceId: user.workspaceId } },
      select: { status: true },
    });
    if (!post) throw new ApiError(404, "Post not found.");
    throw new ApiError(
      409,
      post.status === "DRAFT" || post.status === "SCHEDULED"
        ? "This post is being published right now and can no longer be deleted."
        : `Only DRAFT or SCHEDULED posts can be deleted; this one is ${post.status}.`,
    );
  } catch (e) {
    return apiErrorResponse(e);
  }
}
