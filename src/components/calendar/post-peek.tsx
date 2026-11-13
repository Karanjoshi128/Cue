"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { deletePost, duplicatePost, retryPost } from "@/lib/actions";
import {
  isEditable,
  needsApproval,
  type CalendarPost,
} from "@/lib/calendar-shared";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ClientMonogram, PlatformIcon, StatusBadge } from "@/components/post-bits";
import { cn } from "@/lib/utils";
import { useCalendar } from "./context";
import { KindGlyph } from "./post-card";
import { dayKey, zoneLabel } from "./time";

function useIsWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

/** The post, opened from the calendar without leaving it. */
export function PostPeek({
  post,
  onClose,
}: {
  post: CalendarPost | null;
  onClose: () => void;
}) {
  const wide = useIsWide();
  return (
    <Sheet open={!!post} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={wide ? "right" : "bottom"}
        className={cn(
          "gap-0 p-0",
          wide ? "w-full sm:max-w-md" : "max-h-[88dvh] rounded-t-2xl",
        )}
      >
        {post && <PeekBody key={post.id} post={post} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function PeekBody({ post, onClose }: { post: CalendarPost; onClose: () => void }) {
  const cal = useCalendar();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const when = post.scheduledAt ? new Date(post.scheduledAt) : null;
  const failed = post.status === "FAILED" || post.status === "PARTIAL";

  function duplicate() {
    start(async () => {
      const res = await duplicatePost(post.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Duplicated as a draft", {
        action: { label: "Open", onClick: () => router.push(`/composer?edit=${res.data.id}`) },
      });
      router.refresh();
    });
  }

  function retry() {
    start(async () => {
      const res = await retryPost(post.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Retrying the failed accounts");
      router.refresh();
    });
  }

  function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    start(async () => {
      try {
        await deletePost(post.id);
        toast.success("Post deleted");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete the post.");
      }
    });
  }

  async function copyLink() {
    const day = post.scheduledAt ? dayKey(post.scheduledAt, cal.ctx) : dayKey(cal.now, cal.ctx);
    const url = `${window.location.origin}/calendar?view=week&d=${day}&post=${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  const images = post.media.filter((m) => m.type === "IMAGE");
  const video = post.media.find((m) => m.type === "VIDEO");
  const doc = post.media.find((m) => m.type === "DOCUMENT");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="border-b p-5 pr-12">
        <div className="flex items-center gap-3">
          <ClientMonogram
            name={post.client.name}
            color={post.client.color}
            className="size-9 rounded-lg text-[0.6875rem]"
          />
          <div className="min-w-0">
            <SheetTitle className="truncate text-base">{post.client.name}</SheetTitle>
            <SheetDescription className="font-mono text-xs">
              {when
                ? `${format(when, "EEE d MMM yyyy, h:mm a", cal.ctx)} ${zoneLabel(cal.timeZone)}`
                : "No date yet"}
            </SheetDescription>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={post.status} />
          {needsApproval(post) && (
            <span className="bg-standby/15 text-standby-ink rounded-full px-2.5 py-0.5 text-[0.6875rem] font-medium">
              {post.approval === "CHANGES_REQUESTED" ? "Changes requested" : "Needs approval"}
            </span>
          )}
          {post.kind !== "text" && (
            <span className="text-muted-foreground flex items-center gap-1 text-[0.6875rem] capitalize">
              <KindGlyph kind={post.kind} /> {post.kind}
            </span>
          )}
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        {(images.length > 0 || video || doc) && (
          <div className="space-y-2">
            {images.length > 0 && (
              <div className={cn("grid gap-1.5", images.length > 1 ? "grid-cols-3" : "grid-cols-1")}>
                {images.slice(0, 6).map((m) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={m.url}
                    src={m.url}
                    alt=""
                    loading="lazy"
                    className={cn(
                      "w-full rounded-lg border object-cover",
                      images.length > 1 ? "aspect-square" : "max-h-64",
                    )}
                  />
                ))}
              </div>
            )}
            {video && (
              <video
                src={video.url}
                controls
                preload="metadata"
                className="max-h-72 w-full rounded-lg border bg-black"
              />
            )}
            {doc && (
              <a
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className="hover:bg-accent flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <FileText className="text-muted-foreground size-4" />
                <span className="truncate">{doc.title || "Document"}</span>
              </a>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          {post.title && <p className="font-medium">{post.title}</p>}
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.body}</p>
        </div>

        <div className="space-y-2">
          <p className="label-caps">Accounts</p>
          <ul className="divide-border divide-y rounded-xl border">
            {post.targets.map((t) => (
              <li key={t.id} className="space-y-1 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <PlatformIcon platform={t.platform} brand className="size-4" />
                  <span className="min-w-0 flex-1 truncate text-sm">{t.account}</span>
                  <StatusBadge status={t.status} />
                </div>
                {t.error && <p className="text-fault-ink text-xs leading-snug">{t.error}</p>}
                {t.permalink && (
                  <a
                    href={t.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-xs font-medium"
                  >
                    View post <ExternalLink className="size-3" />
                  </a>
                )}
              </li>
            ))}
            {post.targets.length === 0 && (
              <li className="text-muted-foreground px-3 py-2.5 text-sm">
                No accounts left: they were disconnected.
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t p-4">
        {isEditable(post) && (
          <Button render={<Link href={`/composer?edit=${post.id}`} />} size="sm">
            <Pencil /> Edit
          </Button>
        )}
        {failed && (
          <Button size="sm" onClick={retry} disabled={pending}>
            <RotateCcw /> Retry
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={duplicate} disabled={pending}>
          <Copy /> Duplicate
        </Button>
        <Button size="sm" variant="ghost" onClick={copyLink}>
          <Link2 /> Copy link
        </Button>
        <Button
          size="sm"
          variant={confirmDelete ? "destructive" : "ghost"}
          onClick={remove}
          disabled={pending}
          className="ml-auto"
        >
          <Trash2 /> {confirmDelete ? "Confirm delete" : "Delete"}
        </Button>
      </div>
    </div>
  );
}
