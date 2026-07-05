"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";
import type { Platform } from "@prisma/client";
import { savePost, updatePost } from "@/lib/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PlatformIcon } from "@/components/post-bits";
import { ExpandablePreview } from "@/components/post-preview";
import { cn } from "@/lib/utils";
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

export interface ComposerInitial {
  id: string;
  clientId: string;
  body: string;
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
};
const HARD_LIMIT = 3000;

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
  const [overrides, setOverrides] = useState<Record<string, string>>(
    initial?.overrides ?? {},
  );
  const [perPlatform, setPerPlatform] = useState(
    Boolean(initial && Object.keys(initial.overrides).length > 0),
  );

  const client = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId],
  );

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
  const limit = useMemo(() => {
    const limits = [...selectedPlatforms].map((p) => PLATFORM_LIMITS[p]);
    return limits.length ? Math.min(...limits) : HARD_LIMIT;
  }, [selectedPlatforms]);
  const overLimit = body.length > limit;
  const hasIgAccount = client?.accounts.some((a) => a.platform === "INSTAGRAM");

  const minDateTime = format(new Date(), "yyyy-MM-dd'T'HH:mm");

  function changeType(t: ContentType) {
    setContentType(t);
    if (t !== "media") {
      // Deselect Instagram - these content types are LinkedIn-only.
      setSelected((s) =>
        s.filter(
          (id) =>
            client?.accounts.find((a) => a.id === id)?.platform !== "INSTAGRAM",
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
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          throw new Error((await res.json()).error ?? "Upload failed");
        }
        const data = (await res.json()) as MediaItem;
        if (as === "doc") {
          setDoc(data);
          break; // one document per post
        }
        setMedia((m) => [...m, data]);
      }
      toast.success(as === "doc" ? "Document added" : "Media added", { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed", { id: t });
    } finally {
      setUploading(false);
    }
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

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_360px]">
      {/* Editor */}
      <Card>
        <CardHeader>
          <CardTitle>{editing ? "Edit post" : "Create a post"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="label-caps">Client</Label>
            <Select
              value={clientId}
              items={Object.fromEntries(clients.map((c) => [c.id, c.name]))}
              onValueChange={(v) => {
                setClientId((v as string) ?? "");
                setSelected([]);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Content-type tabs */}
          <div className="bg-muted flex gap-0.5 rounded-lg p-0.5 text-sm">
            {CONTENT_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => changeType(t.key)}
                aria-label={t.label}
                aria-pressed={contentType === t.key}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 font-medium transition-colors",
                  contentType === t.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="size-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label className="label-caps">Publish to</Label>
            {client && client.accounts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {client.accounts.map((a) => {
                  const on = selected.includes(a.id);
                  const disabled = linkedInOnly && a.platform === "INSTAGRAM";
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={on}
                      onClick={() => !disabled && toggleAccount(a.id)}
                      title={disabled ? "LinkedIn only" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                        disabled && "cursor-not-allowed opacity-40",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      <PlatformIcon
                        platform={a.platform}
                        className="shrink-0"
                      />
                      <span className="max-w-40 truncate">{a.displayName}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No accounts connected.{" "}
                <Link href={`/clients`} className="text-primary underline">
                  Connect one
                </Link>
                .
              </p>
            )}
            {linkedInOnly && hasIgAccount && (
              <p className="text-muted-foreground text-xs">
                {CONTENT_TYPES.find((t) => t.key === contentType)?.label} posts
                are supported on LinkedIn only.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="label-caps">Content</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, HARD_LIMIT))}
              placeholder="What do you want to share?"
              className="min-h-32 resize-none"
            />
            <div className="flex items-center justify-between text-xs">
              {contentType === "media" && igSelected && media.length === 0 ? (
                <span className="text-amber-600 dark:text-amber-400">
                  Instagram needs an image or video
                </span>
              ) : (
                <span />
              )}
              <span
                className={cn(
                  "text-muted-foreground",
                  overLimit && "text-destructive font-medium",
                )}
              >
                {body.length}/{limit}
              </span>
            </div>
          </div>

          {contentType === "media" && selectedPlatforms.size > 1 && (
            <div className="flex items-center justify-between">
              <Label
                htmlFor="per-platform-switch"
                className="cursor-pointer text-sm"
              >
                Customize caption per platform
              </Label>
              <Switch
                id="per-platform-switch"
                checked={perPlatform}
                onCheckedChange={setPerPlatform}
              />
            </div>
          )}

          {contentType === "media" &&
            perPlatform &&
            selectedAccounts.map((a) => {
              const val = overrides[a.id] ?? body;
              const lim = PLATFORM_LIMITS[a.platform];
              const over = val.length > lim;
              return (
                <div key={a.id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <PlatformIcon platform={a.platform} />
                    {a.displayName}
                  </div>
                  <Textarea
                    value={val}
                    onChange={(e) =>
                      setOverrides((o) => ({
                        ...o,
                        [a.id]: e.target.value.slice(0, HARD_LIMIT),
                      }))
                    }
                    className="min-h-28 resize-none"
                  />
                  <div
                    className={cn(
                      "text-right text-xs text-muted-foreground",
                      over && "text-destructive font-medium",
                    )}
                  >
                    {val.length}/{lim}
                  </div>
                </div>
              );
            })}

          {/* --- Media --- */}
          {contentType === "media" && (
            <>
              {media.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {media.map((m, i) => (
                    <div key={m.storageKey} className="relative">
                      {m.type === "IMAGE" ? (
                        <Image
                          src={m.url}
                          alt=""
                          width={80}
                          height={80}
                          className="size-20 rounded-md object-cover"
                        />
                      ) : (
                        <div className="bg-accent grid size-20 place-items-center rounded-md text-xs">
                          Video
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setMedia((arr) => arr.filter((_, j) => j !== i))
                        }
                        className="bg-background absolute -right-2 -top-2 rounded-full border p-0.5 shadow"
                        aria-label="Remove media"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div>
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ImagePlus className="size-4" />
                  )}
                  Add media
                </Button>
                {media.length >= 2 && (
                  <p className="text-muted-foreground mt-1.5 text-xs">
                    LinkedIn will post these as an image gallery.
                  </p>
                )}
              </div>
            </>
          )}

          {/* --- Document --- */}
          {contentType === "document" && (
            <div className="space-y-2">
              <Label className="label-caps">Document</Label>
              {doc ? (
                <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <FileText className="text-muted-foreground size-5 shrink-0" />
                  <span className="flex-1 truncate">
                    {doc.title ?? "Document"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDoc(null)}
                    aria-label="Remove document"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => docRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <FileText className="size-4" />
                    )}
                    Upload document
                  </Button>
                </>
              )}
              <p className="text-muted-foreground text-xs">
                PDF, PPT or DOC - LinkedIn renders it as a swipeable carousel.
              </p>
            </div>
          )}

          {/* --- Link --- */}
          {contentType === "link" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="label-caps">Link URL</Label>
                <Input
                  type="url"
                  value={link.url}
                  onChange={(e) =>
                    setLink((l) => ({ ...l, url: e.target.value }))
                  }
                  placeholder="https://example.com/article"
                />
              </div>
              <div className="space-y-2">
                <Label className="label-caps">Preview title</Label>
                <Input
                  value={link.title ?? ""}
                  onChange={(e) =>
                    setLink((l) => ({ ...l, title: e.target.value }))
                  }
                  placeholder="Headline shown on the link card"
                />
              </div>
              <div className="space-y-2">
                <Label className="label-caps">Preview description</Label>
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
                LinkedIn won&apos;t fetch these automatically - set them to
                control the preview card.
              </p>
            </div>
          )}

          {/* --- Poll --- */}
          {contentType === "poll" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="label-caps">Question</Label>
                <Input
                  value={poll.question}
                  maxLength={140}
                  onChange={(e) =>
                    setPoll((p) => ({ ...p, question: e.target.value }))
                  }
                  placeholder="Ask your audience…"
                />
                <div className="text-muted-foreground text-right text-xs">
                  {poll.question.length}/140
                </div>
              </div>
              <div className="space-y-2">
                <Label className="label-caps">Options</Label>
                {poll.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
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
                      <button
                        type="button"
                        aria-label="Remove option"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setPoll((p) => ({
                            ...p,
                            options: p.options.filter((_, j) => j !== i),
                          }))
                        }
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
                {poll.options.length < 4 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPoll((p) => ({ ...p, options: [...p.options, ""] }))
                    }
                  >
                    <Plus className="size-4" /> Add option
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Label className="label-caps">Duration</Label>
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
              <p className="text-amber-600 dark:text-amber-400 text-xs">
                Polls can&apos;t be edited once published.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="label-caps">Schedule for</Label>
            <Input
              type="datetime-local"
              min={minDateTime}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={() => submit("schedule")} disabled={busy}>
              <CalendarClock className="size-4" />{" "}
              {editing ? "Reschedule" : "Schedule"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => submit("now")}
              disabled={busy}
            >
              <Send className="size-4" /> Post now
            </Button>
            <Button
              variant="outline"
              onClick={() => submit("draft")}
              disabled={busy}
            >
              <Save className="size-4" /> Save draft
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <div className="space-y-3">
        <Label className="label-caps">Preview</Label>
        <motion.div layout className="space-y-3">
          {selectedPlatforms.size === 0 ? (
            <ExpandablePreview
              platform="LINKEDIN"
              name={client?.name ?? "Client"}
              color={client?.color}
              body={body}
              images={previewImages}
              videoUrl={previewVideo}
              documentTitle={previewDoc}
              documentUrl={contentType === "document" ? doc?.url : undefined}
              link={previewLink}
              poll={previewPoll}
            />
          ) : (
            [...selectedPlatforms].map((platform) => {
              const acct = selectedAccounts.find(
                (a) => a.platform === platform,
              );
              const b = acct ? bodyFor(acct.id) : body;
              return (
                <ExpandablePreview
                  key={platform}
                  platform={platform}
                  name={client?.name ?? "Client"}
                  color={client?.color}
                  body={b}
                  images={previewImages}
                  videoUrl={previewVideo}
                  documentTitle={previewDoc}
                  link={previewLink}
                  poll={previewPoll}
                />
              );
            })
          )}
        </motion.div>
      </div>
    </div>
  );
}
