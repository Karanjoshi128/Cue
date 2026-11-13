import { prisma } from "@/lib/prisma";
import { getMailerSettings } from "@/lib/mailer/settings";

/** The footer the editor's preview shows: the settings, plus the first active account's reply address. */
export async function previewFooter(accountId?: string | null) {
  const [settings, account] = await Promise.all([
    getMailerSettings(),
    prisma.mailerAccount.findFirst({
      where: accountId ? { id: accountId } : { active: true },
      orderBy: { createdAt: "asc" },
      select: { fromEmail: true, replyTo: true },
    }),
  ]);
  return {
    name: settings.footerName,
    address: settings.footerAddress,
    contactEmail: account?.replyTo || account?.fromEmail || "hello@trycue.space",
  };
}
