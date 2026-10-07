import {
  LinkedinIcon,
  InstagramIcon,
  YoutubeIcon,
} from "@/components/platform-icons";
import { cn } from "@/lib/utils";
import type { Platform, PostStatus, TargetStatus } from "@prisma/client";

export const PLATFORM_META: Record<
  Platform,
  { label: string; color: string; Icon: typeof LinkedinIcon }
> = {
  LINKEDIN: { label: "LinkedIn", color: "#0a66c2", Icon: LinkedinIcon },
  INSTAGRAM: { label: "Instagram", color: "#e1306c", Icon: InstagramIcon },
  YOUTUBE: { label: "YouTube", color: "#ff0033", Icon: YoutubeIcon },
};

export function PlatformIcon({
  platform,
  className,
  brand = false,
}: {
  platform: Platform;
  className?: string;
  /** Render in the network's own colour instead of currentColor. */
  brand?: boolean;
}) {
  const { Icon, color } = PLATFORM_META[platform];
  return (
    <Icon
      className={cn("size-4", className)}
      style={brand ? { color } : undefined}
    />
  );
}

/*
 * Status → cue light. Draft is "hold" (unlit), scheduled is "standby" (amber),
 * anything in flight pulses blue, published is "go" (green), failures are red.
 */
const STATUS: Record<
  string,
  { label: string; dot: string; text: string; live?: boolean }
> = {
  DRAFT: { label: "Draft", dot: "text-muted-foreground/50", text: "text-muted-foreground" },
  SCHEDULED: { label: "Scheduled", dot: "text-standby", text: "text-standby-ink" },
  PENDING: { label: "Pending", dot: "text-standby", text: "text-standby-ink" },
  PUBLISHING: { label: "Publishing", dot: "text-primary", text: "text-primary", live: true },
  PROCESSING: { label: "Processing", dot: "text-primary", text: "text-primary", live: true },
  PUBLISHED: { label: "Published", dot: "text-live", text: "text-live-ink" },
  PARTIAL: { label: "Partial", dot: "text-standby", text: "text-standby-ink" },
  FAILED: { label: "Failed", dot: "text-fault", text: "text-fault-ink" },
};

export function statusMeta(status: string) {
  return STATUS[status] ?? STATUS.DRAFT;
}

export function StatusDot({
  status,
  className,
}: {
  status: PostStatus | TargetStatus | string;
  className?: string;
}) {
  const s = statusMeta(status);
  return (
    <span
      className={cn("tally size-1.5", s.dot, className)}
      data-live={s.live ? "true" : undefined}
    />
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: PostStatus | TargetStatus;
  className?: string;
}) {
  const s = statusMeta(status);
  return (
    <span
      className={cn(
        "bg-card inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.6875rem] font-medium whitespace-nowrap shadow-[0_0_0_1px_var(--border)]",
        s.text,
        className,
      )}
    >
      <span
        className={cn("tally size-1.5", s.dot)}
        data-live={s.live ? "true" : undefined}
      />
      {s.label}
    </span>
  );
}

export function ClientDot({
  color,
  className,
}: {
  color?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]",
        className,
      )}
      style={{ backgroundColor: color ?? "var(--primary)" }}
    />
  );
}

/** Ink or white, whichever reads better on a client's colour. */
export function inkOn(hex?: string | null): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.25 ? "#121420" : "#ffffff";
}

/** A client's initials on its brand colour, used where a dot is too small. */
export function ClientMonogram({
  name,
  color,
  className,
}: {
  name: string;
  color?: string | null;
  className?: string;
}) {
  // Skip symbols like "&" so "Kite & Co." reads "KC", not "K&".
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w));
  const initials = (
    words.length > 1
      ? words[0][0] + words[1][0]
      : (words[0] ?? name).slice(0, 2)
  ).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[10px] font-mono text-xs font-semibold tracking-wide shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1),inset_0_1px_0_0_rgb(255_255_255/0.25)]",
        className,
      )}
      style={{ backgroundColor: color ?? "var(--primary)", color: inkOn(color) }}
    >
      {initials}
    </span>
  );
}
