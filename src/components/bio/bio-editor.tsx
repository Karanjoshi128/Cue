"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { deleteBioPage, refreshBioGrid, saveBioPage } from "@/lib/bio/actions";
import { unwrap } from "@/lib/action-result";
import {
  BIO_LIMITS,
  bioPath,
  isWebUrl,
  newLinkId,
  slugProblem,
  withScheme,
  type BioLink,
} from "@/lib/bio/config";
import type { BioEditorData, BioViewData } from "@/lib/bio/data";
import { PageHeader } from "@/components/page-header";
import { ClientDot } from "@/components/post-bits";
import { BioView } from "@/components/bio/bio-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Editor = NonNullable<BioEditorData["editor"]>;

interface Draft {
  slug: string;
  title: string;
  bio: string;
  accountId: string | null;
  links: BioLink[];
  postLinks: Record<string, string>;
  published: boolean;
}

const NO_GRID = "none";

/** The draft as the server will store it, so "unsaved changes" ignores trimming. */
function normalized(d: Draft): string {
  return JSON.stringify({
    ...d,
    slug: d.slug.trim().toLowerCase(),
    title: d.title.trim(),
    bio: d.bio.trim(),
    links: d.links.map((l) => ({ ...l, label: l.label.trim(), url: withScheme(l.url) })),
    postLinks: Object.fromEntries(
      Object.entries(d.postLinks)
        .filter(([, url]) => url.trim())
        .map(([id, url]) => [id, withScheme(url)]),
    ),
  });
}

function badUrl(url: string): boolean {
  return !!url.trim() && !isWebUrl(withScheme(url));
}

export function BioEditorView({ data }: { data: BioEditorData }) {
  const live = data.clients.filter((c) => c.published).length;
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow={
          <>
            Link in bio
            <span className="text-border">/</span>
            <span className={live ? "text-live-ink" : undefined}>{live} live</span>
          </>
        }
        title={
          <>
            One link, <em>every post.</em>
          </>
        }
        description="A page for each client to put in their Instagram bio: their links and latest posts, with a count of every tap."
      />

      {!data.featureOn && (
        <div className="bg-fault/8 text-fault-ink border-fault/20 rounded-2xl border p-4 text-sm">
          Link-in-bio pages are switched off for this workspace, and published pages show
          &ldquo;not found&rdquo;. Cue support can turn them back on.
        </div>
      )}

      {data.clients.length > 1 && <ClientPicker clients={data.clients} current={data.editor?.client.id} />}

      {data.editor ? (
        <PageEditor
          key={data.editor.client.id}
          editor={data.editor}
          siteUrl={data.siteUrl}
          featureOn={data.featureOn}
        />
      ) : (
        <div className="text-muted-foreground rounded-2xl border border-dashed px-5 py-10 text-center text-sm">
          Add a client in{" "}
          <Link href="/clients" className="text-primary underline underline-offset-2">
            Clients
          </Link>{" "}
          to give them a page.
        </div>
      )}
    </div>
  );
}

function ClientPicker({
  clients,
  current,
}: {
  clients: BioEditorData["clients"];
  current?: string;
}) {
  return (
    <nav aria-label="Client" className="flex flex-wrap gap-2">
      {clients.map((c) => {
        const active = c.id === current;
        return (
          <Link
            key={c.id}
            href={`/bio?client=${c.id}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-2 rounded-xl border px-3 text-sm transition-colors",
              active ? "bg-card text-foreground shadow-hairline border-transparent" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ClientDot color={c.color} className="size-2" />
            <span className="max-w-40 truncate font-medium">{c.name}</span>
            <span
              className={cn(
                "font-mono text-[0.625rem] tracking-wide uppercase",
                c.published ? "text-live-ink" : "text-muted-foreground",
              )}
            >
              {c.slug ? (c.published ? "Live" : "Draft") : "No page"}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function Counter({ value, max }: { value: number; max: number }) {
  return (
    <span className={cn("font-mono text-[0.6875rem] tabular-nums", value > max ? "text-fault-ink" : "text-muted-foreground")}>
      {value}/{max}
    </span>
  );
}

function Section({ title, hint, children, action }: { title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t px-5 py-5 first:border-t-0 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
          {hint && <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function taps(n: number | undefined): string {
  return `${n ?? 0} tap${n === 1 ? "" : "s"}`;
}

function PageEditor({
  editor,
  siteUrl,
  featureOn,
}: {
  editor: Editor;
  siteUrl: string;
  featureOn: boolean;
}) {
  const router = useRouter();
  const saved = editor.page;
  const stats = editor.stats;
  const initial = useMemo<Draft>(
    () =>
      saved
        ? {
            slug: saved.slug,
            title: saved.title,
            bio: saved.bio ?? "",
            accountId: saved.accountId,
            links: saved.links,
            postLinks: saved.postLinks,
            published: saved.published,
          }
        : {
            slug: editor.suggestedSlug,
            title: editor.client.name,
            bio: "",
            accountId: editor.accounts[0]?.id ?? null,
            links: [],
            postLinks: {},
            published: true,
          },
    [saved, editor.suggestedSlug, editor.client.name, editor.accounts],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState<"save" | "refresh" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, startTransition] = useTransition();

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setLink = (id: string, patch: Partial<BioLink>) =>
    update({ links: draft.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const moveLink = (i: number, by: -1 | 1) => {
    const links = [...draft.links];
    [links[i], links[i + by]] = [links[i + by], links[i]];
    update({ links });
  };

  const dirty = !saved || normalized(draft) !== normalized(initial);
  const slugIssue = slugProblem(draft.slug.trim().toLowerCase());
  const problem =
    (slugIssue && `Address: ${slugIssue}`) ||
    (!draft.title.trim() && "Give the page a title.") ||
    (draft.links.some((l) => !l.label.trim()) && "Every link needs a label.") ||
    ((draft.links.some((l) => !l.url.trim() || badUrl(l.url)) ||
      Object.values(draft.postLinks).some(badUrl)) &&
      "Fix the links marked in red.") ||
    null;

  // The grid shown is the saved account's; a newly picked one is read on save.
  const sameAccount = !!saved && saved.accountId === draft.accountId;
  const grid = draft.accountId && sameAccount ? saved.grid : [];
  const address = `${siteUrl.replace(/^https?:\/\//, "")}${bioPath(saved?.slug ?? draft.slug)}`;
  const fullUrl = `${siteUrl}${bioPath(saved?.slug ?? draft.slug)}`;

  const preview: BioViewData = {
    name: editor.client.name,
    title: draft.title.trim() || editor.client.name,
    bio: draft.bio.trim() || null,
    color: editor.client.color,
    avatarUrl: sameAccount ? saved.avatarUrl : null,
    links: draft.links
      .filter((l) => l.label.trim())
      .map((l) => ({ id: l.id, label: l.label, href: isWebUrl(withScheme(l.url)) ? withScheme(l.url) : "#" })),
    tiles: grid.map((t) => ({
      id: t.id,
      image: t.image,
      caption: t.caption,
      video: t.video,
      href: draft.postLinks[t.id]?.trim() ? withScheme(draft.postLinks[t.id]) : t.permalink,
    })),
  };

  const run = (kind: "save" | "refresh" | "delete", fn: () => Promise<void>) => {
    setBusy(kind);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusy(null);
      }
    });
  };

  const save = () =>
    run("save", async () => {
      const r = unwrap(
        await saveBioPage(editor.client.id, {
          slug: draft.slug,
          title: draft.title,
          bio: draft.bio,
          accountId: draft.accountId,
          links: draft.links,
          postLinks: draft.postLinks,
          published: draft.published,
        }),
      );
      if (r.warning) toast.warning(r.warning);
      else toast.success(saved ? "Saved" : draft.published ? "Your page is live" : "Saved as a draft");
      router.refresh();
    });

  const refresh = () =>
    run("refresh", async () => {
      unwrap(await refreshBioGrid(editor.client.id));
      toast.success("Posts updated");
      router.refresh();
    });

  const remove = () =>
    run("delete", async () => {
      unwrap(await deleteBioPage(editor.client.id));
      setConfirmDelete(false);
      toast.success("Page deleted");
      router.refresh();
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the address instead.");
    }
  };

  const accountItems: Record<string, string> = {
    [NO_GRID]: "Don't show posts",
    ...Object.fromEntries(editor.accounts.map((a) => [a.id, a.displayName])),
  };

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="bg-card overflow-hidden rounded-2xl border">
        <Section title="Page" hint="What visitors see at the top.">
          <div className="space-y-1.5">
            <label htmlFor="bio-slug" className="text-sm font-medium">
              Address
            </label>
            <div className="focus-within:ring-ring/50 flex h-9 items-center overflow-hidden rounded-lg border focus-within:ring-3">
              <span className="text-muted-foreground bg-muted/60 flex h-full items-center border-r px-3 font-mono text-xs whitespace-nowrap">
                {siteUrl.replace(/^https?:\/\//, "")}/b/
              </span>
              <input
                id="bio-slug"
                value={draft.slug}
                maxLength={BIO_LIMITS.slugMax}
                spellCheck={false}
                autoCapitalize="none"
                onChange={(e) => update({ slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-sm outline-none"
                aria-invalid={!!slugIssue}
              />
            </div>
            {slugIssue ? (
              <p className="text-fault-ink text-xs">{slugIssue}</p>
            ) : saved && draft.slug.trim().toLowerCase() !== saved.slug ? (
              <p className="text-standby-ink text-xs">The old address stops working once you save.</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="bio-title" className="text-sm font-medium">
                Title
              </label>
              <Counter value={draft.title.length} max={BIO_LIMITS.title} />
            </div>
            <Input id="bio-title" value={draft.title} maxLength={BIO_LIMITS.title} onChange={(e) => update({ title: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="bio-bio" className="text-sm font-medium">
                Bio <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Counter value={draft.bio.length} max={BIO_LIMITS.bio} />
            </div>
            <Textarea
              id="bio-bio"
              rows={2}
              value={draft.bio}
              maxLength={BIO_LIMITS.bio}
              placeholder="What they do, where, and when they're open."
              onChange={(e) => update({ bio: e.target.value })}
            />
          </div>
        </Section>

        <Section
          title="Links"
          hint="Buttons at the top of the page, in this order."
          action={
            <Button
              size="sm"
              variant="outline"
              disabled={draft.links.length >= BIO_LIMITS.links}
              onClick={() => update({ links: [...draft.links, { id: newLinkId(), label: "", url: "" }] })}
            >
              <Plus /> Add link
            </Button>
          }
        >
          {draft.links.length ? (
            <ul className="space-y-2.5">
              {draft.links.map((l, i) => {
                const urlBad = badUrl(l.url);
                return (
                  <li key={l.id} className="bg-muted/35 rounded-xl border p-3">
                    <div className="flex items-start gap-2">
                      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                        <Input
                          value={l.label}
                          maxLength={BIO_LIMITS.label}
                          placeholder="Label, like Book a table"
                          aria-label={`Link ${i + 1} label`}
                          onChange={(e) => setLink(l.id, { label: e.target.value })}
                          className="bg-card"
                        />
                        <Input
                          value={l.url}
                          maxLength={BIO_LIMITS.url}
                          inputMode="url"
                          spellCheck={false}
                          placeholder="https://"
                          aria-label={`Link ${i + 1} address`}
                          aria-invalid={urlBad}
                          onChange={(e) => setLink(l.id, { url: e.target.value })}
                          className="bg-card"
                        />
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => moveLink(i, -1)}>
                          <ArrowUp />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Move down"
                          disabled={i === draft.links.length - 1}
                          onClick={() => moveLink(i, 1)}
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Remove link"
                          onClick={() => update({ links: draft.links.filter((x) => x.id !== l.id) })}
                        >
                          <X />
                        </Button>
                      </div>
                    </div>
                    {(urlBad || stats?.byTarget[l.id] !== undefined) && (
                      <p className={cn("mt-2 text-xs", urlBad ? "text-fault-ink" : "text-muted-foreground")}>
                        {urlBad ? "Use a web address, like https://example.com." : `${taps(stats?.byTarget[l.id])} in 30 days`}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-6 text-center text-sm">
              No links yet. Add the menu, a booking page or this week&apos;s offer.
            </p>
          )}
        </Section>

        <Section
          title="Latest posts"
          hint={`A grid of the account's ${BIO_LIMITS.grid} most recent posts. Each opens the post, or an address you set.`}
          action={
            sameAccount && draft.accountId ? (
              <Button size="sm" variant="outline" onClick={refresh} disabled={busy !== null || !featureOn}>
                <RefreshCw className={cn(busy === "refresh" && "animate-spin")} /> Refresh
              </Button>
            ) : null
          }
        >
          {editor.accounts.length ? (
            <Select
              value={draft.accountId ?? NO_GRID}
              items={accountItems}
              onValueChange={(v) => update({ accountId: v === NO_GRID ? null : (v as string) })}
            >
              <SelectTrigger className="w-full sm:w-80" aria-label="Posts from">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(accountItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-muted-foreground text-sm">
              Connect {editor.client.name}&apos;s Instagram in{" "}
              <Link href="/clients" className="text-primary underline underline-offset-2">
                Clients
              </Link>{" "}
              to show their posts.
            </p>
          )}

          {draft.accountId && !sameAccount && (
            <p className="text-muted-foreground text-sm">The posts are read from Instagram when you save.</p>
          )}
          {draft.accountId && sameAccount && (
            <>
              <p className="text-muted-foreground text-xs" suppressHydrationWarning>
                {saved.gridAt
                  ? `Read from Instagram ${formatDistanceToNow(new Date(saved.gridAt), { addSuffix: true })}. Visits keep it current.`
                  : "Not read from Instagram yet."}
              </p>
              {grid.length > 0 && (
                <ul className="divide-y rounded-xl border">
                  {grid.map((t) => {
                    const value = draft.postLinks[t.id] ?? "";
                    const urlBad = badUrl(value);
                    return (
                      <li key={t.id} className="flex items-center gap-3 p-2.5">
                        <span className="bg-muted relative size-11 shrink-0 overflow-hidden rounded-lg">
                          <Image src={t.image} alt="" fill unoptimized sizes="44px" className="object-cover" />
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          {/* The count sits outside the truncated caption, so a long caption can't hide it. */}
                          <p className="text-muted-foreground flex gap-2 text-xs">
                            <span className="min-w-0 flex-1 truncate">{t.caption || "No caption"}</span>
                            <span
                              className={cn(
                                "shrink-0 font-mono tabular-nums",
                                stats?.byTarget[t.id] ? "text-foreground" : "text-muted-foreground",
                              )}
                            >
                              {taps(stats?.byTarget[t.id])}
                            </span>
                          </p>
                          <Input
                            value={value}
                            inputMode="url"
                            spellCheck={false}
                            maxLength={BIO_LIMITS.url}
                            placeholder="Opens the post. Or paste a link, like the product page."
                            aria-label="Where this post goes"
                            aria-invalid={urlBad}
                            onChange={(e) => update({ postLinks: { ...draft.postLinks, [t.id]: e.target.value } })}
                            className="h-8 text-[0.8125rem]"
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {saved.gridAt && grid.length === 0 && (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <ImageIcon className="size-4" /> No posts came back from Instagram.
                </p>
              )}
            </>
          )}
        </Section>

        <div className="bg-muted/35 flex flex-wrap items-center gap-3 border-t px-5 py-4 sm:px-6">
          <label className="flex items-center gap-2.5 text-sm">
            <Switch checked={draft.published} onCheckedChange={(v) => update({ published: v })} />
            <span>
              <span className="font-medium">{draft.published ? "Live" : "Draft"}</span>
              <span className="text-muted-foreground block text-xs">
                {draft.published ? "Anyone with the address can see it." : "Hidden from visitors until you switch it on."}
              </span>
            </span>
          </label>
          <div className="ml-auto flex items-center gap-2">
            {saved && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
                <Trash2 /> Delete
              </Button>
            )}
            <Button onClick={save} disabled={!dirty || !!problem || busy !== null || !featureOn} title={problem ?? undefined}>
              {busy === "save" && <Loader2 className="animate-spin" />}
              {saved ? (dirty ? "Save changes" : "Saved") : "Create page"}
            </Button>
          </div>
          {/* The address's own problem already shows under it. */}
          {problem && dirty && !slugIssue && <p className="text-fault-ink w-full text-right text-xs">{problem}</p>}
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6">
        {saved && (
          <div className="bg-card space-y-3 rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs">{address}</span>
              <span
                className={cn(
                  "shrink-0 font-mono text-[0.625rem] tracking-wide uppercase",
                  saved.published ? "text-live-ink" : "text-muted-foreground",
                )}
              >
                {saved.published ? "Live" : "Draft"}
              </span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={copy}>
                <Copy /> Copy link
              </Button>
              {saved.published && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  render={<a href={bioPath(saved.slug)} target="_blank" rel="noreferrer" />}
                >
                  <ExternalLink /> Open
                </Button>
              )}
            </div>
            {stats && (
              <dl className="grid grid-cols-3 gap-2 border-t pt-3 text-center">
                {[
                  ["Views", stats.views.toLocaleString()],
                  ["Taps", stats.clicks.toLocaleString()],
                  ["Tap rate", stats.views ? `${Math.round((stats.clicks / stats.views) * 100)}%` : "–"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="label-caps">{label}</dt>
                    <dd className="mt-1 font-mono text-lg tabular-nums">{value}</dd>
                  </div>
                ))}
                <p className="text-muted-foreground col-span-3 text-[0.6875rem]">Last 30 days. Bots and link previews aren&apos;t counted.</p>
              </dl>
            )}
          </div>
        )}

        <div>
          <div className="label-caps mb-3">Preview</div>
          <div className="bg-background shadow-hairline h-[36rem] overflow-y-auto rounded-[1.75rem] border-[6px] border-[color-mix(in_oklch,var(--foreground),transparent_88%)]">
            <BioView data={preview} preview className="px-4 pt-8" />
          </div>
        </div>
      </aside>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {editor.client.name}&apos;s page?</DialogTitle>
            <DialogDescription>
              {address} stops working straight away and its tap counts are deleted. Anyone with the
              link in their bio should change it first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy !== null}>
              Delete page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
