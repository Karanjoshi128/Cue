import Link from "next/link";
import { Plus } from "lucide-react";
import { getTemplatesPage } from "@/lib/mailer/data";
import { Ago, Empty, Panel, truncate } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Templates" };

export default async function MailerTemplatesPage() {
  const templates = await getTemplatesPage();
  return (
    <Panel
      title="Templates"
      description="Emails you reuse. A campaign copies the template, so editing it later never changes what was sent."
      actions={
        <Button size="sm" render={<Link href="/admin/mailer/templates/new" prefetch={false} />}>
          <Plus /> New template
        </Button>
      }
      flush
    >
      {templates.length === 0 ? (
        <Empty>No templates yet. Make one for emails you send often, like a monthly newsletter.</Empty>
      ) : (
        <ul className="divide-y">
          {templates.map((t) => (
            <li key={t.id}>
              <Link
                href={`/admin/mailer/templates/${t.id}`}
                prefetch={false}
                className="hover:bg-accent/40 flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors sm:px-5"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{t.name}</span>
                  <span className="text-muted-foreground block text-sm">{truncate(t.subject, 80)}</span>
                </span>
                <span className="text-muted-foreground text-xs">
                  Edited <Ago date={t.updatedAt} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
