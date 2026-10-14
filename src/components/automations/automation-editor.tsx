"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { toast } from "sonner";
import type { KeywordMatch } from "@prisma/client";
import {
  CalendarClock,
  Check,
  ImageIcon,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import {
  listAccountMedia,
  saveAutomation,
  type AutomationInput,
  type PickableMedia,
} from "@/lib/automation-actions";
import { unwrap } from "@/lib/action-result";
import { LIMITS } from "@/lib/automations/config";
import { cleanKeywords } from "@/lib/automations/match";
import type {
  AutomationAccountView,
  AutomationPostView,
  AutomationRuleView,
} from "@/lib/automations/data";
import { zoned } from "@/lib/timezone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTitle,
} from "@/components/ui/dialog";
import { AutomationPreview } from "@/components/automations/automation-preview";
import { KeywordChip } from "@/components/automations/bits";
import { cn } from "@/lib/utils";

type Scope = "ANY_POST" | "ONE_POST";
type PostSource = "instagram" | "cue";

interface ChosenMedia {
  id: string;
  permalink: string | null;
  caption: string | null;
  thumbUrl: string | null;
}

interface Draft {
  accountId: string;
  name: string;
  enabled: boolean;
  scope: Scope;
  source: PostSource;
  media: ChosenMedia | null;
  postId: string | null;
  matchMode: KeywordMatch;
  keywords: string[];
  replyOn: boolean;
  replies: string[];
  dmOn: boolean;
  dmText: string;
  buttonOn: boolean;
  buttonLabel: string;
  buttonUrl: string;
  oncePerPerson: boolean;
}

function draftFrom(rule: AutomationRuleView | null, accountId: string): Draft {
  if (!rule) {
    return {
      accountId,
      name: "",
      enabled: true,
      scope: "ANY_POST",
      source: "instagram",
      media: null,
      postId: null,
      matchMode: "WORD",
      keywords: [],
      replyOn: true,
      replies: ["Sent! Check your DMs 📩"],
      dmOn: true,
      dmText: "Hey {username}, here's the link you asked for 👇",
      buttonOn: true,
      buttonLabel: "Open the link",
      buttonUrl: "",
      oncePerPerson: true,
    };
  }
  return {
    accountId: rule.accountId,
    name: rule.name,
    enabled: rule.enabled,
    scope: rule.scope,
    source: rule.postId ? "cue" : "instagram",
    media:
      rule.mediaId && !rule.postId
        ? {
            id: rule.mediaId,
            permalink: rule.mediaPermalink,
            caption: rule.mediaCaption,
            thumbUrl: rule.mediaThumbUrl,
          }
        : null,
    postId: rule.postId,
    matchMode: rule.matchMode,
    keywords: rule.keywords,
    replyOn: rule.replies.length > 0,
    replies: rule.replies.length ? rule.replies : ["Sent! Check your DMs 📩"],
    dmOn: rule.dmText !== null,
    dmText: rule.dmText ?? "",
    buttonOn: rule.dmButtonUrl !== null,
    buttonLabel: rule.dmButtonLabel ?? "Open the link",
    buttonUrl: rule.dmButtonUrl ?? "",
    oncePerPerson: rule.oncePerPerson,
  };
}

function Step({
  n,
  title,
  hint,
  children,
}: {
  n: string;
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-t pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-primary font-mono text-[0.6875rem] font-medium tracking-wider">
          {n}
        </span>
        <h3 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h3>
        {hint && <span className="text-muted-foreground ml-auto text-xs">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** A segmented control in the composer's style. */
function Segmented<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="bg-muted flex gap-0.5 rounded-xl p-1 text-sm">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={cn(
              "relative flex h-8 flex-1 items-center justify-center rounded-lg px-2 font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`${id}-pill`}
                className="bg-card absolute inset-0 rounded-lg shadow-[0_0_0_1px_var(--border),0_1px_2px_0_rgb(20_20_40/0.06)]"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Counter({ value, max }: { value: number; max: number }) {
  return (
    <span
      className={cn(
        "font-mono text-[0.6875rem] tabular-nums",
        value > max ? "text-fault-ink" : "text-muted-foreground",
      )}
    >
      {value}/{max}
    </span>
  );
}

export function AutomationEditor({
  open,
  onOpenChange,
  rule,
  accounts,
  posts,
  defaultAccountId,
  timeZone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: AutomationRuleView | null;
  /** Accounts that have comment access. */
  accounts: AutomationAccountView[];
  posts: AutomationPostView[];
  defaultAccountId?: string;
  timeZone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(() =>
    draftFrom(rule, defaultAccountId ?? accounts[0]?.id ?? ""),
  );
  const [keywordInput, setKeywordInput] = useState("");
  const [media, setMedia] = useState<{
    accountId: string;
    loading: boolean;
    items: PickableMedia[] | null;
    error: string | null;
  } | null>(null);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const account = accounts.find((a) => a.id === draft.accountId);
  const accountPosts = posts.filter((p) => p.accountIds.includes(draft.accountId));
  const chosenPost = accountPosts.find((p) => p.id === draft.postId) ?? null;
  const ctx = { in: zoned(timeZone) };

  const accountItems = Object.fromEntries(
    accounts.map((a) => [a.id, `${a.displayName} · ${a.clientName}`]),
  );
  const postLabel = (p: AutomationPostView) =>
    `${p.body.slice(0, 48) || "Untitled post"}${p.body.length > 48 ? "…" : ""} · ${
      p.scheduledAt ? format(new Date(p.scheduledAt), "d MMM, h:mm a", ctx) : "Draft"
    }`;
  const postItems = Object.fromEntries(accountPosts.map((p) => [p.id, postLabel(p)]));

  function changeAccount(id: string) {
    update({ accountId: id, media: null, postId: null });
    setMedia(null);
  }

  function addKeywords(raw: string) {
    const next = cleanKeywords([...draft.keywords, ...raw.split(",")]).slice(
      0,
      LIMITS.keywords,
    );
    update({ keywords: next.map((k) => k.slice(0, LIMITS.keywordLength)) });
    setKeywordInput("");
  }

  function loadMedia() {
    const accountId = draft.accountId;
    setMedia({ accountId, loading: true, items: null, error: null });
    startTransition(async () => {
      try {
        const items = unwrap(await listAccountMedia(accountId));
        setMedia({ accountId, loading: false, items, error: null });
      } catch (e) {
        setMedia({
          accountId,
          loading: false,
          items: null,
          error: e instanceof Error ? e.message : "Couldn't load posts.",
        });
      }
    });
  }

  function save() {
    const keywords = keywordInput.trim()
      ? cleanKeywords([...draft.keywords, ...keywordInput.split(",")])
      : draft.keywords;
    const input: AutomationInput = {
      accountId: draft.accountId,
      name: draft.name,
      enabled: draft.enabled,
      scope: draft.scope,
      media: draft.scope === "ONE_POST" && draft.source === "instagram" ? draft.media : null,
      postId: draft.scope === "ONE_POST" && draft.source === "cue" ? draft.postId : null,
      matchMode: draft.matchMode,
      keywords,
      replies: draft.replyOn ? draft.replies : [],
      dmText: draft.dmOn ? draft.dmText : null,
      dmButtonLabel: draft.dmOn && draft.buttonOn ? draft.buttonLabel : null,
      dmButtonUrl: draft.dmOn && draft.buttonOn ? draft.buttonUrl : null,
      oncePerPerson: draft.oncePerPerson,
    };
    const t = toast.loading(rule ? "Saving…" : "Creating automation…");
    startTransition(async () => {
      try {
        unwrap(await saveAutomation(rule?.id ?? null, input));
        toast.success(rule ? "Automation saved" : "Automation created", { id: t });
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save.", { id: t });
      }
    });
  }

  const previewPost =
    draft.scope === "ANY_POST"
      ? `Any of ${account?.displayName ?? "the account"}'s posts`
      : draft.source === "cue"
        ? (chosenPost?.body.slice(0, 120) ?? "Pick a scheduled post")
        : (draft.media?.caption?.slice(0, 120) ?? "Pick a post");
  const mediaItems = media && media.accountId === draft.accountId ? media : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-5xl">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5 p-5 sm:p-7">
            <div className="space-y-1.5 pr-8">
              <DialogTitle className="headline text-2xl">
                {rule ? (
                  <>
                    Edit <em>automation</em>
                  </>
                ) : (
                  <>
                    New <em>automation</em>
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                When a comment matches, Cue replies under it and sends the person a DM.
                Instagram allows one DM per comment, within 7 days of it.
              </DialogDescription>
            </div>

            <Step n="01" title="Where">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="auto-account">Instagram account</Label>
                  <Select
                    value={draft.accountId}
                    items={accountItems}
                    onValueChange={(v) => changeAccount(v as string)}
                  >
                    <SelectTrigger id="auto-account" className="w-full">
                      <SelectValue placeholder="Pick an account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {accountItems[a.id]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="auto-name">Name</Label>
                  <Input
                    id="auto-name"
                    value={draft.name}
                    maxLength={LIMITS.name}
                    onChange={(e) => update({ name: e.target.value })}
                    placeholder="Free guide giveaway"
                  />
                </div>
              </div>

              <Segmented
                id="auto-scope"
                value={draft.scope}
                onChange={(scope) => update({ scope })}
                options={[
                  { key: "ANY_POST", label: "Any post" },
                  { key: "ONE_POST", label: "One post" },
                ]}
              />

              {draft.scope === "ANY_POST" ? (
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Watches every post on the account. Until Meta turns on instant comment
                  notifications, Cue checks the 10 newest posts every minute.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { key: "instagram", label: "Already on Instagram", icon: LayoutGrid },
                        { key: "cue", label: "Scheduled in Cue", icon: CalendarClock },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => update({ source: o.key })}
                        aria-pressed={draft.source === o.key}
                        className={cn(
                          "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[0.8125rem] font-medium transition-colors",
                          draft.source === o.key
                            ? "border-primary/40 bg-primary/6 text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <o.icon className="size-3.5" />
                        {o.label}
                      </button>
                    ))}
                  </div>

                  {draft.source === "cue" ? (
                    accountPosts.length ? (
                      <div className="space-y-1.5">
                        <Select
                          value={draft.postId ?? ""}
                          items={postItems}
                          onValueChange={(v) => update({ postId: (v as string) || null })}
                        >
                          <SelectTrigger className="w-full" aria-label="Scheduled post">
                            <SelectValue placeholder="Pick a post headed for this account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accountPosts.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {postItems[p.id]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-muted-foreground text-xs leading-relaxed">
                          The automation starts the moment this post goes live.
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground rounded-lg border border-dashed px-3.5 py-3 text-xs leading-relaxed">
                        No upcoming posts in Cue are going to this account. Schedule one in
                        Compose, or pick a post that&apos;s already on Instagram.
                      </p>
                    )
                  ) : (
                    <div className="space-y-2.5">
                      {draft.media && (
                        <div className="bg-muted/40 flex items-center gap-3 rounded-xl border p-2.5">
                          <MediaThumb url={draft.media.thumbUrl} className="size-12" />
                          <p className="text-muted-foreground line-clamp-2 min-w-0 flex-1 text-xs">
                            {draft.media.caption || "No caption"}
                          </p>
                          <Check className="text-live size-4 shrink-0" />
                        </div>
                      )}
                      {mediaItems?.items ? (
                        mediaItems.items.length ? (
                          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                            {mediaItems.items.map((m) => {
                              const on = draft.media?.id === m.id;
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  title={m.caption ?? undefined}
                                  onClick={() =>
                                    update({
                                      media: {
                                        id: m.id,
                                        permalink: m.permalink,
                                        caption: m.caption,
                                        thumbUrl: m.thumbUrl,
                                      },
                                    })
                                  }
                                  aria-pressed={on}
                                  className={cn(
                                    "relative aspect-square overflow-hidden rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                                    on && "ring-primary ring-2 ring-offset-2 ring-offset-popover",
                                  )}
                                >
                                  <MediaThumb url={m.thumbUrl} className="size-full rounded-none" />
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-xs">
                            This account has no posts yet.
                          </p>
                        )
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={loadMedia}
                          disabled={!draft.accountId || mediaItems?.loading}
                        >
                          {mediaItems?.loading ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <LayoutGrid />
                          )}
                          {draft.media ? "Choose a different post" : "Choose from recent posts"}
                        </Button>
                      )}
                      {mediaItems?.error && (
                        <p className="text-fault-ink flex items-center gap-2 text-xs">
                          {mediaItems.error}
                          <button type="button" onClick={loadMedia} className="underline">
                            <RefreshCw className="inline size-3" /> Retry
                          </button>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Step>

            <Step n="02" title="When someone comments">
              <Segmented
                id="auto-match"
                value={draft.matchMode}
                onChange={(matchMode) => update({ matchMode })}
                options={[
                  { key: "WORD", label: "Keyword" },
                  { key: "CONTAINS", label: "Contains" },
                  { key: "ANY_COMMENT", label: "Any comment" },
                ]}
              />
              {draft.matchMode === "ANY_COMMENT" ? (
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Every new comment triggers it. Best on one post, with &ldquo;Once per
                  person&rdquo; on.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <div className="bg-card focus-within:border-ring focus-within:ring-ring/15 flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-[border-color,box-shadow] focus-within:ring-4">
                    {draft.keywords.map((k) => (
                      <KeywordChip key={k} className="gap-1 pr-1">
                        {k}
                        <button
                          type="button"
                          aria-label={`Remove ${k}`}
                          onClick={() =>
                            update({ keywords: draft.keywords.filter((x) => x !== k) })
                          }
                          className="hover:bg-primary/15 grid size-4 place-items-center rounded"
                        >
                          <X className="size-3" />
                        </button>
                      </KeywordChip>
                    ))}
                    <input
                      aria-label="Keywords"
                      value={keywordInput}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v.includes(",")) addKeywords(v);
                        else setKeywordInput(v);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (keywordInput.trim()) addKeywords(keywordInput);
                        } else if (e.key === "Backspace" && !keywordInput && draft.keywords.length) {
                          update({ keywords: draft.keywords.slice(0, -1) });
                        }
                      }}
                      onBlur={() => keywordInput.trim() && addKeywords(keywordInput)}
                      placeholder={draft.keywords.length ? "Add another" : "LINK, GUIDE, PRICE"}
                      className="placeholder:text-muted-foreground min-w-28 flex-1 bg-transparent px-1 text-sm outline-none"
                    />
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {draft.matchMode === "WORD"
                      ? "Press Enter after each. Capitals don't matter: LINK matches “link please” but not “linked”."
                      : "Press Enter after each. Matches the text anywhere, so “link” also matches “linked”."}
                  </p>
                </div>
              )}
            </Step>

            <Step
              n="03"
              title="Reply under the comment"
              hint={<Switch checked={draft.replyOn} onCheckedChange={(v) => update({ replyOn: v })} aria-label="Reply publicly" />}
            >
              {draft.replyOn ? (
                <div className="space-y-2">
                  {draft.replies.map((r, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Textarea
                        value={r}
                        rows={1}
                        aria-label={`Reply ${i + 1}`}
                        onChange={(e) =>
                          update({
                            replies: draft.replies.map((x, j) =>
                              j === i ? e.target.value.slice(0, LIMITS.replyLength) : x,
                            ),
                          })
                        }
                        className="min-h-9 py-2"
                      />
                      {draft.replies.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove this reply"
                          onClick={() =>
                            update({ replies: draft.replies.filter((_, j) => j !== i) })
                          }
                        >
                          <X />
                        </Button>
                      )}
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {draft.replies.length < LIMITS.replies && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => update({ replies: [...draft.replies, ""] })}
                      >
                        <Plus /> Add a variation
                      </Button>
                    )}
                    <span className="text-muted-foreground text-xs">
                      One is picked at random, so replies don&apos;t look copy-pasted.
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">No public reply. Cue only sends the DM.</p>
              )}
            </Step>

            <Step
              n="04"
              title="Send a DM"
              hint={<Switch checked={draft.dmOn} onCheckedChange={(v) => update({ dmOn: v })} aria-label="Send a DM" />}
            >
              {draft.dmOn ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Textarea
                      value={draft.dmText}
                      rows={3}
                      aria-label="DM text"
                      onChange={(e) => update({ dmText: e.target.value })}
                      placeholder="Hey {username}, here's the guide you asked for"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground text-xs">
                        <span className="font-mono">{"{username}"}</span> becomes their handle.
                      </span>
                      <Counter value={draft.dmText.length} max={LIMITS.dmLength} />
                    </div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <label className="flex items-center justify-between gap-3 text-sm font-medium">
                      Add a link button
                      <Switch
                        checked={draft.buttonOn}
                        onCheckedChange={(v) => update({ buttonOn: v })}
                      />
                    </label>
                    {draft.buttonOn && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
                        <Input
                          aria-label="Button label"
                          value={draft.buttonLabel}
                          maxLength={LIMITS.buttonLabel}
                          onChange={(e) => update({ buttonLabel: e.target.value })}
                          placeholder="Get the guide"
                        />
                        <Input
                          aria-label="Button link"
                          type="url"
                          inputMode="url"
                          value={draft.buttonUrl}
                          onChange={(e) => update({ buttonUrl: e.target.value })}
                          placeholder="https://"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  No DM. Cue only replies under the comment.
                </p>
              )}
            </Step>

            <Step n="05" title="Rules">
              <label className="flex items-start justify-between gap-4 text-sm">
                <span>
                  <span className="font-medium">Once per person</span>
                  <span className="text-muted-foreground block text-xs leading-relaxed">
                    Someone who comments the keyword again doesn&apos;t get a second DM.
                  </span>
                </span>
                <Switch
                  checked={draft.oncePerPerson}
                  onCheckedChange={(v) => update({ oncePerPerson: v })}
                  className="mt-0.5"
                />
              </label>
            </Step>

            <div className="bg-popover sticky bottom-0 -mx-5 flex flex-wrap items-center justify-between gap-3 border-t px-5 pt-4 pb-5 sm:-mx-7 sm:px-7">
              <label className="flex items-center gap-2.5 text-sm font-medium">
                <Switch checked={draft.enabled} onCheckedChange={(v) => update({ enabled: v })} />
                {draft.enabled ? "Live" : "Paused"}
              </label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={save} disabled={pending || !draft.accountId}>
                  {pending && <Loader2 className="animate-spin" />}
                  {rule ? "Save changes" : "Create automation"}
                </Button>
              </div>
            </div>
          </div>

          <aside className="bg-canvas/60 border-t p-5 lg:border-t-0 lg:border-l sm:p-6">
            <div className="lg:sticky lg:top-6">
              <div className="label-caps mb-3">Live preview</div>
              <AutomationPreview
                accountName={account?.displayName ?? ""}
                postLabel={previewPost}
                thumbUrl={draft.scope === "ONE_POST" && draft.source === "instagram" ? (draft.media?.thumbUrl ?? null) : null}
                keywords={
                  keywordInput.trim()
                    ? cleanKeywords([...draft.keywords, keywordInput])
                    : draft.keywords
                }
                matchMode={draft.matchMode}
                reply={draft.replyOn ? (draft.replies.find((r) => r.trim()) ?? null) : null}
                dmText={draft.dmOn && draft.dmText.trim() ? draft.dmText : null}
                button={
                  draft.dmOn && draft.buttonOn
                    ? { label: draft.buttonLabel, url: draft.buttonUrl }
                    : null
                }
              />
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** An Instagram thumbnail. Instagram's CDN links expire, so fall back to an icon. */
export function MediaThumb({ url, className }: { url: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground relative grid shrink-0 place-items-center overflow-hidden rounded-lg",
        className,
      )}
    >
      {url && !broken ? (
        <Image
          src={url}
          alt=""
          fill
          unoptimized
          sizes="96px"
          className="object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <ImageIcon className="size-4 opacity-60" />
      )}
    </span>
  );
}
