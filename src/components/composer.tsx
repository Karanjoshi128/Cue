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
import { PlatformIcon } from "@/components/post-bits";
import { PostPreview } from "@/components/post-preview";
import { cn } from "@/lib/utils";
import { ImagePlus, Loader2, X, Send, CalendarClock, Save } from "lucide-react";

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
type MediaItem = { type: "IMAGE" | "VIDEO"; url: string; storageKey: string };

export interface ComposerInitial {
  id: string;
  clientId: string;
  body: string;
  accountIds: string[];
  scheduledAt: string; // datetime-local string, or ""
  media: MediaItem[];
}

// Per-platform caption limits — the effective cap is the smallest of the
// platforms the post targets.
const PLATFORM_LIMITS: Record<Platform, number> = {
  LINKEDIN: 3000,
  INSTAGRAM: 2200,
};
const HARD_LIMIT = 3000;

export function Composer({
  clients,
  initial,
  prefillDate,
}: {
  clients: ClientLite[];
  initial?: ComposerInitial;
  prefillDate?: string;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [clientId, setClientId] = useState(
    initial?.clientId ?? clients[0]?.id ?? "",
  );
  const [selected, setSelected] = useState<string[]>(initial?.accountIds ?? []);
  const [body, setBody] = useState(initial?.body ?? "");
  const [scheduledAt, setScheduledAt] = useState(
    initial?.scheduledAt ?? prefillDate ?? "",
  );
  const [media, setMedia] = useState<MediaItem[]>(initial?.media ?? []);
  const [uploading, setUploading] = useState(false);

  const client = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId],
  );

  const selectedPlatforms = useMemo(() => {
    const set = new Set<Platform>();
    client?.accounts.forEach((a) => {
      if (selected.includes(a.id)) set.add(a.platform);
    });
    return set;
  }, [client, selected]);

  const igSelected = selectedPlatforms.has("INSTAGRAM");
  const limit = useMemo(() => {
    const limits = [...selectedPlatforms].map((p) => PLATFORM_LIMITS[p]);
    return limits.length ? Math.min(...limits) : HARD_LIMIT;
  }, [selectedPlatforms]);
  const overLimit = body.length > limit;

  // Prevent scheduling in the past.
  const minDateTime = format(new Date(), "yyyy-MM-dd'T'HH:mm");

  function toggleAccount(id: string) {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      const data = (await res.json()) as MediaItem;
      setMedia((m) => [...m, data]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function submit(action: "draft" | "schedule" | "now") {
    if (!clientId) return toast.error("Pick a client");
    if (selected.length === 0) return toast.error("Select at least one account");
    if (!body.trim()) return toast.error("Write something first");
    if (overLimit) {
      const p = igSelected ? "Instagram" : "LinkedIn";
      return toast.error(`Caption is over the ${p} limit of ${limit} characters`);
    }
    // Instagram requires media to publish — block before it fails at publish time.
    if (igSelected && media.length === 0 && action !== "draft") {
      return toast.error("Instagram posts need at least one image or video");
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
      media,
    };

    startTransition(async () => {
      try {
        if (editing && initial) {
          await updatePost(initial.id, payload);
        } else {
          await savePost(payload);
        }
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
        );
        router.push(action === "draft" ? "/queue" : "/calendar");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const busy = pending || uploading;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_360px]">
      {/* Editor */}
      <Card>
        <CardHeader>
          <CardTitle>{editing ? "Edit post" : "Create a post"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Client</Label>
            <Select
              value={clientId}
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

          <div className="space-y-2">
            <Label>Publish to</Label>
            {client && client.accounts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {client.accounts.map((a) => {
                  const on = selected.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAccount(a.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      <PlatformIcon platform={a.platform} />
                      {a.displayName}
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
          </div>

          <div className="space-y-2">
            <Label>Content</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, HARD_LIMIT))}
              placeholder="What do you want to share?"
              className="min-h-40 resize-none"
            />
            <div className="flex items-center justify-between text-xs">
              {igSelected && media.length === 0 ? (
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
                    onClick={() => setMedia((arr) => arr.filter((_, j) => j !== i))}
                    className="bg-background absolute -right-2 -top-2 rounded-full border p-0.5 shadow"
                    aria-label="Remove media"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
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
          </div>

          <div className="space-y-2">
            <Label>Schedule for</Label>
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
        <Label className="text-muted-foreground">Preview</Label>
        <motion.div layout>
          <PostPreview
            platforms={[...selectedPlatforms]}
            name={client?.name ?? "Client"}
            color={client?.color}
            body={body}
            imageUrl={media[0]?.type === "IMAGE" ? media[0].url : undefined}
          />
        </motion.div>
      </div>
    </div>
  );
}
