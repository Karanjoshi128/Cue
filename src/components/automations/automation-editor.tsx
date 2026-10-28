"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { toast } from "sonner";
import type { AutomationTrigger, KeywordMatch, LeadField } from "@prisma/client";
import {
  CalendarClock,
  Check,
  ImageIcon,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import {
  listAccountMedia,
  saveAutomation,
  writeDmVariants,
  type AutomationInput,
  type PickableMedia,
} from "@/lib/automation-actions";
import { unwrap } from "@/lib/action-result";
import { COPY, LIMITS } from "@/lib/automations/config";
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
  trigger: AutomationTrigger;
  scope: Scope;
  source: PostSource;
  media: ChosenMedia | null;
  postId: string | null;
  matchMode: KeywordMatch;
  keywords: string[];
  fuzzy: boolean;
  replyOn: boolean;
  replies: string[];
  dmOn: boolean;
  dmText: string;
  dmVariants: string[];
  rotateEvery: number;
  buttonOn: boolean;
  buttonLabel: string;
  buttonUrl: string;
  followGate: boolean;
  gateText: string;
  collect: LeadField | null;
  askText: string;
  followUpOn: boolean;
  followUpText: string;
  followUpMinutes: number;
  oncePerPerson: boolean;
  holdWords: string[];
  aiModeration: boolean;
}

const FOLLOW_UP_DELAYS: Record<string, string> = {
  "15": "15 minutes",
  "30": "30 minutes",
  "60": "1 hour",
  "180": "3 hours",
  "360": "6 hours",
  "720": "12 hours",
};

function draftFrom(rule: AutomationRuleView | null, accountId: string): Draft {
  if (!rule) {
    return {
      accountId,
      name: "",
      enabled: true,
      trigger: "COMMENT",
      scope: "ANY_POST",
      source: "instagram",
      media: null,
      postId: null,
      matchMode: "WORD",
      keywords: [],
      fuzzy: true,
      replyOn: true,
      replies: ["Sent! Check your DMs 📩"],
      dmOn: true,
      dmText: "Hey {username}, here's the link you asked for 👇",
      dmVariants: [],
      rotateEvery: 50,
      buttonOn: true,
      buttonLabel: "Open the link",
      buttonUrl: "",
      followGate: false,
      gateText: "",
      collect: null,
      askText: "",
      followUpOn: false,
      followUpText: COPY.followUp,
      followUpMinutes: 60,
      oncePerPerson: true,
      holdWords: [],
      aiModeration: false,
    };
  }
  return {
    accountId: rule.accountId,
    name: rule.name,
    enabled: rule.enabled,
    trigger: rule.trigger,
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
    fuzzy: rule.fuzzy,
    replyOn: rule.replies.length > 0,
    replies: rule.replies.length ? rule.replies : ["Sent! Check your DMs 📩"],
    dmOn: rule.dmText !== null,
    dmText: rule.dmText ?? "",
    dmVariants: rule.dmVariants,
    rotateEvery: rule.rotateEvery,
    buttonOn: rule.dmButtonUrl !== null,
    buttonLabel: rule.dmButtonLabel ?? "Open the link",
    buttonUrl: rule.dmButtonUrl ?? "",
    followGate: rule.followGate,
    gateText: rule.gateText ?? "",
    collect: rule.collect,
    askText: rule.askText ?? "",
    followUpOn: rule.followUpText !== null,
    followUpText: rule.followUpText ?? COPY.followUp,
    followUpMinutes: rule.followUpMinutes,
    oncePerPerson: rule.oncePerPerson,
    holdWords: rule.holdWords,
    aiModeration: rule.aiModeration,
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

/** A labelled switch row with a line of explanation. */
function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 text-sm">
      <span>
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground block text-xs leading-relaxed">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  );
}

/** Words typed as chips: Enter or comma adds, Backspace removes the last. */
function ChipInput({
  label,
  values,
  max,
  placeholder,
  onChange,
  pending,
  onPendingChange,
}: {
  label: string;
  values: string[];
  max: number;
  placeholder: string;
  onChange: (values: string[]) => void;
  pending: string;
  onPendingChange: (v: string) => void;
}) {
  const add = (raw: string) => {
    onChange(
      cleanKeywords([...values, ...raw.split(",")])
        .slice(0, max)
        .map((k) => k.slice(0, LIMITS.keywordLength)),
    );
    onPendingChange("");
  };
  return (
    <div className="bg-card focus-within:border-ring focus-within:ring-ring/15 flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-[border-color,box-shadow] focus-within:ring-4">
      {values.map((k) => (
        <KeywordChip key={k} className="gap-1 pr-1">
          {k}
          <button
            type="button"
            aria-label={`Remove ${k}`}
            onClick={() => onChange(values.filter((x) => x !== k))}
            className="hover:bg-primary/15 grid size-4 place-items-center rounded"
          >
            <X className="size-3" />
          </button>
        </KeywordChip>
      ))}
      <input
        aria-label={label}
        value={pending}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) add(v);
          else onPendingChange(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (pending.trim()) add(pending);
          } else if (e.key === "Backspace" && !pending && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => pending.trim() && add(pending)}
        placeholder={values.length ? "Add another" : placeholder}
        className="placeholder:text-muted-foreground min-w-28 flex-1 bg-transparent px-1 text-sm outline-none"
      />
    </div>
  );
}

const TRIGGER_TITLE: Record<AutomationTrigger, string> = {
  COMMENT: "When someone comments",
  STORY_REPLY: "When someone replies to a story",
  DM_KEYWORD: "When someone sends a DM",
};

export function AutomationEditor({
  open,
  onOpenChange,
  rule,
  accounts,
  posts,
  defaultAccountId,
  timeZone,
  aiOn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: AutomationRuleView | null;
  /** Accounts that have comment and message access. */
  accounts: AutomationAccountView[];
  posts: AutomationPostView[];
  defaultAccountId?: string;
  timeZone: string;
  /** AI helpers are set up (ANTHROPIC_API_KEY) and on for the workspace. */
  aiOn: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState<Draft>(() =>
    draftFrom(rule, defaultAccountId ?? accounts[0]?.id ?? ""),
  );
  const [keywordInput, setKeywordInput] = useState("");
  const [holdInput, setHoldInput] = useState("");
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
  const isComment = draft.trigger === "COMMENT";

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

  function changeTrigger(trigger: AutomationTrigger) {
    update({
      trigger,
      // Any story reply is the usual story trigger; a DM needs a keyword.
      ...(trigger === "STORY_REPLY" && !draft.keywords.length ? { matchMode: "ANY_COMMENT" as const } : {}),
      ...(trigger === "DM_KEYWORD" && draft.matchMode === "ANY_COMMENT" ? { matchMode: "WORD" as const } : {}),
    });
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

  function writeVariants() {
    if (!draft.dmText.trim()) return toast.error("Write the DM first.");
    setWriting(true);
    startTransition(async () => {
      try {
        const variants = unwrap(await writeDmVariants(draft.dmText, LIMITS.dmVariants));
        update({ dmVariants: variants.slice(0, LIMITS.dmVariants) });
        toast.success("Variations written. Edit or remove any before saving.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't write variations.");
      } finally {
        setWriting(false);
      }
    });
  }

  function save() {
    const keywords = keywordInput.trim()
      ? cleanKeywords([...draft.keywords, ...keywordInput.split(",")])
      : draft.keywords;
    const holdWords = holdInput.trim()
      ? cleanKeywords([...draft.holdWords, ...holdInput.split(",")])
      : draft.holdWords;
    // Story replies and DMs are always answered with a DM.
    const dmOn = draft.dmOn || !isComment;
    const steps = dmOn;
    const input: AutomationInput = {
      accountId: draft.accountId,
      name: draft.name,
      enabled: draft.enabled,
      trigger: draft.trigger,
      scope: draft.scope,
      media: isComment && draft.scope === "ONE_POST" && draft.source === "instagram" ? draft.media : null,
      postId: isComment && draft.scope === "ONE_POST" && draft.source === "cue" ? draft.postId : null,
      matchMode: draft.matchMode,
      keywords,
      fuzzy: draft.fuzzy,
      replies: isComment && draft.replyOn ? draft.replies : [],
      dmText: dmOn ? draft.dmText : null,
      dmVariants: dmOn ? draft.dmVariants : [],
      rotateEvery: draft.rotateEvery,
      dmButtonLabel: dmOn && draft.buttonOn ? draft.buttonLabel : null,
      dmButtonUrl: dmOn && draft.buttonOn ? draft.buttonUrl : null,
      oncePerPerson: draft.oncePerPerson,
      followGate: steps && draft.followGate,
      gateText: steps && draft.followGate ? draft.gateText : null,
      collect: steps ? draft.collect : null,
      askText: steps && draft.collect ? draft.askText : null,
      followUpText: steps && draft.followUpOn && (draft.followGate || draft.collect) ? draft.followUpText : null,
      followUpMinutes: draft.followUpMinutes,
      holdWords,
      aiModeration: aiOn && draft.aiModeration,
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
  const anyLabel = draft.trigger === "STORY_REPLY" ? "Any reply" : draft.trigger === "DM_KEYWORD" ? "Any DM" : "Any comment";

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
                When a comment, story reply or DM matches, Cue answers with a DM, and can reply
                under the comment, check they follow you, or ask for an email first.
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
                id="auto-trigger"
                value={draft.trigger}
                onChange={changeTrigger}
                options={[
                  { key: "COMMENT", label: "Comment" },
                  { key: "STORY_REPLY", label: "Story reply" },
                  { key: "DM_KEYWORD", label: "DM" },
                ]}
              />

              {draft.trigger === "STORY_REPLY" && (
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Runs when someone replies to any of the account&apos;s stories. Their reply opens
                  a 24-hour window, so Cue answers in the same chat.
                </p>
              )}
              {draft.trigger === "DM_KEYWORD" && (
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Runs when someone sends the account a DM with your keyword, like PRICE or MENU.
                </p>
              )}

              {isComment && (
                <>
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
                              {mediaItems?.loading ? <Loader2 className="animate-spin" /> : <LayoutGrid />}
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
                </>
              )}
            </Step>

            <Step n="02" title={TRIGGER_TITLE[draft.trigger]}>
              <Segmented
                id="auto-match"
                value={draft.matchMode}
                onChange={(matchMode) => update({ matchMode })}
                options={[
                  { key: "WORD", label: "Keyword" },
                  { key: "CONTAINS", label: "Contains" },
                  { key: "ANY_COMMENT", label: anyLabel },
                ]}
              />
              {draft.matchMode === "ANY_COMMENT" ? (
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {isComment
                    ? "Every new comment triggers it. Best on one post, with “Once per person” on."
                    : "Every one triggers it. “Once per person” keeps it to one answer each."}
                </p>
              ) : (
                <div className="space-y-2">
                  <ChipInput
                    label="Keywords"
                    values={draft.keywords}
                    max={LIMITS.keywords}
                    placeholder="LINK, GUIDE, PRICE"
                    onChange={(keywords) => update({ keywords })}
                    pending={keywordInput}
                    onPendingChange={setKeywordInput}
                  />
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {draft.matchMode === "WORD"
                      ? "Press Enter after each. Capitals don't matter: LINK matches “link please” but not “linked”."
                      : "Press Enter after each. Matches the text anywhere, so “link” also matches “linked”."}
                  </p>
                  {draft.matchMode === "WORD" && (
                    <Toggle
                      label="Forgive typos"
                      hint="“lnik” and “linkk” count as LINK. Keywords of 5+ letters also forgive one wrong letter."
                      checked={draft.fuzzy}
                      onChange={(fuzzy) => update({ fuzzy })}
                    />
                  )}
                </div>
              )}
            </Step>

            {isComment && (
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
                            onClick={() => update({ replies: draft.replies.filter((_, j) => j !== i) })}
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
            )}

            <Step
              n={isComment ? "04" : "03"}
              title={isComment ? "Send a DM" : "Answer with a DM"}
              hint={
                isComment ? (
                  <Switch checked={draft.dmOn} onCheckedChange={(v) => update({ dmOn: v })} aria-label="Send a DM" />
                ) : undefined
              }
            >
              {draft.dmOn || !isComment ? (
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

                  <div className="space-y-2 rounded-xl border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">Other wordings</span>
                      {aiOn && (
                        <Button type="button" variant="outline" size="xs" onClick={writeVariants} disabled={writing}>
                          {writing ? <Loader2 className="animate-spin" /> : <Sparkles />} Write them for me
                        </Button>
                      )}
                    </div>
                    {draft.dmVariants.map((v, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Textarea
                          value={v}
                          rows={2}
                          aria-label={`Wording ${i + 2}`}
                          onChange={(e) =>
                            update({
                              dmVariants: draft.dmVariants.map((x, j) =>
                                j === i ? e.target.value.slice(0, LIMITS.dmLength) : x,
                              ),
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove this wording"
                          onClick={() => update({ dmVariants: draft.dmVariants.filter((_, j) => j !== i) })}
                        >
                          <X />
                        </Button>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {draft.dmVariants.length < LIMITS.dmVariants && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => update({ dmVariants: [...draft.dmVariants, ""] })}
                        >
                          <Plus /> Add a wording
                        </Button>
                      )}
                      {draft.dmVariants.length > 0 && (
                        <label className="text-muted-foreground flex items-center gap-2 text-xs">
                          Switch every
                          <Input
                            type="number"
                            min={1}
                            max={1000}
                            value={draft.rotateEvery}
                            onChange={(e) => update({ rotateEvery: Math.max(1, Number(e.target.value) || 1) })}
                            className="h-7 w-16 px-2 text-xs"
                          />
                          DMs
                        </label>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      Same link and offer, different words, so Instagram doesn&apos;t see one message
                      sent thousands of times.
                    </p>
                  </div>

                  <div className="rounded-xl border p-3">
                    <label className="flex items-center justify-between gap-3 text-sm font-medium">
                      Add a link button
                      <Switch checked={draft.buttonOn} onCheckedChange={(v) => update({ buttonOn: v })} />
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
                <p className="text-muted-foreground text-xs">No DM. Cue only replies under the comment.</p>
              )}
            </Step>

            {(draft.dmOn || !isComment) && (
              <Step n={isComment ? "05" : "04"} title="Before the link">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Toggle
                      label="Only followers get it"
                      hint="The first DM has a “Send me the link” button. When they tap it, Cue checks they follow you, and asks them to follow first if they don't."
                      checked={draft.followGate}
                      onChange={(followGate) => update({ followGate })}
                    />
                    {draft.followGate && (
                      <Input
                        aria-label="First DM"
                        value={draft.gateText}
                        maxLength={LIMITS.dmLength}
                        onChange={(e) => update({ gateText: e.target.value })}
                        placeholder={COPY.gate}
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Ask for</div>
                    <Segmented
                      id="auto-collect"
                      value={draft.collect ?? "NONE"}
                      onChange={(v) => update({ collect: v === "NONE" ? null : (v as LeadField) })}
                      options={[
                        { key: "NONE", label: "Nothing" },
                        { key: "EMAIL", label: "Email" },
                        { key: "PHONE", label: "Phone" },
                      ]}
                    />
                    {draft.collect && (
                      <>
                        <Input
                          aria-label="Question"
                          value={draft.askText}
                          maxLength={LIMITS.dmLength}
                          onChange={(e) => update({ askText: e.target.value })}
                          placeholder={COPY.ask[draft.collect]}
                        />
                        <p className="text-muted-foreground text-xs leading-relaxed">
                          Cue checks the answer looks right, saves it to Leads, then sends the link.
                        </p>
                      </>
                    )}
                  </div>

                  {(draft.followGate || draft.collect) && (
                    <div className="space-y-2">
                      <Toggle
                        label="Nudge if they go quiet"
                        hint="One reminder, sent while Instagram still allows it: within 24 hours of their last tap or reply."
                        checked={draft.followUpOn}
                        onChange={(followUpOn) => update({ followUpOn })}
                      />
                      {draft.followUpOn && (
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                          <Input
                            aria-label="Follow-up"
                            value={draft.followUpText}
                            maxLength={LIMITS.dmLength}
                            onChange={(e) => update({ followUpText: e.target.value })}
                          />
                          <Select
                            value={String(draft.followUpMinutes)}
                            items={FOLLOW_UP_DELAYS}
                            onValueChange={(v) => update({ followUpMinutes: Number(v) })}
                          >
                            <SelectTrigger className="w-full" aria-label="Wait before the follow-up">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(FOLLOW_UP_DELAYS).map(([k, label]) => (
                                <SelectItem key={k} value={k}>
                                  after {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Step>
            )}

            <Step n={isComment ? (draft.dmOn ? "06" : "05") : "05"} title="Rules">
              <div className="space-y-4">
                <Toggle
                  label="Once per person"
                  hint="Someone who triggers it again doesn't get a second DM."
                  checked={draft.oncePerPerson}
                  onChange={(oncePerPerson) => update({ oncePerPerson })}
                />
                <div className="space-y-1.5">
                  <div className="text-sm font-medium">Hold for review</div>
                  <ChipInput
                    label="Hold words"
                    values={draft.holdWords}
                    max={LIMITS.holdWords}
                    placeholder="scam, fake, refund"
                    onChange={(holdWords) => update({ holdWords })}
                    pending={holdInput}
                    onPendingChange={setHoldInput}
                  />
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    A comment or message with any of these gets no auto-reply. It waits in Activity
                    for you to send or dismiss.
                  </p>
                </div>
                {aiOn && (
                  <Toggle
                    label="Hold abuse with AI"
                    hint="AI also holds hateful or abusive messages, in any language including Hinglish."
                    checked={draft.aiModeration}
                    onChange={(aiModeration) => update({ aiModeration })}
                  />
                )}
              </div>
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
                  {pending && !writing && <Loader2 className="animate-spin" />}
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
                trigger={draft.trigger}
                postLabel={previewPost}
                thumbUrl={isComment && draft.scope === "ONE_POST" && draft.source === "instagram" ? (draft.media?.thumbUrl ?? null) : null}
                keywords={keywordInput.trim() ? cleanKeywords([...draft.keywords, keywordInput]) : draft.keywords}
                matchMode={draft.matchMode}
                fuzzy={draft.fuzzy}
                reply={isComment && draft.replyOn ? (draft.replies.find((r) => r.trim()) ?? null) : null}
                dmText={(draft.dmOn || !isComment) && draft.dmText.trim() ? draft.dmText : null}
                button={(draft.dmOn || !isComment) && draft.buttonOn ? { label: draft.buttonLabel, url: draft.buttonUrl } : null}
                gateText={draft.followGate ? draft.gateText : null}
                collect={draft.collect}
                askText={draft.collect ? draft.askText : null}
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
