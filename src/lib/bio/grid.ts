import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureFreshAccessToken } from "@/lib/tokens";
import {
  getOwnProfile,
  listRecentMedia,
  type InstagramMedia,
} from "@/lib/automations/instagram-api";
import { BIO_LIMITS, type BioTile } from "./config";

// The post grid on link pages. It's read from Instagram and kept on the page,
// so a visit renders from the database: a view that finds it older than 15
// minutes refreshes it afterwards, and one that finds it older than a day
// reads it first, since Instagram's image links stop working after a few days.

export const GRID_FRESH_MS = 15 * 60_000;
export const GRID_EXPIRED_MS = 24 * 60 * 60_000;

function toTile(m: InstagramMedia): BioTile | null {
  // Videos and reels have a cover image; photos and albums a media link.
  const image = m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url;
  if (!image || !m.permalink) return null;
  return {
    id: m.id,
    image,
    permalink: m.permalink,
    caption: (m.caption ?? "").slice(0, 140),
    video: m.media_type === "VIDEO",
  };
}

/**
 * Reads the grid and profile picture again. The page is claimed first, so
 * views arriving together make one call to Instagram between them, and a
 * failed read waits the full 15 minutes before the next try. `force` skips the
 * wait (Refresh in the editor). False when there's no account or another
 * request has it; Instagram's errors are thrown.
 */
export async function refreshGrid(pageId: string, force = false): Promise<boolean> {
  const now = new Date();
  const claimed = await prisma.bioPage.updateMany({
    where: {
      id: pageId,
      accountId: { not: null },
      ...(force
        ? {}
        : { OR: [{ gridAt: null }, { gridAt: { lt: new Date(now.getTime() - GRID_FRESH_MS) } }] }),
    },
    data: { gridAt: now },
  });
  if (!claimed.count) return false;

  const page = await prisma.bioPage.findUnique({
    where: { id: pageId },
    select: { account: true },
  });
  const account = page?.account;
  if (!account || account.platform !== "INSTAGRAM") return false;

  const token = await ensureFreshAccessToken(account);
  const [media, profile] = await Promise.all([
    listRecentMedia(token, BIO_LIMITS.grid),
    // A missing picture shouldn't cost the grid.
    getOwnProfile(token).catch(() => null),
  ]);
  const grid = media.map(toTile).filter((t): t is BioTile => t !== null);
  await prisma.bioPage.update({
    where: { id: pageId },
    data: {
      grid: grid as unknown as Prisma.InputJsonValue,
      ...(profile ? { avatarUrl: profile.profilePicture ?? null } : {}),
    },
  });
  return true;
}
