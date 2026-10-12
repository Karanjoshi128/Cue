import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Platform-wide switches (one row, "global") and the publisher's heartbeat.
// Read by the publisher and the app shell, written only by the admin panel.

export interface PlatformSettingsView {
  publishingPaused: boolean;
  pausedReason: string | null;
  announcement: string | null;
  announcementTone: "info" | "warning";
  announcementAt: Date | null;
  updatedBy: string | null;
  updatedAt: Date | null;
}

export async function getPlatformSettings(): Promise<PlatformSettingsView> {
  const row = await prisma.platformSettings.findUnique({ where: { id: "global" } });
  return {
    publishingPaused: row?.publishingPaused ?? false,
    pausedReason: row?.pausedReason ?? null,
    announcement: row?.announcement ?? null,
    announcementTone: row?.announcementTone === "warning" ? "warning" : "info",
    announcementAt: row?.announcementAt ?? null,
    updatedBy: row?.updatedBy ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function updatePlatformSettings(
  data: Omit<Prisma.PlatformSettingsUncheckedCreateInput, "id">,
) {
  return prisma.platformSettings.upsert({
    where: { id: "global" },
    create: { id: "global", ...data },
    update: data,
  });
}

export const PAUSED_MESSAGE =
  "Publishing is paused across Cue right now. Scheduled posts will go out as soon as it resumes.";

export async function isPublishingPaused(): Promise<boolean> {
  return (await getPlatformSettings()).publishingPaused;
}

/** Records a scheduled job's run. Never throws: it's bookkeeping. */
export async function recordHeartbeat(
  name: string,
  ok: boolean,
  summary?: Prisma.InputJsonValue,
  error?: string,
) {
  const data = {
    lastRunAt: new Date(),
    ok,
    summary: summary ?? undefined,
    error: error?.slice(0, 500) ?? null,
  };
  await prisma.cronHeartbeat
    .upsert({ where: { name }, create: { name, ...data }, update: data })
    .catch((e) => console.error("[heartbeat] could not record:", e));
}
