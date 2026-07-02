import Image from "next/image";
import type { Platform } from "@prisma/client";
import { Heart, MessageCircle, Repeat2, Send, ThumbsUp } from "lucide-react";
import { LinkedinIcon, InstagramIcon } from "@/components/platform-icons";

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

export function PostPreview({
  platforms,
  ...props
}: PreviewProps & { platforms: Platform[] }) {
  if (platforms.length === 0) {
    return <LinkedInPreview {...props} />;
  }
  return (
    <div className="space-y-3">
      {platforms.includes("LINKEDIN") && <LinkedInPreview {...props} />}
      {platforms.includes("INSTAGRAM") && <InstagramPreview {...props} />}
    </div>
  );
}
