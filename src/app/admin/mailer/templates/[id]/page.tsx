import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTemplateEditor } from "@/lib/mailer/data";
import { previewFooter } from "@/lib/mailer/footer";
import { TemplateEditor } from "@/components/admin/mailer/template-editor";

export const metadata = { title: "Template" };

export default async function MailerTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const [{ template, fields }, footer] = await Promise.all([getTemplateEditor(isNew ? null : id), previewFooter()]);
  if (!isNew && !template) notFound();
  return (
    <>
      <Link href="/admin/mailer/templates" prefetch={false} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-3.5" /> All templates
      </Link>
      <TemplateEditor key={template?.id ?? "new"} template={template} fields={fields} footer={footer} />
    </>
  );
}
