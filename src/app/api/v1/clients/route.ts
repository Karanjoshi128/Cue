import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse, requireApiUser } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/clients - the key's workspace's clients and their connected
 * accounts. The account ids here are what POST /api/v1/posts takes in
 * `accountIds`. Explicit selects: tokens are never part of the response.
 */
export async function GET(req: Request) {
  try {
    const user = await requireApiUser(req);
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
    return NextResponse.json(clients);
  } catch (e) {
    return apiErrorResponse(e);
  }
}
