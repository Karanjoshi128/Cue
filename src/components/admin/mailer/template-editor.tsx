"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRun } from "@/components/admin/admin-controls";
import { EmailEditor, type EditorFooter } from "@/components/admin/mailer/email-editor";
import { deleteTemplate, saveTemplate } from "@/lib/mailer/actions";

export function TemplateEditor({
  template,
  fields,
  footer,
}: {
  template: { id: string; name: string; subject: string; preheader: string | null; bodyHtml: string } | null;
  fields: string[];
  footer: EditorFooter;
}) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [preheader, setPreheader] = useState(template?.preheader ?? "");
  const [body, setBody] = useState(template?.bodyHtml ?? "<p>Hi {{first_name|there}},</p><p><br></p>");
  const [saving, start] = useTransition();
  const del = useRun();

  function save() {
    start(async () => {
      const r = await saveTemplate({ id: template?.id, name, subject, preheader, bodyHtml: body });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      if (!template) router.replace(`/admin/mailer/templates/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="bg-card grid gap-4 rounded-2xl border p-4 sm:grid-cols-3 sm:p-5">
        <div className="space-y-1.5">
          <Label htmlFor="tp-name">Template name</Label>
          <Input id="tp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Monthly newsletter" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tp-subject">Subject line</Label>
          <Input id="tp-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="What's new at Cue, {{first_name|friend}}" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tp-pre">Preview text</Label>
          <Input id="tp-pre" value={preheader} onChange={(e) => setPreheader(e.target.value)} maxLength={200} placeholder="The grey line after the subject in the inbox" />
        </div>
      </div>
      <div className="bg-card rounded-2xl border p-4 sm:p-5">
        <EmailEditor value={body} onChange={setBody} fields={fields} subject={subject} preheader={preheader} footer={footer} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={saving} onClick={save}>
          {saving && <Loader2 className="animate-spin" />}
          Save template
        </Button>
        {template && (
          <>
            <Button variant="outline" render={<Link href={`/admin/mailer/campaigns/new?template=${template.id}`} prefetch={false} />}>
              <Send /> Use in a campaign
            </Button>
            <Button
              variant="ghost"
              className="ml-auto"
              disabled={del.pending}
              onClick={() => del.run(() => deleteTemplate(template.id), () => router.replace("/admin/mailer/templates"))}
            >
              <Trash2 /> Delete
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
