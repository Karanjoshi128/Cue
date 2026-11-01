"use client";

import type { Platform } from "@prisma/client";
import {
  BarChart3,
  FileText,
  Film,
  GalleryHorizontal,
  Hourglass,
  Image as ImageIcon,
  Link2,
} from "lucide-react";
import { PlatformIcon, StatusDot } from "@/components/post-bits";
import {
  isMovable,
  needsApproval,
  type CalendarPost,
  type PostKind,
} from "@/lib/calendar-shared";
import { cn } from "@/lib/utils";
import { useCalendar } from "./context";
import { minutesOf, shortTime } from "./time";

const KIND: Record<Exclude<PostKind, "text">, { Icon: typeof Film; label: string }> = {
  image: { Icon: ImageIcon, label: "Image" },
  carousel: { Icon: GalleryHorizontal, label: "Carousel" },
  video: { Icon: Film, label: "Video or Reel" },
  document: { Icon: FileText, label: "Document" },
  poll: { Icon: BarChart3, label: "Poll" },
  link: { Icon: Link2, label: "Link" },
};

export function KindGlyph({ kind, className }: { kind: PostKind; className?: string }) {
  if (kind === "text") return null;
  const { Icon, label } = KIND[kind];
  return <Icon aria-label={label} className={cn("size-3 shrink-0", className)} />;
}

export function platformsOf(p: CalendarPost): Platform[] {
  return [...new Set(p.targets.map((t) => t.platform))];
}

export function PlatformStack({ post, className }: { post: CalendarPost; className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center gap-0.5", className)}>
      {platformsOf(post).map((pl) => (
        <PlatformIcon key={pl} platform={pl} brand className="size-3" />
      ))}
    </span>
  );
}

const tint = (color: string | null) =>
  `color-mix(in oklch, ${color ?? "var(--primary)"} 12%, var(--card))`;

/** First image, for the comfortable card's thumbnail. */
function thumbOf(p: CalendarPost): string | undefined {
  return p.media.find((m) => m.type === "IMAGE")?.url;
}

/**
 * A post on the grid. The client owns the leading edge and tint; status gets
 * its own dot, so the two never share a colour. Drafts and scheduled posts
 * drag; anything else opens on click only.
 */
export function PostCard({
  post,
  variant,
  className,
  style,
}: {
  post: CalendarPost;
  /** chip: one line (month, compact). block: two lines + thumbnail (week). */
  variant: "chip" | "block";
  className?: string;
  style?: React.CSSProperties;
}) {
  const cal = useCalendar();
  const movable = isMovable(post);
  const minutes = post.scheduledAt ? minutesOf(post.scheduledAt, cal.timeZone) : null;
  const text = post.title || post.body;
  const review = needsApproval(post);
  const failed = post.status === "FAILED" || post.status === "PARTIAL";
  const faded = post.status === "PUBLISHED";
  const thumb = variant === "block" ? thumbOf(post) : undefined;

  return (
    <button
      type="button"
      draggable={movable}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "copyMove";
        e.dataTransfer.setData("text/plain", post.id);
        cal.startDrag(post);
      }}
      onDragEnd={() => cal.endDrag()}
      onClick={(e) => {
        e.stopPropagation();
        cal.open(post.id);
      }}
      title={`${post.client.name}: ${text}`}
      aria-label={`${post.client.name}${minutes !== null ? `, ${shortTime(minutes)}` : ""}: ${text}`}
      className={cn(
        // A container, so the card shows more only when it has the room.
        "group/card @container relative flex w-full min-w-0 text-left text-[0.6875rem] leading-tight",
        "rounded-md shadow-[inset_3px_0_0_0_var(--chip)] transition-[filter,box-shadow,opacity]",
        "hover:brightness-[0.97] focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none dark:hover:brightness-125",
        movable && "cursor-grab active:cursor-grabbing",
        cal.draggingId === post.id && "opacity-40",
        faded && "opacity-65",
        failed && "ring-fault/60 ring-1",
        variant === "chip"
          ? "items-center gap-1.5 py-1 pr-1.5 pl-2"
          : "h-full flex-col justify-center gap-0.5 overflow-hidden py-1 pr-1.5 pl-2",
        className,
      )}
      style={
        {
          "--chip": post.client.color ?? "var(--primary)",
          backgroundColor: tint(post.client.color),
          ...style,
        } as React.CSSProperties
      }
    >
      {variant === "chip" ? (
        <>
          <StatusDot status={post.status} />
          {minutes !== null && (
            <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
              {shortTime(minutes)}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate font-medium">{text}</span>
          {review && <Hourglass aria-label="Needs approval" className="text-standby size-3 shrink-0" />}
          <KindGlyph kind={post.kind} className="text-muted-foreground hidden @min-[9rem]:block" />
          <PlatformStack post={post} className="hidden @min-[12rem]:flex" />
        </>
      ) : (
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="flex min-w-0 items-center gap-1.5">
              <StatusDot status={post.status} />
              {minutes !== null && (
                <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
                  {shortTime(minutes)}
                </span>
              )}
              <span className="text-muted-foreground hidden min-w-0 truncate @min-[8rem]:inline">
                {post.client.name}
              </span>
              {review && <ReviewTag />}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate font-medium">{text}</span>
              <KindGlyph kind={post.kind} className="text-muted-foreground hidden @min-[8rem]:block" />
              <PlatformStack post={post} className="hidden @min-[10rem]:flex" />
            </span>
          </span>
          {thumb && (
            // Media lives on the workspace's own storage hosts, so a plain img
            // avoids next/image's host allow-list. Shown only when the card has room.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              loading="lazy"
              className="hidden size-8 shrink-0 rounded object-cover @min-[11rem]:block"
            />
          )}
        </span>
      )}
    </button>
  );
}

function ReviewTag() {
  return (
    <>
      <Hourglass aria-label="Needs approval" className="text-standby size-3 shrink-0 @min-[10rem]:hidden" />
      <span className="bg-standby/15 text-standby-ink hidden shrink-0 rounded px-1 text-[0.5625rem] font-semibold tracking-wide uppercase @min-[10rem]:inline">
        Review
      </span>
    </>
  );
}
