import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiErrorResponse, requireApiUser } from "@/lib/api";
import { apiPostDetailSelect, deletePostForUser } from "@/lib/posts";

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
    await deletePostForUser(user, id);
    return NextResponse.json({ id, deleted: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
