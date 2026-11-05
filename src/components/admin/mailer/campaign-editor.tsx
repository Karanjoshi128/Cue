"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Loader2, Save, Send, TestTube2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { EmailEditor, type EditorFooter } from "@/components/admin/mailer/email-editor";
import {
  previewAudience,
  saveCampaign,
  scheduleCampaign,
  sendCampaignNow,
  sendCampaignTest,
} from "@/lib/mailer/actions";

interface AccountOption {
  id: string;
  name: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  active: boolean;
  lastVerifiedAt: Date | null;
}
interface TemplateOption {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  bodyHtml: string;
}
interface Draft {
  id: string;
  name: string;
  accountId: string | null;
  subject: string;
  preheader: string | null;
  bodyHtml: string;
  audience: { tags: string[]; excludeTags: string[] };
}

const CONFIRM_TYPING_ABOVE = 500;

function Section({ n, title, hint, children }: { n: string; title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-card rounded-2xl border p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-primary font-mono text-[0.6875rem] font-medium tracking-wider">{n}</span>
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
        {hint && <span className="text-muted-foreground ml-auto text-xs">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function localInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CampaignEditor({
  accounts,
  templates,
  tags,
  fields,
  draft,
  template,
  footer,
  me,
}: {
  accounts: AccountOption[];
  templates: TemplateOption[];
  tags: { tag: string; count: number }[];
  fields: string[];
  draft: Draft | null;
  template: TemplateOption | null;
  footer: EditorFooter;
  me: string;
}) {
  const router = useRouter();
  const firstActive = accounts.find((a) => a.active)?.id ?? "";
  const [id, setId] = useState(draft?.id);
  const [name, setName] = useState(draft?.name ?? template?.name ?? "");
  const [accountId, setAccountId] = useState(draft?.accountId ?? firstActive);
  const [subject, setSubject] = useState(draft?.subject ?? template?.subject ?? "");
  const [preheader, setPreheader] = useState(draft?.preheader ?? template?.preheader ?? "");
  const [body, setBody] = useState(draft?.bodyHtml ?? template?.bodyHtml ?? "<p>Hi {{first_name|there}},</p><p><br></p>");
  const [mode, setMode] = useState<"everyone" | "tags">(draft?.audience.tags.length ? "tags" : "everyone");
  const [include, setInclude] = useState<string[]>(draft?.audience.tags ?? []);
  const [exclude, setExclude] = useState<string[]>(draft?.audience.excludeTags ?? []);
  const [count, setCount] = useState<{ matched: number; suppressed: number; reachable: number } | null>(null);
  const [busy, start] = useTransition();
  const [dialog, setDialog] = useState<null | "test" | "schedule" | "send">(null);
  const [testTo, setTestTo] = useState(me);
  const [testAs, setTestAs] = useState("");
  const [when, setWhen] = useState(() => localInputValue(new Date(Date.now() + 60 * 60_000)));
  const [typed, setTyped] = useState("");

  const audience = { tags: mode === "tags" ? include : [], excludeTags: exclude };
  const audienceKey = JSON.stringify(audience);

  // Live count of who it reaches.
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const r = await previewAudience(JSON.parse(audienceKey));
      if (live && r.ok) setCount({ matched: r.matched, suppressed: r.suppressed, reachable: r.reachable });
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [audienceKey]);

  const account = accounts.find((a) => a.id === accountId);
  // The footer shows where replies go: the chosen account's reply-to or sender.
  const previewFooter = account ? { ...footer, contactEmail: account.replyTo || account.fromEmail } : footer;

  async function save(quiet = false): Promise<string | null> {
    const r = await saveCampaign({ id, name, accountId, subject, preheader, bodyHtml: body, audience });
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }
    if (!id) {
      setId(r.id);
      window.history.replaceState(null, "", `/admin/mailer/campaigns/${r.id}`);
    }
    if (!quiet) toast.success(r.message);
    return r.id;
  }

  function toggle(list: string[], set: (v: string[]) => void, t: string) {
    set(list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);
  }

  return (
    <div className="space-y-5">
      <Section n="01" title="The basics">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cp-name">Campaign name</Label>
            <Input id="cp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="November product update" />
            <p className="text-muted-foreground text-xs">Only you see this.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-account">Send from</Label>
            <select
              id="cp-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="border-input bg-card h-9 w-full rounded-lg border px-2 text-sm"
            >
              {accounts.length === 0 && <option value="">Add a sending account first</option>}
              {accounts.map((a) => (
                <option key={a.id} value={a.id} disabled={!a.active}>
                  {a.name}: {a.fromName} &lt;{a.fromEmail}&gt;{a.active ? "" : " (off)"}
                </option>
              ))}
            </select>
            {account && !account.lastVerifiedAt && (
              <p className="text-standby-ink text-xs">This account hasn&apos;t passed a test yet. Send one from Sending first.</p>
            )}
          </div>
          {templates.length > 0 && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cp-template">Start from a template (optional)</Label>
              <select
                id="cp-template"
                value=""
                onChange={(e) => {
                  const t = templates.find((x) => x.id === e.target.value);
                  if (!t) return;
                  setSubject(t.subject);
                  setPreheader(t.preheader ?? "");
                  setBody(t.bodyHtml);
                  if (!name) setName(t.name);
                  toast.success(`Copied "${t.name}" in. Edit it freely; the template stays as it was.`);
                }}
                className="border-input bg-card h-9 w-full rounded-lg border px-2 text-sm"
              >
                <option value="">Choose a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Section>

      <Section n="02" title="The email">
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cp-subject">Subject line</Label>
            <Input id="cp-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Something new for {{company|your team}}" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-pre">Preview text</Label>
            <Input id="cp-pre" value={preheader} onChange={(e) => setPreheader(e.target.value)} maxLength={200} placeholder="The grey line after the subject in the inbox" />
          </div>
        </div>
        <EmailEditor value={body} onChange={setBody} fields={fields} subject={subject} preheader={preheader} footer={previewFooter} />
      </Section>

      <Section
        n="03"
        title="Who gets it"
        hint={
          count && (
            <span className={cn("inline-flex items-center gap-1.5 text-sm", count.reachable === 0 && "text-destructive")}>
              <Users className="size-3.5" />
              <strong className="text-foreground font-mono">{count.reachable.toLocaleString()}</strong> people
              {count.suppressed > 0 && <span>({count.suppressed} on the do-not-email list, skipped)</span>}
            </span>
          )
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Audience">
            {(["everyone", "tags"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "h-9 rounded-lg border px-3 text-sm",
                  mode === m ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "everyone" ? "All contacts" : "People with these tags"}
              </button>
            ))}
          </div>
          {mode === "tags" && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">Anyone with at least one of the chosen tags.</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.length === 0 && <span className="text-muted-foreground text-sm">No tags yet. Add them on Contacts.</span>}
                {tags.map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    aria-pressed={include.includes(t.tag)}
                    onClick={() => toggle(include, setInclude, t.tag)}
                    className={cn(
                      "h-7 rounded-full border px-3 text-xs",
                      include.includes(t.tag) ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.tag} <span className="font-mono opacity-70">{t.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {tags.length > 0 && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">Leave out anyone with these tags:</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    aria-pressed={exclude.includes(t.tag)}
                    onClick={() => toggle(exclude, setExclude, t.tag)}
                    className={cn(
                      "h-7 rounded-full border px-3 text-xs",
                      exclude.includes(t.tag) ? "border-destructive bg-destructive/10 text-destructive" : "bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {exclude.includes(t.tag) ? "− " : ""}
                    {t.tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      <div className="bg-background/90 supports-backdrop-filter:bg-background/70 sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t px-1 py-3 backdrop-blur">
        <Button variant="outline" disabled={busy} onClick={() => start(async () => void (await save()))}>
          <Save /> Save draft
        </Button>
        <Button variant="outline" disabled={busy || !accountId} onClick={() => setDialog("test")}>
          <TestTube2 /> Send me a test
        </Button>
        <span className="ml-auto" />
        <Button variant="outline" disabled={busy || !accountId} onClick={() => setDialog("schedule")}>
          <CalendarClock /> Schedule
        </Button>
        <Button
          disabled={busy || !accountId || !count || count.reachable === 0}
          onClick={() => {
            setTyped("");
            setDialog("send");
          }}
        >
          <Send /> Send now
        </Button>
      </div>

      {/* Test */}
      <Dialog open={dialog === "test"} onOpenChange={(o) => !busy && setDialog(o ? "test" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send a test</DialogTitle>
            <DialogDescription>The email exactly as it is now, with [Test] in the subject. Nothing is saved or sent to anyone else.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ts-to">Send to</Label>
              <Input id="ts-to" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ts-as">Fill in as (optional)</Label>
              <Input id="ts-as" type="email" value={testAs} onChange={(e) => setTestAs(e.target.value)} placeholder="a contact's email, to see their name and fields" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy || !testTo}
              onClick={() =>
                start(async () => {
                  const r = await sendCampaignTest({ accountId, subject, preheader, bodyHtml: body, to: testTo, asContact: testAs });
                  if (!r.ok) toast.error(r.error);
                  else {
                    toast.success(r.message ?? "Test sent.");
                    setDialog(null);
                  }
                })
              }
            >
              {busy && <Loader2 className="animate-spin" />}
              Send test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule */}
      <Dialog open={dialog === "schedule"} onOpenChange={(o) => !busy && setDialog(o ? "schedule" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule this campaign</DialogTitle>
            <DialogDescription>
              It starts at this time (your computer&apos;s time zone). Who gets it is worked out then, so people you add before
              it starts are included.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="sc-when">Start sending at</Label>
            <Input id="sc-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy || !when}
              onClick={() =>
                start(async () => {
                  const cid = await save(true);
                  if (!cid) return;
                  const r = await scheduleCampaign(cid, new Date(when).toISOString());
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success(r.message ?? "Scheduled.");
                  router.push(`/admin/mailer/campaigns/${cid}`);
                  router.refresh();
                })
              }
            >
              {busy && <Loader2 className="animate-spin" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send now */}
      <Dialog open={dialog === "send"} onOpenChange={(o) => !busy && setDialog(o ? "send" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Send to {count?.reachable.toLocaleString()} {count?.reachable === 1 ? "person" : "people"}?
            </DialogTitle>
            <DialogDescription>
              From {account ? `${account.fromName} <${account.fromEmail}>` : "the chosen account"}. This can&apos;t be undone:
              you can stop it part-way, but emails already sent stay sent.
            </DialogDescription>
          </DialogHeader>
          {count && count.reachable > CONFIRM_TYPING_ABOVE && (
            <div className="space-y-1.5">
              <Label htmlFor="sn-count">Type {count.reachable} to confirm</Label>
              <Input id="sn-count" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy || !count || (count.reachable > CONFIRM_TYPING_ABOVE && typed.trim() !== String(count.reachable))}
              onClick={() =>
                start(async () => {
                  const cid = await save(true);
                  if (!cid || !count) return;
                  const r = await sendCampaignNow(cid, count.reachable);
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success(r.message ?? "Sending.");
                  router.push(`/admin/mailer/campaigns/${cid}`);
                  router.refresh();
                })
              }
            >
              {busy && <Loader2 className="animate-spin" />}
              Send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
