import { Badge } from "@/components/ui/badge";
import { LinkedinIcon, InstagramIcon } from "@/components/platform-icons";
import { cn } from "@/lib/utils";
import type { Platform, PostStatus, TargetStatus } from "@prisma/client";

export function PlatformIcon({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  const Icon = platform === "LINKEDIN" ? LinkedinIcon : InstagramIcon;
  return <Icon className={cn("size-4", className)} />;
}

const statusStyles: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  PUBLISHING: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  PUBLISHED:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  PARTIAL: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  PROCESSING: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
};

export function StatusBadge({
  status,
}: {
  status: PostStatus | TargetStatus;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn("font-medium capitalize", statusStyles[status])}
    >
      {status.toLowerCase()}
    </Badge>
  );
}

export function ClientDot({ color }: { color?: string | null }) {
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color ?? "#2A6FF2" }}
    />
  );
}
