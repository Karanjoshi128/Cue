"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  addDays,
  addHours,
  format,
  nextMonday,
  setHours,
  setMinutes,
  startOfHour,
} from "date-fns";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import type { Platform } from "@prisma/client";
import { savePost, updatePost } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ClientDot,
  PlatformIcon,
  PLATFORM_META,
} from "@/components/post-bits";
import { ExpandablePreview } from "@/components/post-preview";
import { Countdown } from "@/components/fx/countdown";
import { cn } from "@/lib/utils";
import {
  DEFAULT_YOUTUBE_CATEGORY,
  YOUTUBE_CATEGORIES,
  YOUTUBE_TAG_BUDGET,
  cleanYoutubeTags,
  youtubeTagsCost,
  youtubeTagsProblem,
} from "@/lib/youtube-tags";
import {
  ImagePlus,
  Images,
  FileText,
  Link2,
  BarChart3,
  Loader2,
  X,
  Plus,
  Send,
  CalendarClock,
  Save,
  Check,
  UploadCloud,
  Film,
  AlertTriangle,
} from "lucide-react";

interface Account {
  id: string;
  platform: Platform;
  displayName: string;
}
interface ClientLite {
  id: string;
  name: string;
  color: string | null;
  accounts: Account[];
}
type MediaItem = {
  type: "IMAGE" | "VIDEO" | "DOCUMENT";
  url: string;
  storageKey: string;
  title?: string;
};
type PollDuration = "ONE_DAY" | "THREE_DAYS" | "SEVEN_DAYS" | "FOURTEEN_DAYS";
type LinkData = { url: string; title?: string; description?: string };
type PollData = { question: string; options: string[]; duration: PollDuration };
type ContentType = "media" | "document" | "link" | "poll";
type YtPrivacy = "public" | "unlisted" | "private";

export interface ComposerInitial {
  id: string;
  clientId: string;
  body: string;
  title: string; // YouTube video title ("" when unused)
  youtubePrivacy: YtPrivacy | null;
  youtubeTags: string[];
  youtubeCategoryId: string | null;
  accountIds: string[];
  scheduledAt: string; // datetime-local string, or ""
  media: MediaItem[];
  overrides: Record<string, string>; // accountId -> caption override
  link: LinkData | null;
  poll: PollData | null;
}

// Per-platform caption limits - the effective cap is the smallest of the
// platforms the post targets.
const PLATFORM_LIMITS: Record<Platform, number> = {
  LINKEDIN: 3000,
  INSTAGRAM: 2200,
  YOUTUBE: 5000,
};
// Shown before any account is picked.
const DEFAULT_LIMIT = 3000;
// Typing is only ever cut off at YouTube's cap. Tighter per-platform limits
// are shown by the counter and enforced on submit, never by silently trimming
// text - otherwise adding a LinkedIn account to a long YouTube description
// would delete everything past 3000 on the next keystroke.
const MAX_BODY = PLATFORM_LIMITS.YOUTUBE;

const CONTENT_TYPES = [
  { key: "media", label: "Text & media", icon: Images },
  { key: "document", label: "Document", icon: FileText },
  { key: "link", label: "Link", icon: Link2 },
  { key: "poll", label: "Poll", icon: BarChart3 },
] as const;

const POLL_DURATIONS = [
  { value: "ONE_DAY", label: "1 day" },
  { value: "THREE_DAYS", label: "3 days" },
  { value: "SEVEN_DAYS", label: "1 week" },
  { value: "FOURTEEN_DAYS", label: "2 weeks" },
] as const;

const YT_PRIVACY = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "private", label: "Private" },
] as const;

const LOCAL = "yyyy-MM-dd'T'HH:mm";

/** One-tap times, computed in the browser's own zone when clicked. */
const PRESETS: { label: string; at: () => Date }[] = [
  { label: "In an hour", at: () => startOfHour(addHours(new Date(), 2)) },
  { label: "Tomorrow 9 AM", at: () => setMinutes(setHours(addDays(new Date(), 1), 9), 0) },
  { label: "Tomorrow 6 PM", at: () => setMinutes(setHours(addDays(new Date(), 1), 18), 0) },
  { label: "Monday 9 AM", at: () => setMinutes(setHours(nextMonday(new Date()), 9), 0) },
];

/**
 * Error responses aren't always JSON - a platform-level rejection returns plain
 * text, and calling res.json() on that surfaces a confusing "not valid JSON"
 * parse error instead of the actual cause.
 */
async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    return (JSON.parse(text) as { error?: string }).error ?? text.slice(0, 140);
  } catch {
    if (res.status === 413) return "That file is too large to upload.";
    return text.slice(0, 140) || `Upload failed (${res.status})`;
  }
}

/** Circular character budget: blue, then amber near the cap, red past it. */
function CharRing({ used, limit }: { used: number; limit: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const ratio = Math.min(used / limit, 1);
  const over = used > limit;
  const near = !over && used / limit >= 0.9;
  const remaining = limit - used;
  return (
    <span className="flex items-center gap-2">
      {(near || over) && (
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            over ? "text-fault-ink" : "text-standby-ink",
          )}
        >
          {remaining}
        </span>
      )}
      <svg
        viewBox="0 0 24 24"
        className="size-6 -rotate-90"
        role="img"
        aria-label={`${used} of ${limit} characters`}
      >
        <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2.5" className="stroke-border" />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          className={cn(
            "transition-[stroke-dashoffset,stroke] duration-300",
            over ? "stroke-fault" : near ? "stroke-standby" : "stroke-primary",
          )}
        />
      </svg>
    </span>
  );
}

/** A numbered step of the composer, styled like a line on a cue sheet. */
function Step({
  n,
  title,
  hint,
  children,
  className,
}: {
  n: string;
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "bg-card rounded-2xl border p-5 shadow-[0_1px_2px_0_rgb(20_20_40/0.04)] sm:p-6",
        className,
      )}
    >
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-primary font-mono text-[0.6875rem] font-medium tracking-wider">
          {n}
        </span>
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
        {hint && (
          <span className="text-muted-foreground ml-auto text-xs">{hint}</span>
        )}
      </div>
      {children}
    </section>
  );
}

// A plain span: <Label>'s text-sm utility would override the mono caps size.
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="label-caps mb-2 block">{children}</span>;
}

export function Composer({
  clients,
  initial,
  prefillDate,
  defaultClientId,
}: {
  clients: ClientLite[];
  initial?: ComposerInitial;
  prefillDate?: string;
  defaultClientId?: string;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const initialDoc = initial?.media.find((m) => m.type === "DOCUMENT") ?? null;
  const initialMedia =
    initial?.media.filter((m) => m.type !== "DOCUMENT") ?? [];
  const initialType: ContentType = initial?.poll
    ? "poll"
    : initial?.link
      ? "link"
      : initialDoc
        ? "document"
        : "media";

  const [contentType, setContentType] = useState<ContentType>(initialType);
  const [clientId, setClientId] = useState(
    initial?.clientId ?? defaultClientId ?? clients[0]?.id ?? "",
  );
  const [selected, setSelected] = useState<string[]>(initial?.accountIds ?? []);
  const [body, setBody] = useState(initial?.body ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [youtubePrivacy, setYoutubePrivacy] = useState<YtPrivacy>(
    initial?.youtubePrivacy ?? "public",
  );
  // Tags are edited as one comma-separated string and parsed on the fly.
  const [tagsText, setTagsText] = useState(
    initial?.youtubeTags.join(", ") ?? "",
  );
  const [youtubeCategoryId, setYoutubeCategoryId] = useState(
    initial?.youtubeCategoryId ?? DEFAULT_YOUTUBE_CATEGORY,
  );
  const [scheduledAt, setScheduledAt] = useState(
    initial?.scheduledAt ?? prefillDate ?? "",
  );
  const [media, setMedia] = useState<MediaItem[]>(initialMedia);
  const [doc, setDoc] = useState<MediaItem | null>(initialDoc);
  const [link, setLink] = useState<LinkData>({
    url: initial?.link?.url ?? "",
    title: initial?.link?.title ?? "",
    description: initial?.link?.description ?? "",
  });
  const [poll, setPoll] = useState<PollData>(
    initial?.poll ?? {
      question: "",
      options: ["", ""],
      duration: "THREE_DAYS",
    },
  );
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>(
    initial?.overrides ?? {},
  );
  const [perPlatform, setPerPlatform] = useState(
    Boolean(initial && Object.keys(initial.overrides).length > 0),
  );
  const [previewTab, setPreviewTab] = useState<Platform | null>(null);
  // "Now" is only known in the browser; the server can't render a correct
  // minimum for the picker, so it's set after mount.
  const [minDateTime, setMinDateTime] = useState<string>();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinDateTime(format(new Date(), LOCAL));
  }, []);

  const client = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId],
  );

  const postableAccounts = client?.accounts ?? [];

  // Document / link / poll are LinkedIn-only content types.
  const linkedInOnly = contentType !== "media";

  const selectedAccounts = useMemo(
    () => client?.accounts.filter((a) => selected.includes(a.id)) ?? [],
    [client, selected],
  );
  const selectedPlatforms = useMemo(() => {
    const set = new Set<Platform>();
    selectedAccounts.forEach((a) => set.add(a.platform));
    return set;
  }, [selectedAccounts]);

  const bodyFor = (accountId: string) =>
    perPlatform ? (overrides[accountId] ?? body) : body;

  const igSelected = selectedPlatforms.has("INSTAGRAM");
  const ytSelected = selectedPlatforms.has("YOUTUBE");
  const hasVideo = media.some((m) => m.type === "VIDEO");
  // Same cleaning + budget rules the server enforces (src/lib/youtube-tags.ts),
  // so the counter can't disagree with what gets accepted.
  const tags = useMemo(() => cleanYoutubeTags(tagsText.split(",")), [tagsText]);
  const tagsCost = youtubeTagsCost(tags);
  const tagsProblem = youtubeTagsProblem(tags);
  const limit = useMemo(() => {
    const limits = [...selectedPlatforms].map((p) => PLATFORM_LIMITS[p]);
    return limits.length ? Math.min(...limits) : DEFAULT_LIMIT;
  }, [selectedPlatforms]);
  const hasIgAccount = client?.accounts.some((a) => a.platform === "INSTAGRAM");

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
  const scheduleValid =
    scheduledDate !== null && !Number.isNaN(scheduledDate.getTime());

  function changeType(t: ContentType) {
    setContentType(t);
    if (t !== "media") {
      // Document / link / poll are LinkedIn-only - drop non-LinkedIn accounts.
      setSelected((s) =>
        s.filter(
          (id) =>
            client?.accounts.find((a) => a.id === id)?.platform === "LINKEDIN",
        ),
      );
      setPerPlatform(false);
    }
  }

  function toggleAccount(id: string) {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  }

  async function uploadFiles(files: File[], as: "media" | "doc") {
    if (files.length === 0) return;
    setUploading(true);
    const t = toast.loading(
      files.length > 1 ? `Uploading ${files.length} files…` : "Uploading…",
    );
    try {
      for (const file of files) {
        // 1. Authorize the upload and mint a short-lived presigned PUT.
        const presignRes = await fetch("/api/upload/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            size: file.size,
          }),
        });
        if (!presignRes.ok) throw new Error(await readError(presignRes));
        const { uploadUrl, ...item } =
          (await presignRes.json()) as MediaItem & {
            uploadUrl: string;
          };

        // 2. Send the bytes straight to R2. Going direct is what allows files
        //    past the ~4.5 MB cap on requests routed through a function.
        //    A CORS failure rejects the fetch outright, hence the catch.
        const put = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        }).catch(() => null);
        if (!put?.ok) {
          throw new Error(
            `Could not upload ${file.name} to storage${put ? ` (${put.status})` : ""}. If this keeps happening, check the R2 bucket's CORS policy.`,
          );
        }

        if (as === "doc") {
          setDoc(item);
          break; // one document per post
        }
        setMedia((m) => [...m, item]);
      }
      toast.success(as === "doc" ? "Document added" : "Media added", { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed", { id: t });
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent, as: "media" | "doc") {
    e.preventDefault();
    setDragging(false);
    if (uploading) return;
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      as === "doc"
        ? /\.(pdf|pptx?|docx?)$/i.test(f.name)
        : f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
    if (files.length === 0) {
      toast.error(
        as === "doc"
          ? "Drop a PDF, PowerPoint or Word file"
          : "Drop images or videos",
      );
      return;
    }
    uploadFiles(files, as);
  }

  function submit(action: "draft" | "schedule" | "now") {
    if (!clientId) return toast.error("Pick a client");
    if (selected.length === 0)
      return toast.error("Select at least one account");
    if (!body.trim()) return toast.error("Write something first");

    for (const a of selectedAccounts) {
      const b = bodyFor(a.id).trim();
      if (!b) return toast.error(`Write a caption for ${a.displayName}`);
      if (b.length > PLATFORM_LIMITS[a.platform]) {
        return toast.error(
          `${a.displayName}: caption is over the ${PLATFORM_LIMITS[a.platform]}-character limit`,
        );
      }
    }

    if (contentType === "media") {
      if (igSelected && media.length === 0 && action !== "draft") {
        return toast.error("Instagram posts need at least one image or video");
      }
      // Checked for drafts too: the server rejects bad tags whatever the action.
      if (ytSelected && tagsProblem) return toast.error(tagsProblem);
      if (ytSelected && action !== "draft") {
        if (!hasVideo) return toast.error("YouTube needs a video to upload");
        if (!title.trim()) {
          return toast.error("Add a title for your YouTube video");
        }
      }
    } else if (contentType === "document") {
      if (!doc && action !== "draft") return toast.error("Upload a document");
    } else if (contentType === "link") {
      if (!link.url.trim()) return toast.error("Enter a link URL");
      try {
        new URL(link.url);
      } catch {
        return toast.error("Enter a valid URL including https://");
      }
    } else if (contentType === "poll") {
      if (!poll.question.trim()) return toast.error("Enter a poll question");
      if (poll.options.map((o) => o.trim()).filter(Boolean).length < 2) {
        return toast.error("A poll needs at least 2 options");
      }
    }

    if (action === "schedule" && !scheduledAt)
      return toast.error("Pick a date and time");

    const payload = {
      clientId,
      body,
      title: ytSelected ? title.trim() || undefined : undefined,
      youtubePrivacy: ytSelected ? youtubePrivacy : undefined,
      // Undefined when YouTube isn't targeted, which clears them on edit.
      youtubeTags: ytSelected ? tags : undefined,
      youtubeCategoryId: ytSelected ? youtubeCategoryId : undefined,
      accountIds: selected,
      action,
      scheduledAt:
        action === "schedule" ? new Date(scheduledAt).toISOString() : null,
      media:
        contentType === "media"
          ? media
          : contentType === "document" && doc
            ? [doc]
            : [],
      link:
        contentType === "link"
          ? {
              url: link.url.trim(),
              title: link.title?.trim() || undefined,
              description: link.description?.trim() || undefined,
            }
          : null,
      poll:
        contentType === "poll"
          ? {
              question: poll.question.trim(),
              options: poll.options.map((o) => o.trim()).filter(Boolean),
              duration: poll.duration,
            }
          : null,
      overrides:
        contentType === "media" && perPlatform
          ? selected
              .filter((id) => overrides[id] !== undefined)
              .map((id) => ({ accountId: id, body: overrides[id] }))
          : undefined,
    };

    const t = toast.loading(
      action === "now"
        ? "Publishing…"
        : action === "schedule"
          ? editing
            ? "Rescheduling…"
            : "Scheduling…"
          : "Saving draft…",
    );
    startTransition(async () => {
      try {
        if (editing && initial) await updatePost(initial.id, payload);
        else await savePost(payload);
        toast.success(
          action === "now"
            ? "Publishing…"
            : action === "schedule"
              ? editing
                ? "Rescheduled!"
                : "Scheduled!"
              : editing
                ? "Draft updated"
                : "Saved as draft",
          { id: t },
        );
        router.push(action === "draft" ? "/queue" : "/calendar");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong", {
          id: t,
        });
      }
    });
  }

  const busy = pending || uploading;
  const previewImages =
    contentType === "media"
      ? media.filter((m) => m.type === "IMAGE").map((m) => m.url)
      : [];
  const previewVideo =
    contentType === "media"
      ? media.find((m) => m.type === "VIDEO")?.url
      : undefined;
  const previewDoc =
    contentType === "document" && doc ? (doc.title ?? "Document") : undefined;
  const previewLink =
    contentType === "link" && link.url.trim()
      ? { url: link.url, title: link.title, description: link.description }
      : undefined;
  const previewPoll =
    contentType === "poll"
      ? {
          question: poll.question,
          options: poll.options,
          duration: poll.duration,
        }
      : undefined;

  // Which network the preview shows: the chosen tab if it's still targeted,
  // else the first targeted network, else LinkedIn as a neutral default.
  const platformsList = [...selectedPlatforms];
  const shownPlatform: Platform =
    previewTab && selectedPlatforms.has(previewTab)
      ? previewTab
      : (platformsList[0] ?? "LINKEDIN");
  const shownAccount = selectedAccounts.find((a) => a.platform === shownPlatform);

  // A short "what's missing" line for the action bar.
  const blockers = [
    !clientId && "pick a client",
    selected.length === 0 && "choose an account",
    !body.trim() && "write a caption",
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* ---------------- Editor ---------------- */}
        <div className="min-w-0 space-y-4">
          <Step
            n="01"
            title="Who it's for"
            hint={
              selected.length > 0
                ? `${selected.length} account${selected.length === 1 ? "" : "s"} selected`
                : undefined
            }
          >
            <div className="space-y-5">
              <div>
                <FieldLabel>Client</FieldLabel>
                <Select
                  value={clientId}
                  items={Object.fromEntries(clients.map((c) => [c.id, c.name]))}
                  onValueChange={(v) => {
                    setClientId((v as string) ?? "");
                    setSelected([]);
                  }}
                >
                  <SelectTrigger className="h-10 w-full">
                    {client && <ClientDot color={client.color} />}
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <ClientDot color={c.color} />
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <FieldLabel>Publish to</FieldLabel>
                {postableAccounts.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {postableAccounts.map((a) => {
                      const on = selected.includes(a.id);
                      const disabled = linkedInOnly && a.platform !== "LINKEDIN";
                      const meta = PLATFORM_META[a.platform];
                      return (
                        <button
                          key={a.id}
                          type="button"
                          disabled={disabled}
                          aria-pressed={on}
                          onClick={() => !disabled && toggleAccount(a.id)}
                          title={disabled ? "LinkedIn only" : undefined}
                          className={cn(
                            "group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                            disabled && "cursor-not-allowed opacity-40",
                            on
                              ? "border-primary/60 bg-primary/[0.05] shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_12%,transparent)]"
                              : "bg-background hover:border-[color-mix(in_oklch,var(--border),var(--foreground)_16%)]",
                          )}
                        >
                          <span
                            className={cn(
                              "grid size-9 shrink-0 place-items-center rounded-lg transition-colors",
                              on ? "bg-card shadow-[0_0_0_1px_var(--border)]" : "bg-muted",
                            )}
                          >
                            <PlatformIcon
                              platform={a.platform}
                              brand={on}
                              className="size-[1.1rem]"
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {a.displayName}
                            </span>
                            <span className="text-muted-foreground block text-xs">
                              {meta.label}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "grid size-5 shrink-0 place-items-center rounded-full transition-all",
                              on
                                ? "bg-primary text-primary-foreground scale-100"
                                : "scale-90 shadow-[inset_0_0_0_1.5px_var(--border)]",
                            )}
                          >
                            {on && <Check className="size-3" strokeWidth={3} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-muted-foreground rounded-xl border border-dashed px-4 py-5 text-center text-sm">
                    {client ? `${client.name} has no connected accounts yet.` : "No client selected."}{" "}
                    <Link href="/clients" className="text-primary font-medium hover:underline">
                      Connect one
                    </Link>
                  </div>
                )}
                {linkedInOnly && hasIgAccount && (
                  <p className="text-muted-foreground mt-2 text-xs">
                    {CONTENT_TYPES.find((t) => t.key === contentType)?.label}{" "}
                    posts are supported on LinkedIn only.
                  </p>
                )}
              </div>
            </div>
          </Step>

          <Step n="02" title="What it says">
            {/* Content-type segmented control */}
            <div className="bg-muted relative mb-4 flex gap-0.5 rounded-xl p-1 text-sm">
              {CONTENT_TYPES.map((t) => {
                const active = contentType === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => changeType(t.key)}
                    aria-label={t.label}
                    aria-pressed={active}
                    className={cn(
                      "relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="content-type-pill"
                        className="bg-card absolute inset-0 rounded-lg shadow-[0_0_0_1px_var(--border),0_1px_2px_0_rgb(20_20_40/0.06)]"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                    <t.icon className="relative size-4" />
                    <span className="relative hidden sm:inline">{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Writing surface */}
            <div className="bg-background focus-within:border-ring focus-within:ring-ring/15 rounded-xl border transition-[border-color,box-shadow] focus-within:ring-4">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
                placeholder="What do you want to say?"
                aria-label="Caption"
                className="min-h-44 resize-none border-0 bg-transparent px-4 pt-3.5 text-[0.9375rem] shadow-none hover:border-0 focus-visible:ring-0 dark:bg-transparent"
              />
              <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
                <div className="flex items-center gap-1">
                  {contentType === "media" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                    >
                      {uploading ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <ImagePlus />
                      )}
                      Add media
                    </Button>
                  )}
                  {contentType === "media" && igSelected && media.length === 0 && (
                    <span className="text-standby-ink flex items-center gap-1 text-xs">
                      <AlertTriangle className="size-3.5" />
                      Instagram needs an image or video
                    </span>
                  )}
                </div>
                <CharRing used={body.length} limit={limit} />
              </div>
            </div>

            {contentType === "media" && selectedPlatforms.size > 1 && (
              <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
                <div>
                  <Label
                    htmlFor="per-platform-switch"
                    className="cursor-pointer text-sm"
                  >
                    Tailor the caption per network
                  </Label>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Start from the caption above, then edit each one.
                  </p>
                </div>
                <Switch
                  id="per-platform-switch"
                  checked={perPlatform}
                  onCheckedChange={setPerPlatform}
                />
              </div>
            )}

            <AnimatePresence initial={false}>
              {contentType === "media" && perPlatform && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 pt-4">
                    {selectedAccounts.map((a) => {
                      const val = overrides[a.id] ?? body;
                      const lim = PLATFORM_LIMITS[a.platform];
                      return (
                        <div key={a.id} className="bg-background rounded-xl border">
                          <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-medium">
                            <PlatformIcon platform={a.platform} brand />
                            {a.displayName}
                            <span className="ml-auto">
                              <CharRing used={val.length} limit={lim} />
                            </span>
                          </div>
                          <Textarea
                            value={val}
                            aria-label={`Caption for ${a.displayName}`}
                            onChange={(e) =>
                              setOverrides((o) => ({
                                ...o,
                                [a.id]: e.target.value.slice(0, MAX_BODY),
                              }))
                            }
                            className="min-h-28 resize-none border-0 bg-transparent px-4 shadow-none hover:border-0 focus-visible:ring-0 dark:bg-transparent"
                          />
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* --- Media --- */}
            {contentType === "media" && (
              <div className="mt-4">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    uploadFiles(Array.from(e.target.files ?? []), "media");
                    e.target.value = "";
                  }}
                />
                {media.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2.5">
                    {media.map((m, i) => (
                      <motion.div
                        key={m.storageKey}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="group relative"
                      >
                        {m.type === "IMAGE" ? (
                          <Image
                            src={m.url}
                            alt=""
                            width={96}
                            height={96}
                            className="size-24 rounded-xl object-cover shadow-[0_0_0_1px_var(--border)]"
                          />
                        ) : (
                          <div className="bg-foreground text-background grid size-24 place-items-center rounded-xl">
                            <span className="flex flex-col items-center gap-1 text-xs font-medium">
                              <Film className="size-5" /> Video
                            </span>
                          </div>
                        )}
                        <span className="bg-background/90 absolute bottom-1.5 left-1.5 rounded-md px-1.5 font-mono text-[0.625rem] backdrop-blur">
                          {i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setMedia((arr) => arr.filter((_, j) => j !== i))
                          }
                          className="bg-foreground text-background absolute -top-2 -right-2 grid size-6 place-items-center rounded-full opacity-0 shadow-md transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label="Remove media"
                        >
                          <X className="size-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => onDrop(e, "media")}
                  className={cn(
                    "text-muted-foreground flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                    dragging
                      ? "border-primary bg-primary/[0.05] text-primary"
                      : "hover:border-[color-mix(in_oklch,var(--border),var(--foreground)_20%)] hover:bg-muted/40",
                  )}
                >
                  {uploading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <UploadCloud className="size-5" />
                  )}
                  <span>
                    <span className="text-foreground font-medium">
                      Drop images or video
                    </span>{" "}
                    or click to browse
                  </span>
                  <span className="text-xs">
                    {media.length >= 2
                      ? "LinkedIn posts several images as a gallery."
                      : "Up to 512 MB per file."}
                  </span>
                </button>
              </div>
            )}

            {/* --- Document --- */}
            {contentType === "document" && (
              <div className="mt-4">
                <FieldLabel>Document</FieldLabel>
                {doc ? (
                  <div className="bg-background flex items-center gap-3 rounded-xl border p-3 text-sm">
                    <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
                      <FileText className="text-muted-foreground size-5" />
                    </span>
                    <span className="flex-1 truncate font-medium">
                      {doc.title ?? "Document"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDoc(null)}
                      aria-label="Remove document"
                    >
                      <X />
                    </Button>
                  </div>
                ) : (
                  <>
                    <input
                      ref={docRef}
                      type="file"
                      accept="application/pdf,.pdf,.ppt,.pptx,.doc,.docx"
                      hidden
                      onChange={(e) => {
                        uploadFiles(Array.from(e.target.files ?? []), "doc");
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => docRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => onDrop(e, "doc")}
                      className={cn(
                        "text-muted-foreground flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-sm transition-colors",
                        dragging
                          ? "border-primary bg-primary/[0.05] text-primary"
                          : "hover:bg-muted/40",
                      )}
                    >
                      {uploading ? (
                        <Loader2 className="size-5 animate-spin" />
                      ) : (
                        <FileText className="size-5" />
                      )}
                      <span>
                        <span className="text-foreground font-medium">
                          Drop a document
                        </span>{" "}
                        or click to browse
                      </span>
                    </button>
                  </>
                )}
                <p className="text-muted-foreground mt-2 text-xs">
                  PDF, PPT or DOC. LinkedIn renders it as a swipeable carousel.
                </p>
              </div>
            )}

            {/* --- Link --- */}
            {contentType === "link" && (
              <div className="mt-4 grid gap-4">
                <div>
                  <FieldLabel>Link URL</FieldLabel>
                  <Input
                    type="url"
                    value={link.url}
                    onChange={(e) =>
                      setLink((l) => ({ ...l, url: e.target.value }))
                    }
                    placeholder="https://example.com/article"
                  />
                </div>
                <div>
                  <FieldLabel>Preview title</FieldLabel>
                  <Input
                    value={link.title ?? ""}
                    onChange={(e) =>
                      setLink((l) => ({ ...l, title: e.target.value }))
                    }
                    placeholder="Headline shown on the link card"
                  />
                </div>
                <div>
                  <FieldLabel>Preview description</FieldLabel>
                  <Textarea
                    value={link.description ?? ""}
                    onChange={(e) =>
                      setLink((l) => ({ ...l, description: e.target.value }))
                    }
                    className="min-h-16 resize-none"
                    placeholder="Short description shown on the link card"
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  LinkedIn won&apos;t fetch these automatically, so set them to
                  control the preview card.
                </p>
              </div>
            )}

            {/* --- Poll --- */}
            {contentType === "poll" && (
              <div className="mt-4 grid gap-4">
                <div>
                  <div className="flex items-baseline justify-between">
                    <FieldLabel>Question</FieldLabel>
                    <span className="text-muted-foreground font-mono text-[0.6875rem]">
                      {poll.question.length}/140
                    </span>
                  </div>
                  <Input
                    value={poll.question}
                    maxLength={140}
                    onChange={(e) =>
                      setPoll((p) => ({ ...p, question: e.target.value }))
                    }
                    placeholder="Ask your audience…"
                  />
                </div>
                <div>
                  <FieldLabel>Options</FieldLabel>
                  <div className="space-y-2">
                    {poll.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-muted-foreground w-5 shrink-0 font-mono text-xs">
                          {String.fromCharCode(65 + i)}
                        </span>
                        <Input
                          value={opt}
                          maxLength={30}
                          onChange={(e) =>
                            setPoll((p) => ({
                              ...p,
                              options: p.options.map((o, j) =>
                                j === i ? e.target.value : o,
                              ),
                            }))
                          }
                          placeholder={`Option ${i + 1}`}
                        />
                        {poll.options.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Remove option"
                            onClick={() =>
                              setPoll((p) => ({
                                ...p,
                                options: p.options.filter((_, j) => j !== i),
                              }))
                            }
                          >
                            <X />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {poll.options.length < 4 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 ml-5"
                      onClick={() =>
                        setPoll((p) => ({ ...p, options: [...p.options, ""] }))
                      }
                    >
                      <Plus /> Add option
                    </Button>
                  )}
                </div>
                <div>
                  <FieldLabel>Duration</FieldLabel>
                  <Select
                    value={poll.duration}
                    items={Object.fromEntries(
                      POLL_DURATIONS.map((d) => [d.value, d.label]),
                    )}
                    onValueChange={(v) =>
                      setPoll((p) => ({ ...p, duration: v as PollDuration }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POLL_DURATIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-standby-ink text-xs">
                  Polls can&apos;t be edited once published.
                </p>
              </div>
            )}
          </Step>

          {/* --- YouTube video details --- */}
          <AnimatePresence initial={false}>
            {contentType === "media" && ytSelected && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
              >
                <Step
                  n="02b"
                  title="YouTube details"
                  hint={
                    <span className="flex items-center gap-1.5">
                      <PlatformIcon platform="YOUTUBE" brand className="size-3.5" />
                      Uploads as a video
                    </span>
                  }
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <div className="flex items-baseline justify-between">
                        <FieldLabel>Video title</FieldLabel>
                        <span className="text-muted-foreground font-mono text-[0.6875rem]">
                          {title.length}/100
                        </span>
                      </div>
                      <Input
                        value={title}
                        maxLength={100}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Title shown on YouTube"
                      />
                    </div>
                    <div>
                      <FieldLabel>Visibility</FieldLabel>
                      <Select
                        value={youtubePrivacy}
                        items={Object.fromEntries(
                          YT_PRIVACY.map((p) => [p.value, p.label]),
                        )}
                        onValueChange={(v) => setYoutubePrivacy(v as YtPrivacy)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {YT_PRIVACY.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <FieldLabel>Category</FieldLabel>
                      <Select
                        value={youtubeCategoryId}
                        items={Object.fromEntries(
                          YOUTUBE_CATEGORIES.map((c) => [c.id, c.label]),
                        )}
                        onValueChange={(v) =>
                          setYoutubeCategoryId(
                            (v as string) || DEFAULT_YOUTUBE_CATEGORY,
                          )
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {YOUTUBE_CATEGORIES.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <div className="flex items-baseline justify-between">
                        <FieldLabel>Tags</FieldLabel>
                        {/* Budget, not character count: a tag with a space costs 2
                            extra because YouTube stores it in quotes. */}
                        <span
                          className={cn(
                            "text-muted-foreground font-mono text-[0.6875rem]",
                            tagsCost > YOUTUBE_TAG_BUDGET && "text-fault-ink font-medium",
                          )}
                        >
                          {tagsCost}/{YOUTUBE_TAG_BUDGET}
                        </span>
                      </div>
                      <Input
                        value={tagsText}
                        onChange={(e) => setTagsText(e.target.value)}
                        placeholder="Comma-separated, e.g. shorts, ai art, timelapse"
                      />
                      {tags.length > 0 && !tagsProblem && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {tags.map((t) => (
                            <span
                              key={t}
                              className="bg-muted rounded-md px-2 py-0.5 text-xs"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {tagsProblem && (
                        <p className="text-fault-ink mt-1.5 text-xs">{tagsProblem}</p>
                      )}
                    </div>
                  </div>
                  {!hasVideo && (
                    <p className="text-standby-ink mt-4 flex items-center gap-1.5 text-xs">
                      <AlertTriangle className="size-3.5" />
                      YouTube needs a video. Add one in step 02.
                    </p>
                  )}
                </Step>
              </motion.div>
            )}
          </AnimatePresence>

          <Step n="03" title="When it goes out">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const active =
                  scheduledAt !== "" && scheduledAt === format(p.at(), LOCAL);
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setScheduledAt(format(p.at(), LOCAL))}
                    suppressHydrationWarning
                    className={cn(
                      "h-8 rounded-full border px-3 text-[0.8125rem] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:bg-accent",
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-center">
              <Input
                type="datetime-local"
                aria-label="Schedule for"
                min={minDateTime}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="h-10 font-mono text-sm"
              />
              {scheduleValid && scheduledDate ? (
                <p className="text-sm">
                  <span className="text-muted-foreground">Goes out </span>
                  <span className="font-medium">
                    {format(scheduledDate, "EEEE d MMMM, h:mm a")}
                  </span>
                  <span className="text-muted-foreground"> · in </span>
                  <Countdown to={scheduledDate} className="text-primary text-xs" />
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Pick a time, or use{" "}
                  <span className="text-foreground font-medium">Post now</span>{" "}
                  to publish straight away.
                </p>
              )}
            </div>
          </Step>

          {/* Action bar: sticks to the bottom of the viewport while editing. */}
          <div className="bg-background/80 supports-backdrop-filter:bg-background/70 sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-2xl border p-3 shadow-float backdrop-blur-xl">
            <div className="hidden min-w-0 flex-1 px-1 text-xs sm:block">
              {blockers.length > 0 ? (
                <span className="text-muted-foreground">
                  To continue, {blockers.join(", ")}.
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="tally text-live" data-live="true" />
                  <span className="text-muted-foreground truncate">
                    Ready for{" "}
                    <span className="text-foreground font-medium">
                      {selected.length} account{selected.length === 1 ? "" : "s"}
                    </span>
                    {client ? ` · ${client.name}` : ""}
                  </span>
                </span>
              )}
            </div>
            {/* Phones: Schedule gets its own full-width row, the others share one. */}
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto [&>*]:min-w-0">
              <Button
                variant="ghost"
                onClick={() => submit("draft")}
                disabled={busy}
              >
                <Save /> <span className="sm:hidden">Draft</span>
                <span className="hidden sm:inline">Save draft</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => submit("now")}
                disabled={busy}
              >
                <Send /> Post now
              </Button>
              <Button
                onClick={() => submit("schedule")}
                disabled={busy}
                className="order-first col-span-2 sm:order-none"
              >
                {pending ? <Loader2 className="animate-spin" /> : <CalendarClock />}
                {editing ? "Reschedule" : "Schedule"}
              </Button>
            </div>
          </div>
        </div>

        {/* ---------------- Preview ---------------- */}
        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="mb-3 flex items-center justify-between">
            <span className="label-caps">Live preview</span>
            {platformsList.length > 1 && (
              <div className="bg-muted flex gap-0.5 rounded-lg p-0.5">
                {platformsList.map((p) => {
                  const active = p === shownPlatform;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPreviewTab(p)}
                      aria-pressed={active}
                      aria-label={`${PLATFORM_META[p].label} preview`}
                      className={cn(
                        "relative grid h-7 w-9 place-items-center rounded-md transition-colors",
                        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="preview-tab"
                          className="bg-card absolute inset-0 rounded-md shadow-[0_0_0_1px_var(--border)]"
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        />
                      )}
                      <PlatformIcon platform={p} brand={active} className="relative size-3.5" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="bg-canvas/60 rounded-2xl border p-3 sm:p-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={shownPlatform}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <ExpandablePreview
                  platform={shownPlatform}
                  name={client?.name ?? "Client"}
                  color={client?.color}
                  body={shownAccount ? bodyFor(shownAccount.id) : body}
                  title={title}
                  images={previewImages}
                  videoUrl={previewVideo}
                  documentTitle={previewDoc}
                  documentUrl={contentType === "document" ? doc?.url : undefined}
                  link={previewLink}
                  poll={previewPoll}
                />
              </motion.div>
            </AnimatePresence>
          </div>
          <p className="text-muted-foreground mt-3 px-1 text-xs leading-relaxed">
            Previews approximate each network&apos;s feed. Final rendering is up
            to the platform.
          </p>
        </aside>
      </div>
    </div>
  );
}
