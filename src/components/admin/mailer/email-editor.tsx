"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bold,
  Braces,
  Code2,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Monitor,
  MousePointerClick,
  RemoveFormatting,
  Smartphone,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { BUILT_IN_FIELDS, SAMPLE_VARS, escapeHtml } from "@/lib/mailer/merge";
import { renderEmail } from "@/lib/mailer/render";
import { presignMailerImage } from "@/lib/mailer/actions";

/*
 * The email body editor. "Editor" is a simple rich-text box (the browser's
 * contentEditable); "HTML" edits the same HTML directly. Both write one HTML
 * string. The preview renders exactly what the sender sends, in a sandboxed
 * frame, with sample values for merge fields.
 */

export interface EditorFooter {
  name: string;
  address: string | null;
  contactEmail: string;
}

const FIELD_LABELS: Record<string, string> = {
  first_name: "First name",
  name: "Full name",
  email: "Email",
  company: "Company",
};

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()} // keep the editor's selection
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground hover:bg-accent flex size-8 items-center justify-center rounded-md"
    >
      {children}
    </button>
  );
}

export function EmailEditor({
  value,
  onChange,
  fields,
  subject,
  preheader,
  footer,
}: {
  value: string;
  onChange: (html: string) => void;
  fields: string[];
  subject: string;
  preheader: string;
  footer: EditorFooter;
}) {
  const [mode, setMode] = useState<"rich" | "html">("rich");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const editor = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null);
  const [linkDialog, setLinkDialog] = useState<null | "link" | "button">(null);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkText, setLinkText] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Load the HTML into the rich editor when it opens, or when the value is
  // replaced from outside (e.g. starting from a template).
  useEffect(() => {
    const el = editor.current;
    if (mode === "rich" && el && el.innerHTML !== value) el.innerHTML = value;
  }, [mode, value]);

  const sync = () => editor.current && onChange(editor.current.innerHTML);

  function keepSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && editor.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    const el = editor.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (saved.current && sel) {
      sel.removeAllRanges();
      sel.addRange(saved.current);
    }
  }
  function exec(cmd: string, arg?: string) {
    restoreSelection();
    document.execCommand(cmd, false, arg);
    sync();
  }
  function insertHtml(html: string) {
    if (mode === "html") {
      onChange(value + html);
      return;
    }
    exec("insertHTML", html);
  }

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const r = await presignMailerImage({ fileName: file.name, contentType: file.type, size: file.size });
      if (!r.ok) throw new Error(r.error);
      const put = await fetch(r.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("The upload didn't finish. Try again.");
      insertHtml(`<p><img src="${escapeHtml(r.url)}" alt="" width="600"></p>`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't upload that image.");
    } finally {
      setUploading(false);
    }
  }

  const allFields = useMemo(() => [...BUILT_IN_FIELDS, ...fields.filter((f) => !(BUILT_IN_FIELDS as readonly string[]).includes(f))], [fields]);

  const preview = useMemo(
    () =>
      renderEmail({
        subject,
        preheader,
        bodyHtml: value || "<p style='color:#999'>Your email appears here.</p>",
        vars: { ...SAMPLE_VARS, ...Object.fromEntries(fields.map((f) => [f, `[${f}]`])) },
        footer,
        unsubscribeUrl: "#unsubscribe",
      }),
    [subject, preheader, value, fields, footer],
  );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="bg-muted inline-flex rounded-lg p-0.5 text-sm" role="tablist" aria-label="Editor mode">
            {(["rich", "html"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2.5", mode === m ? "bg-card shadow-sm" : "text-muted-foreground")}
              >
                {m === "rich" ? <Type className="size-3.5" /> : <Code2 className="size-3.5" />}
                {m === "rich" ? "Editor" : "HTML"}
              </button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" onMouseDown={keepSelection} />}>
              <Braces /> Insert field
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {allFields.map((f) => (
                <DropdownMenuItem
                  key={f}
                  onClick={() => insertHtml(f === "first_name" ? "{{first_name|there}}" : `{{${f}}}`)}
                >
                  <span className="flex flex-col">
                    <span>{FIELD_LABELS[f] ?? f}</span>
                    <code className="text-muted-foreground text-[0.6875rem]">{f === "first_name" ? "{{first_name|there}}" : `{{${f}}}`}</code>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {mode === "rich" ? (
          <div className="overflow-hidden rounded-xl border">
            <div className="bg-muted/40 flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
              <ToolButton label="Bold" onClick={() => exec("bold")}>
                <Bold className="size-4" />
              </ToolButton>
              <ToolButton label="Italic" onClick={() => exec("italic")}>
                <Italic className="size-4" />
              </ToolButton>
              <ToolButton label="Heading" onClick={() => exec("formatBlock", "<h2>")}>
                <Heading2 className="size-4" />
              </ToolButton>
              <ToolButton label="Paragraph" onClick={() => exec("formatBlock", "<p>")}>
                <Type className="size-4" />
              </ToolButton>
              <ToolButton label="Bulleted list" onClick={() => exec("insertUnorderedList")}>
                <List className="size-4" />
              </ToolButton>
              <ToolButton label="Numbered list" onClick={() => exec("insertOrderedList")}>
                <ListOrdered className="size-4" />
              </ToolButton>
              <ToolButton
                label="Link"
                onClick={() => {
                  keepSelection();
                  setLinkText(window.getSelection()?.toString() ?? "");
                  setLinkUrl("https://");
                  setLinkDialog("link");
                }}
              >
                <Link2 className="size-4" />
              </ToolButton>
              <ToolButton
                label="Button"
                onClick={() => {
                  keepSelection();
                  setLinkText("");
                  setLinkUrl("https://");
                  setLinkDialog("button");
                }}
              >
                <MousePointerClick className="size-4" />
              </ToolButton>
              <ToolButton
                label="Image"
                onClick={() => {
                  keepSelection();
                  fileInput.current?.click();
                }}
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              </ToolButton>
              <ToolButton label="Divider" onClick={() => insertHtml('<hr style="border:none;border-top:1px solid #e6e3da;margin:24px 0">')}>
                <Minus className="size-4" />
              </ToolButton>
              <ToolButton label="Clear formatting" onClick={() => exec("removeFormat")}>
                <RemoveFormatting className="size-4" />
              </ToolButton>
            </div>
            <div
              ref={editor}
              role="textbox"
              aria-multiline="true"
              aria-label="Email body"
              contentEditable
              suppressContentEditableWarning
              onInput={sync}
              onBlur={() => {
                keepSelection();
                sync();
              }}
              onKeyUp={keepSelection}
              onMouseUp={keepSelection}
              onPaste={(e) => {
                // Paste as plain text: formatting from Word or web pages breaks in email.
                e.preventDefault();
                document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
                sync();
              }}
              className="prose-email bg-card min-h-80 px-5 py-4 text-[0.9375rem] leading-relaxed outline-none [&_a]:text-primary [&_a]:underline [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_hr]:my-5 [&_img]:max-w-full [&_img]:rounded [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:list-disc"
            />
          </div>
        ) : (
          <textarea
            aria-label="Email HTML"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            className="border-input bg-card focus-visible:border-ring min-h-[22rem] w-full rounded-xl border p-4 font-mono text-[0.8125rem] leading-relaxed outline-none"
          />
        )}
        <p className="text-muted-foreground text-xs">
          Fields like <code>{"{{first_name|there}}"}</code> are filled in for each person; the part after | is used when
          they have no value. The footer and unsubscribe link are added for you.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void uploadImage(f);
          }}
        />
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="label-caps">Preview</span>
          <div className="bg-muted inline-flex rounded-lg p-0.5" role="tablist" aria-label="Preview size">
            {(["desktop", "mobile"] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={device === d}
                aria-label={d === "desktop" ? "Desktop" : "Phone"}
                onClick={() => setDevice(d)}
                className={cn("flex h-7 items-center rounded-md px-2", device === d ? "bg-card shadow-sm" : "text-muted-foreground")}
              >
                {d === "desktop" ? <Monitor className="size-3.5" /> : <Smartphone className="size-3.5" />}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-muted/40 overflow-hidden rounded-xl border">
          <div className="bg-card space-y-0.5 border-b px-4 py-3 text-sm">
            <div className="truncate">
              <span className="text-muted-foreground">Subject: </span>
              <span className="font-medium">{preview.subject || "(no subject)"}</span>
            </div>
            {preheader && <div className="text-muted-foreground truncate text-xs">{preheader}</div>}
          </div>
          <div className="flex justify-center p-3">
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={preview.html}
              className={cn("h-[34rem] rounded-lg border bg-white transition-[width]", device === "desktop" ? "w-full" : "w-[375px]")}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Sample values: {SAMPLE_VARS.name}, {SAMPLE_VARS.company}. Extra fields show as [field].
        </p>
      </div>

      <Dialog open={linkDialog !== null} onOpenChange={(o) => !o && setLinkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{linkDialog === "button" ? "Add a button" : "Add a link"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ln-text">Text</Label>
              <Input id="ln-text" value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder={linkDialog === "button" ? "Start free" : "our new guide"} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ln-url">Link</Label>
              <Input id="ln-url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://trycue.space" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={!/^(https?:\/\/|mailto:)\S+/.test(linkUrl) || !linkText.trim()}
              onClick={() => {
                const href = escapeHtml(linkUrl.trim());
                const text = escapeHtml(linkText.trim());
                const html =
                  linkDialog === "button"
                    ? `<p><a href="${href}" style="display:inline-block;background:#1f5fd6;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">${text}</a></p>`
                    : `<a href="${href}">${text}</a>`;
                setLinkDialog(null);
                // Let the dialog close and focus return before inserting.
                setTimeout(() => insertHtml(html), 0);
              }}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
