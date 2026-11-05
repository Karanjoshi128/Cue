import { requirePlatformAdmin } from "@/lib/admin-guard";
import { AdminHeader } from "@/components/admin/admin-ui";
import { MailerTabs } from "@/components/admin/mailer/mailer-tabs";

export const metadata = { title: "Mailer" };

export default async function MailerLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  return (
    <>
      <AdminHeader
        eyebrow="Controls"
        title="Mailer"
        description="Marketing and announcement emails to people you add or import. Every email has an unsubscribe link, and bounces and complaints stop future sends automatically."
      />
      <MailerTabs />
      {children}
    </>
  );
}
