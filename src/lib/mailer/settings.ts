import { prisma } from "@/lib/prisma";

export interface MailerSettingsView {
  paused: boolean;
  footerName: string;
  footerAddress: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
}

export async function getMailerSettings(): Promise<MailerSettingsView> {
  const row = await prisma.mailerSettings.findUnique({ where: { id: "global" } });
  return {
    paused: row?.paused ?? false,
    footerName: row?.footerName ?? "Cue",
    footerAddress: row?.footerAddress ?? null,
    updatedBy: row?.updatedBy ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function updateMailerSettings(data: {
  paused?: boolean;
  footerName?: string;
  footerAddress?: string | null;
  updatedBy: string;
}) {
  await prisma.mailerSettings.upsert({
    where: { id: "global" },
    create: { id: "global", ...data },
    update: data,
  });
}
