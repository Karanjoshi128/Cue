import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { deleteFromR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";

const RETENTION_DAYS = 7;

/**
 * Daily purge: deletes posts (+ their media, targets, comments) older than 7 days
 * and removes the media objects from R2.
 *
 * IMPORTANT: only touches Post/PostTarget/MediaAsset/Comment (cascades from Post).
 * PostHistory and any future persistent tables (Templates, Ideas, StartPages) are
 * deliberately NEVER deleted here.
 */
export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const stale = await prisma.post.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, media: { select: { storageKey: true } } },
  });

  if (stale.length === 0) {
    return NextResponse.json({ ok: true, deletedPosts: 0, deletedObjects: 0 });
  }

  // Delete R2 objects first (DB rows are the source of truth for keys).
  const keys = stale.flatMap((p) => p.media.map((m) => m.storageKey));
  await deleteFromR2(keys);

  // Cascade delete posts (MediaAsset / PostTarget / Comment cascade via schema).
  const ids = stale.map((p) => p.id);
  await prisma.post.deleteMany({ where: { id: { in: ids } } });

  return NextResponse.json({
    ok: true,
    deletedPosts: ids.length,
    deletedObjects: keys.length,
  });
}
