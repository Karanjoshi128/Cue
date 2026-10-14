import type { AutomationRunStatus, KeywordMatch } from "@prisma/client";
import { cn } from "@/lib/utils";

// Small pieces shared by the Automations page, the editor and the preview.

/** Run status as a cue light, like StatusBadge for posts. */
const RUN_STATUS: Record<
  AutomationRunStatus,
  { label: string; dot: string; text: string; live?: boolean }
> = {
  QUEUED: { label: "Queued", dot: "text-primary", text: "text-primary", live: true },
  SENT: { label: "Sent", dot: "text-live", text: "text-live-ink" },
  PARTIAL: { label: "Partly sent", dot: "text-standby", text: "text-standby-ink" },
  FAILED: { label: "Failed", dot: "text-fault", text: "text-fault-ink" },
  SKIPPED: { label: "Already sent", dot: "text-muted-foreground/50", text: "text-muted-foreground" },
};

export function RunBadge({
  status,
  retrying,
  className,
}: {
  status: AutomationRunStatus;
  /** Queued again after a temporary failure. */
  retrying?: boolean;
  className?: string;
}) {
  const s = RUN_STATUS[status];
  return (
    <span
      className={cn(
        "bg-card inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.6875rem] font-medium whitespace-nowrap shadow-[0_0_0_1px_var(--border)]",
        retrying ? "text-standby-ink" : s.text,
        className,
      )}
    >
      <span
        className={cn("tally size-1.5", retrying ? "text-standby" : s.dot)}
        data-live={s.live ? "true" : undefined}
      />
      {retrying ? "Retrying" : s.label}
    </span>
  );
}

export function KeywordChip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-primary/8 text-primary inline-flex h-6 items-center rounded-md px-2 font-mono text-[0.75rem] font-medium tracking-wide uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

export const MATCH_LABELS: Record<KeywordMatch, string> = {
  WORD: "Keyword",
  CONTAINS: "Contains",
  ANY_COMMENT: "Any comment",
};

/** "comments LINK or GUIDE", for card summaries. */
export function TriggerSummary({
  keywords,
  matchMode,
}: {
  keywords: string[];
  matchMode: KeywordMatch;
}) {
  if (matchMode === "ANY_COMMENT") {
    return <span className="text-foreground font-medium">comments anything</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span>{matchMode === "CONTAINS" ? "writes a comment containing" : "comments"}</span>
      {keywords.map((k, i) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground">or</span>}
          <KeywordChip>{k}</KeywordChip>
        </span>
      ))}
    </span>
  );
}

/** Replaces {username} the way the engine does, for previews. */
export function fillPreview(template: string, username: string): string {
  return template.replaceAll("{username}", `@${username}`);
}
