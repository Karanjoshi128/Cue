"use client";

import { useState } from "react";
import Image from "next/image";
import type { Platform } from "@prisma/client";
import {
  Bookmark,
  Heart,
  Maximize2,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Send,
  ThumbsUp,
} from "lucide-react";
import { LinkedinIcon, InstagramIcon } from "@/components/platform-icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface PreviewProps {
  name: string;
  color?: string | null;
  body: string;
  imageUrl?: string;
}

function Avatar({
  name,
  color,
  ring,
  size = "size-11",
}: {
  name: string;
  color?: string | null;
  ring?: boolean;
  size?: string;
}) {
  const inner = (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full text-sm font-semibold text-white",
        size,
      )}
      style={{ backgroundColor: color ?? "#2A6FF2" }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
  if (!ring) return inner;
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-linear-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] p-0.5">
      <span className="bg-card rounded-full p-0.5">{inner}</span>
    </span>
  );
}

/** Truncates long copy with a see more / see less toggle, like the real feeds. */
function PostText({
  body,
  limit,
  moreLabel,
  lessLabel,
  usernamePrefix,
}: {
  body: string;
  limit: number;
  moreLabel: string;
  lessLabel: string;
  usernamePrefix?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = body.trim();

  if (!text) {
    return (
      <span className="text-muted-foreground">
        Your post preview shows up here.
      </span>
    );
  }

  const isLong = text.length > limit;
  const shown = expanded || !isLong ? text : text.slice(0, limit).trimEnd();

  return (
    <span className="whitespace-pre-wrap">
      {usernamePrefix && (
        <span className="font-semibold">{usernamePrefix} </span>
      )}
      {shown}
      {isLong && !expanded && "… "}
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground font-medium hover:underline"
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      )}
    </span>
  );
}

/** A tappable action that fills its icon + color when active, like a Like button. */
function ActionButton({
  icon: Icon,
  label,
  activeClass,
  iconSize = "size-5",
}: {
  icon: typeof ThumbsUp;
  label?: string;
  activeClass: string;
  iconSize?: string;
}) {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOn((v) => !v)}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md transition-colors",
        label ? "px-2 py-1.5 text-sm font-medium" : "p-1",
        on
          ? activeClass
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className={iconSize} fill={on ? "currentColor" : "none"} />
      {label && <span>{label}</span>}
    </button>
  );
}

/** Approximates how a post looks in the LinkedIn feed. */
export function LinkedInPreview({ name, color, body, imageUrl }: PreviewProps) {
  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      <div className="flex items-start gap-2 p-3">
        <Avatar name={name} color={color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-sm font-semibold leading-tight">
            <span className="truncate">{name}</span>
            <LinkedinIcon className="size-3.5 shrink-0 text-[#0a66c2]" />
          </div>
          <div className="text-muted-foreground truncate text-xs">
            Social media
          </div>
          <div className="text-muted-foreground text-xs">Now · 🌐</div>
        </div>
        <MoreHorizontal className="text-muted-foreground size-5 shrink-0" />
      </div>

      <p className="px-3 pb-3 text-sm">
        <PostText body={body} limit={200} moreLabel="see more" lessLabel="see less" />
      </p>

      {imageUrl && (
        <Image
          src={imageUrl}
          alt=""
          width={480}
          height={300}
          className="max-h-96 w-full object-cover"
        />
      )}

      <div className="text-muted-foreground flex items-center justify-around border-t px-1 py-0.5">
        <ActionButton
          icon={ThumbsUp}
          label="Like"
          activeClass="text-[#0a66c2] dark:text-[#5aa2ec]"
        />
        <ActionButton
          icon={MessageCircle}
          label="Comment"
          activeClass="text-[#0a66c2] dark:text-[#5aa2ec]"
        />
        <ActionButton
          icon={Repeat2}
          label="Repost"
          activeClass="text-emerald-600 dark:text-emerald-400"
        />
        <ActionButton
          icon={Send}
          label="Send"
          activeClass="text-[#0a66c2] dark:text-[#5aa2ec]"
        />
      </div>
    </div>
  );
}

/** Approximates how a post looks in the Instagram feed. */
export function InstagramPreview({ name, color, body, imageUrl }: PreviewProps) {
  const username = name.toLowerCase().replace(/\s+/g, "_");
  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      <div className="flex items-center gap-2.5 p-3">
        <Avatar name={name} color={color} ring size="size-8" />
        <div className="flex items-center gap-1 text-sm font-semibold">
          {username}
          <InstagramIcon className="size-3.5 text-[#e1306c]" />
        </div>
        <MoreHorizontal className="text-foreground ml-auto size-5" />
      </div>

      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          width={480}
          height={480}
          className="aspect-square w-full object-cover"
        />
      ) : (
        <div className="bg-muted text-muted-foreground grid aspect-square w-full place-items-center text-xs">
          Instagram needs an image
        </div>
      )}

      <div className="text-foreground flex items-center gap-1 px-2 pt-2">
        <ActionButton
          icon={Heart}
          activeClass="text-[#ed4956]"
          iconSize="size-6"
        />
        <ActionButton
          icon={MessageCircle}
          activeClass="text-foreground"
          iconSize="size-6"
        />
        <ActionButton icon={Send} activeClass="text-foreground" iconSize="size-6" />
        <ActionButton
          icon={Bookmark}
          activeClass="text-foreground"
          iconSize="size-6"
        />
      </div>

      <p className="px-3 pt-1 pb-3 text-sm">
        <PostText
          body={body}
          limit={125}
          moreLabel="more"
          lessLabel="less"
          usernamePrefix={username}
        />
      </p>
    </div>
  );
}

/**
 * Renders a platform preview with a maximize button (top-right) that opens the
 * same preview larger in a scrollable modal.
 */
export function ExpandablePreview({
  platform,
  ...props
}: PreviewProps & { platform: Platform }) {
  const [open, setOpen] = useState(false);
  const Preview = platform === "INSTAGRAM" ? InstagramPreview : LinkedInPreview;
  const label = platform === "INSTAGRAM" ? "Instagram" : "LinkedIn";
  const Icon = platform === "INSTAGRAM" ? InstagramIcon : LinkedinIcon;

  return (
    <div className="space-y-1.5">
      {/* Header row keeps the expand control off the card so it can't collide
          with the mimicked "..." menu, and labels which network this is. */}
      <div className="flex items-center justify-between px-0.5">
        <span className="label-caps flex items-center gap-1.5">
          <Icon className="size-3.5" />
          {label}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Expand ${label} preview`}
          className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md p-1 transition-colors"
        >
          <Maximize2 className="size-4" />
        </button>
      </div>
      <Preview {...props} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{label} preview</DialogTitle>
          </DialogHeader>
          <Preview {...props} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
