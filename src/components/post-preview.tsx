"use client";

import { useState } from "react";
import Image from "next/image";
import type { Platform } from "@prisma/client";
import {
  Heart,
  Maximize2,
  MessageCircle,
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

interface PreviewProps {
  name: string;
  color?: string | null;
  body: string;
  imageUrl?: string;
}

function Avatar({ name, color }: { name: string; color?: string | null }) {
  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: color ?? "#2A6FF2" }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

const placeholder = (
  <span className="text-muted-foreground">
    Your post preview shows up here.
  </span>
);

/** Approximates how a post looks in the LinkedIn feed. */
export function LinkedInPreview({ name, color, body, imageUrl }: PreviewProps) {
  return (
    <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="flex items-center gap-2 p-3">
        <Avatar name={name} color={color} />
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-sm font-semibold">
            {name}
            <LinkedinIcon className="size-3.5 text-[#0a66c2]" />
          </div>
          <div className="text-muted-foreground text-xs">Now · 🌐</div>
        </div>
      </div>
      <p className="px-3 pb-3 text-sm whitespace-pre-wrap">{body || placeholder}</p>
      {imageUrl && (
        <Image
          src={imageUrl}
          alt=""
          width={360}
          height={220}
          className="max-h-60 w-full object-cover"
        />
      )}
      <div className="text-muted-foreground flex items-center justify-around border-t px-2 py-1.5 text-xs">
        <span className="flex items-center gap-1">
          <ThumbsUp className="size-4" /> Like
        </span>
        <span className="flex items-center gap-1">
          <MessageCircle className="size-4" /> Comment
        </span>
        <span className="flex items-center gap-1">
          <Repeat2 className="size-4" /> Repost
        </span>
        <span className="flex items-center gap-1">
          <Send className="size-4" /> Send
        </span>
      </div>
    </div>
  );
}

/** Approximates how a post looks in the Instagram feed. */
export function InstagramPreview({ name, color, body, imageUrl }: PreviewProps) {
  return (
    <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="flex items-center gap-2 p-3">
        <Avatar name={name} color={color} />
        <div className="flex items-center gap-1 text-sm font-semibold">
          {name.toLowerCase().replace(/\s+/g, "_")}
          <InstagramIcon className="size-3.5 text-[#e1306c]" />
        </div>
      </div>
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          width={360}
          height={360}
          className="aspect-square w-full object-cover"
        />
      ) : (
        <div className="bg-muted text-muted-foreground grid aspect-square w-full place-items-center text-xs">
          Instagram needs an image
        </div>
      )}
      <div className="flex items-center gap-4 px-3 pt-2.5 text-foreground">
        <Heart className="size-5" />
        <MessageCircle className="size-5" />
        <Send className="size-5" />
      </div>
      <p className="px-3 pb-3 pt-2 text-sm">
        <span className="font-semibold">
          {name.toLowerCase().replace(/\s+/g, "_")}
        </span>{" "}
        <span className="whitespace-pre-wrap">{body || placeholder}</span>
      </p>
    </div>
  );
}

/**
 * Renders a platform preview with a maximize button (top-right) that opens the
 * same preview larger in a modal, so it's readable outside the narrow rail.
 */
export function ExpandablePreview({
  platform,
  ...props
}: PreviewProps & { platform: Platform }) {
  const [open, setOpen] = useState(false);
  const Preview = platform === "INSTAGRAM" ? InstagramPreview : LinkedInPreview;
  const label = platform === "INSTAGRAM" ? "Instagram" : "LinkedIn";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Expand ${label} preview`}
        className="bg-background/70 text-muted-foreground hover:text-foreground absolute top-2 right-2 z-10 rounded-md border p-1 backdrop-blur transition-colors"
      >
        <Maximize2 className="size-3.5" />
      </button>
      <Preview {...props} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{label} preview</DialogTitle>
          </DialogHeader>
          <Preview {...props} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
