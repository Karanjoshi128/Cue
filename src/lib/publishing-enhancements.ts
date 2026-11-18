import { prisma } from "@/lib/prisma";
import { ensureFreshAccessToken } from "@/lib/tokens";
import { isPublishingPaused } from "@/lib/platform-settings";
import { fetchMedia } from "@/lib/platforms/fetch-media";

const ATTEMPTS = 3;
const LEASE_MS = 6 * 60_000;

/** Idempotent thumbnail replacement, isolated from video insertion so errors never duplicate a video. */
export async function applyPublishingEnhancements(deadline = Date.now() + 45_000) {
  if (await isPublishingPaused()) return { enhanced: 0, enhancementsFailed: 0 };
  const now = new Date();
  const targets = await prisma.postTarget.findMany({
    where: {
      platform: "YOUTUBE", status: "PUBLISHED", externalPostId: { not: null }, enhancedAt: null,
      enhancementAttempts: { lt: ATTEMPTS }, publishedAt: { lte: new Date(now.getTime() - 5 * 60_000) },
      OR: [{ enhancementClaimedAt: null }, { enhancementClaimedAt: { lt: new Date(now.getTime() - LEASE_MS) } }],
      post: { media: { some: { role: "COVER" } }, client: { workspace: { suspendedAt: null } } },
    }, include: { post: { include: { media: { where: { role: "COVER" } } } }, account: true },
    orderBy: { publishedAt: "asc" }, take: 10,
  });
  let enhanced = 0;
  let enhancementsFailed = 0;
  for (const target of targets) {
    if (Date.now() + 5_000 >= deadline) break;
    const claim = await prisma.postTarget.updateMany({
      where: { id: target.id, enhancedAt: null, enhancementAttempts: target.enhancementAttempts, enhancementClaimedAt: target.enhancementClaimedAt },
      data: { enhancementAttempts: { increment: 1 }, enhancementClaimedAt: now },
    });
    if (!claim.count) continue;
    try {
      const token = await ensureFreshAccessToken(target.account);
      // Upload-only grants cannot read processingDetails. Existing comment grants can.
      // Do not broaden OAuth for this enhancement.
      if (target.account.scopes?.includes("youtube.force-ssl")) {
        const status = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=processingDetails&id=${encodeURIComponent(target.externalPostId!)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
        if (!status.ok) throw new Error(`YouTube processing check failed (${status.status}).`);
        const result = await status.json() as { items?: { processingDetails?: { processingStatus?: string } }[] };
        const state = result.items?.[0]?.processingDetails?.processingStatus;
        if (state === "processing" && target.publishedAt && Date.now() - target.publishedAt.getTime() < 24 * 60 * 60_000) {
          await prisma.postTarget.update({ where: { id: target.id }, data: { enhancementAttempts: { decrement: 1 }, enhancementError: "Waiting for YouTube to finish processing the video." } });
          continue;
        }
        if (state !== "succeeded") throw new Error("YouTube has not made this video available for a thumbnail yet.");
      }
      const cover = await fetchMedia(target.post.media[0].url, Math.max(1_000, Math.min(15_000, deadline - Date.now())));
      if (cover.bytes.length > 2 * 1024 * 1024) throw new Error("Keep the YouTube thumbnail at or below 2 MB.");
      const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(target.externalPostId!)}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": cover.contentType || "application/octet-stream" },
        body: cover.bytes, signal: AbortSignal.timeout(Math.max(1_000, Math.min(20_000, deadline - Date.now()))),
      });
      if (!res.ok) throw new Error(`YouTube thumbnail failed (${res.status}): ${await res.text()}`);
      await prisma.postTarget.update({ where: { id: target.id }, data: { enhancedAt: new Date(), enhancementError: null } });
      enhanced++;
    } catch (err) {
      await prisma.postTarget.updateMany({ where: { id: target.id }, data: { enhancementError: (err instanceof Error ? err.message : "Thumbnail upload failed.").slice(0, 500) } });
      enhancementsFailed++;
    }
  }
  return { enhanced, enhancementsFailed };
}
