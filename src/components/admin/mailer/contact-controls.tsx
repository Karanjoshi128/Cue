"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2, Pencil, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRun } from "@/components/admin/admin-controls";
import { TagInput } from "@/components/admin/mailer/tag-input";
import { deleteContacts, importContacts, updateContact } from "@/lib/mailer/actions";
import { guessColumns, hasHeaderRow, looksLikeEmail, parseCsv, parsePasted } from "@/lib/mailer/csv";

const CHUNK = 1000;
const MAX_ROWS = 10_000;

type Row = { email: string; name?: string; company?: string; fields?: Record<string, string> };

/** Sends rows to the server in chunks (a server action's body is size-limited) and adds up the results. */
async function importInChunks(rows: Row[], tags: string[], tagExisting: boolean, source: "paste" | "import", onProgress?: (done: number) => void) {
  const total = { added: 0, tagged: 0, existing: 0, invalid: 0 };
  for (let i = 0; i < rows.length; i += CHUNK) {
    const r = await importContacts({ rows: rows.slice(i, i + CHUNK), tags, tagExisting, source });
    if (!r.ok) throw new Error(r.error);
    total.added += r.added;
    total.tagged += r.tagged;
    total.existing += r.existing;
    total.invalid += r.invalid;
    onProgress?.(Math.min(rows.length, i + CHUNK));
  }
  return total;
}

function summary(t: { added: number; tagged: number; existing: number; invalid: number }) {
  const bits = [`${t.added} added`];
  if (t.existing) bits.push(`${t.existing} already on the list${t.tagged ? ` (${t.tagged} got the new tags)` : ""}`);
  if (t.invalid) bits.push(`${t.invalid} skipped as invalid`);
  return bits.join(", ") + ".";
}

/** Paste a list: one person per line. */
export function AddContactsDialog({ tagSuggestions }: { tagSuggestions: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const parsed = useMemo(() => parsePasted(text), [text]);
  const valid = parsed.filter((p) => looksLikeEmail(p.email));

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UserPlus /> Add people
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add people</DialogTitle>
            <DialogDescription>
              One per line: <code>email</code>, <code>Name &lt;email&gt;</code> or <code>Name, email</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ac-text">People</Label>
            <Textarea id="ac-text" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={"priya@example.com\nAna Ruiz <ana@example.com>"} />
            {text && (
              <p className="text-muted-foreground text-xs">
                {valid.length} valid{parsed.length - valid.length ? `, ${parsed.length - valid.length} not an email address (skipped)` : ""}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-tags">Tags</Label>
            <TagInput id="ac-tags" value={tags} onChange={setTags} suggestions={tagSuggestions} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending || valid.length === 0}
              onClick={() =>
                start(async () => {
                  try {
                    const t = await importInChunks(valid, tags, true, "paste");
                    toast.success(summary(t));
                    setOpen(false);
                    setText("");
                    setTags([]);
                    router.refresh();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Couldn't add them.");
                  }
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              Add {valid.length || ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Import a CSV: pick the file, check the columns, tag, import. */
export function ImportCsvDialog({ tagSuggestions }: { tagSuggestions: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [grid, setGrid] = useState<string[][]>([]);
  const [header, setHeader] = useState(true);
  const [cols, setCols] = useState<{ email: number; name: number | null; company: number | null }>({ email: 0, name: null, company: null });
  const [tags, setTags] = useState<string[]>([]);
  const [tagExisting, setTagExisting] = useState(true);
  const [progress, setProgress] = useState(0);
  const [pending, start] = useTransition();

  const head = useMemo(() => (header ? grid[0] ?? [] : (grid[0] ?? []).map((_, i) => `Column ${i + 1}`)), [grid, header]);
  const body = useMemo(() => (header ? grid.slice(1) : grid), [grid, header]);
  const rows: Row[] = useMemo(
    () =>
      body.slice(0, MAX_ROWS).map((r) => {
        const fields: Record<string, string> = {};
        head.forEach((h, i) => {
          if (i === cols.email || i === cols.name || i === cols.company) return;
          if (r[i]) fields[h || `column_${i + 1}`] = r[i];
        });
        return {
          email: r[cols.email] ?? "",
          name: cols.name !== null ? r[cols.name] : undefined,
          company: cols.company !== null ? r[cols.company] : undefined,
          fields: Object.keys(fields).length ? fields : undefined,
        };
      }),
    [body, head, cols],
  );
  const valid = rows.filter((r) => looksLikeEmail(r.email));
  const dupes = valid.length - new Set(valid.map((r) => r.email.toLowerCase())).size;

  function reset() {
    setFileName("");
    setGrid([]);
    setTags([]);
    setProgress(0);
  }

  async function onFile(file: File) {
    if (!/\.(csv|txt|tsv)$/i.test(file.name)) {
      toast.error("Save the sheet as CSV first (File → Download → CSV, or Save As → CSV).");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("That file is over 15 MB. Split it into smaller files.");
      return;
    }
    const g = parseCsv(await file.text());
    if (g.length === 0) {
      toast.error("That file is empty.");
      return;
    }
    const h = hasHeaderRow(g);
    setFileName(file.name);
    setGrid(g);
    setHeader(h);
    setCols(guessColumns(h ? g[0] : g[0].map((_, i) => `Column ${i + 1}`), (h ? g.slice(1) : g).slice(0, 25)));
  }

  const colOptions = head.map((h, i) => ({ value: i, label: h || `Column ${i + 1}` }));
  const select = (val: number | null, set: (v: number | null) => void, allowNone: boolean, id: string) => (
    <select
      id={id}
      value={val === null ? "" : String(val)}
      onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))}
      className="border-input bg-card h-9 w-full rounded-lg border px-2 text-sm"
    >
      {allowNone && <option value="">(none)</option>}
      {colOptions.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FileUp /> Import CSV
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (pending) return;
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import contacts from a CSV</DialogTitle>
            <DialogDescription>
              From Excel or Google Sheets, save or download the sheet as CSV. Up to {MAX_ROWS.toLocaleString()} rows at a
              time. Extra columns become merge fields, like <code>{"{{city}}"}</code>.
            </DialogDescription>
          </DialogHeader>
          {grid.length === 0 ? (
            <label className="hover:border-foreground/30 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
              <FileUp className="text-muted-foreground size-6" />
              <span className="text-sm font-medium">Choose a CSV file</span>
              <span className="text-muted-foreground text-xs">It&apos;s read here in your browser; only the contacts are sent.</span>
              <input type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
          ) : (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              <p className="text-sm">
                <span className="font-medium">{fileName}</span>{" "}
                <span className="text-muted-foreground">
                  · {body.length.toLocaleString()} rows{body.length > MAX_ROWS ? ` (only the first ${MAX_ROWS.toLocaleString()} are imported)` : ""}
                </span>
              </p>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={header} onCheckedChange={(v) => setHeader(!!v)} /> The first row is column names
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="im-email">Email column</Label>
                  {select(cols.email, (v) => setCols((c) => ({ ...c, email: v ?? 0 })), false, "im-email")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="im-name">Name column</Label>
                  {select(cols.name, (v) => setCols((c) => ({ ...c, name: v })), true, "im-name")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="im-company">Company column</Label>
                  {select(cols.company, (v) => setCols((c) => ({ ...c, company: v })), true, "im-company")}
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Company</th>
                      <th className="px-3 py-2 font-medium">Other fields</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <td className={looksLikeEmail(r.email) ? "px-3 py-2" : "text-destructive px-3 py-2"}>{r.email || "(empty)"}</td>
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2">{r.company}</td>
                        <td className="text-muted-foreground px-3 py-2">
                          {r.fields ? Object.entries(r.fields).map(([k, v]) => `${k}: ${v}`).join(" · ").slice(0, 80) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground text-xs">
                {valid.length.toLocaleString()} with a valid email
                {rows.length - valid.length ? `, ${(rows.length - valid.length).toLocaleString()} without one (skipped)` : ""}
                {dupes ? `, ${dupes} repeated in the file (added once)` : ""}.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="im-tags">Tag everyone in this file</Label>
                <TagInput id="im-tags" value={tags} onChange={setTags} suggestions={tagSuggestions} placeholder="e.g. webinar-nov" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={tagExisting} onCheckedChange={(v) => setTagExisting(!!v)} /> Also add these tags to people
                already in your contacts
              </label>
              {pending && (
                <p className="text-sm" role="status">
                  Importing… {progress.toLocaleString()} of {valid.length.toLocaleString()}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => (grid.length ? reset() : setOpen(false))} disabled={pending}>
              {grid.length ? "Choose another file" : "Cancel"}
            </Button>
            {grid.length > 0 && (
              <Button
                disabled={pending || valid.length === 0}
                onClick={() =>
                  start(async () => {
                    try {
                      const t = await importInChunks(valid, tags, tagExisting, "import", setProgress);
                      toast.success(summary(t));
                      setOpen(false);
                      reset();
                      router.refresh();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "The import stopped.");
                      router.refresh();
                    }
                  })
                }
              >
                {pending && <Loader2 className="animate-spin" />}
                Import {valid.length.toLocaleString()}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditContactDialog({
  contact,
  tagSuggestions,
}: {
  contact: { id: string; email: string; name: string | null; company: string | null; tags: string[] };
  tagSuggestions: string[];
}) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(contact.name ?? "");
  const [company, setCompany] = useState(contact.company ?? "");
  const [tags, setTags] = useState(contact.tags);
  return (
    <>
      <Button size="sm" variant="ghost" aria-label={`Edit ${contact.email}`} onClick={() => setOpen(true)}>
        <Pencil />
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{contact.email}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ec-name">Name</Label>
              <Input id="ec-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-company">Company</Label>
              <Input id="ec-company" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ec-tags">Tags</Label>
              <TagInput id="ec-tags" value={tags} onChange={setTags} suggestions={tagSuggestions} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={() => run(() => updateContact({ id: contact.id, name, company, tags }), () => setOpen(false))}>
              {pending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Row checkboxes and a delete bar, for the contacts on this page. */
export function ContactSelection({ ids, children }: { ids: string[]; children: (api: { checked: (id: string) => boolean; toggle: (id: string) => void; all: boolean; toggleAll: () => void }) => React.ReactNode }) {
  const { pending, run } = useRun();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const all = ids.length > 0 && ids.every((i) => sel.has(i));
  const api = {
    checked: (id: string) => sel.has(id),
    toggle: (id: string) =>
      setSel((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    all,
    toggleAll: () => setSel(all ? new Set() : new Set(ids)),
  };
  return (
    <>
      {sel.size > 0 && (
        <div className="bg-muted/50 flex items-center justify-between gap-3 border-b px-4 py-2 text-sm sm:px-5">
          <span>{sel.size} selected</span>
          <Button size="sm" variant="destructive" onClick={() => setConfirm(true)}>
            <Trash2 /> Delete
          </Button>
        </div>
      )}
      {children(api)}
      <Dialog open={confirm} onOpenChange={(o) => !pending && setConfirm(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {sel.size} contact{sel.size === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              They&apos;re removed from your list. Past campaign logs keep their address. To make sure someone is never
              emailed again, add them to the do-not-email list instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => deleteContacts([...sel]),
                  () => {
                    setConfirm(false);
                    setSel(new Set());
                  },
                )
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export interface ContactRowView {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  tags: string[];
  fieldCount: number;
  source: string;
  suppressed: string | null;
  createdAt: string;
}

const SUPPRESSED_LABEL: Record<string, string> = {
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
  complained: "Marked as spam",
  manual: "Do not email",
};

/** The contacts on this page, with checkboxes, edit and delete. */
export function ContactsTable({ contacts, tagSuggestions }: { contacts: ContactRowView[]; tagSuggestions: string[] }) {
  return (
    <ContactSelection ids={contacts.map((c) => c.id)}>
      {({ checked, toggle, all, toggleAll }) => (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-muted-foreground border-b text-xs">
              <tr>
                <th className="w-10 px-4 py-2.5 sm:px-5">
                  <input type="checkbox" aria-label="Select all on this page" checked={all} onChange={toggleAll} className="accent-primary size-4 align-middle" />
                </th>
                <th className="px-3 py-2.5 font-medium">Contact</th>
                <th className="px-3 py-2.5 font-medium">Tags</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="px-4 py-3 sm:px-5">
                    <input type="checkbox" aria-label={`Select ${c.email}`} checked={checked(c.id)} onChange={() => toggle(c.id)} className="accent-primary size-4 align-middle" />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium break-all">{c.email}</div>
                    <div className="text-muted-foreground text-xs">
                      {[c.name, c.company].filter(Boolean).join(" · ") || "No name"}
                      {c.fieldCount ? ` · ${c.fieldCount} extra field${c.fieldCount === 1 ? "" : "s"}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span key={t} className="bg-muted rounded-md px-1.5 py-0.5 text-xs">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs whitespace-nowrap">
                    {c.suppressed ? (
                      <span className="text-destructive">{SUPPRESSED_LABEL[c.suppressed] ?? c.suppressed}</span>
                    ) : (
                      <span className="text-live-ink">Can be emailed</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <EditContactDialog contact={c} tagSuggestions={tagSuggestions} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ContactSelection>
  );
}
