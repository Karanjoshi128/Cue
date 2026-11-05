import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/admin-guard";
import { getCampaignEditor } from "@/lib/mailer/data";
import { previewFooter } from "@/lib/mailer/footer";
import { CampaignEditor } from "@/components/admin/mailer/campaign-editor";

export const metadata = { title: "New campaign" };

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const me = await requirePlatformAdmin();
  const { template: templateId } = await searchParams;
  const [data, footer] = await Promise.all([getCampaignEditor(undefined, templateId?.slice(0, 100)), previewFooter()]);
  return (
    <>
      <Link href="/admin/mailer" prefetch={false} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-3.5" /> All campaigns
      </Link>
      <CampaignEditor
        accounts={data.accounts}
        templates={data.templates}
        tags={data.tags}
        fields={data.fields}
        draft={null}
        template={data.template}
        footer={footer}
        me={me}
      />
    </>
  );
}
