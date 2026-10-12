"use client";

import { useSyncExternalStore } from "react";
import { format } from "date-fns";
import { Eye, Info, PauseCircle, TriangleAlert, X } from "lucide-react";
import { stopViewAs } from "@/lib/admin-actions";
import { cn } from "@/lib/utils";

// Notices across the top of the app: a platform admin's read-only view, a
// platform-wide publishing pause, and the admin's announcement banner.

const DISMISS_KEY = "cue-announcement-dismissed";
const DISMISS_EVENT = "cue-announcement-dismissed";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(DISMISS_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(DISMISS_EVENT, cb);
  };
}

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function AppBanners({
  viewAs,
  paused,
  announcement,
}: {
  viewAs: { workspaceName: string; expiresAt: number } | null;
  paused: boolean;
  announcement: { text: string; tone: "info" | "warning"; at: string } | null;
}) {
  // Dismissal is remembered per announcement: a new message shows again.
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => null);
  const showAnnouncement = !!announcement && dismissed !== announcement.at;

  if (!viewAs && !paused && !showAnnouncement) return null;

  return (
    <div className="space-y-px">
      {viewAs && (
        <div className="bg-foreground text-background flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-sm sm:px-6" role="status">
          <Eye className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            Viewing <strong className="font-semibold">{viewAs.workspaceName}</strong> as its admin, read-only.
            <span className="opacity-70" suppressHydrationWarning>
              {" "}Ends at {format(new Date(viewAs.expiresAt), "HH:mm")}.
            </span>
          </span>
          <form action={stopViewAs}>
            <button
              type="submit"
              className="bg-background text-foreground rounded-md px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-90"
            >
              Exit view
            </button>
          </form>
        </div>
      )}
      {paused && (
        <Notice tone="warning" icon={<PauseCircle className="size-4 shrink-0" aria-hidden />}>
          Publishing is paused across Cue right now. Scheduled posts will go out as soon as it resumes.
        </Notice>
      )}
      {showAnnouncement && announcement && (
        <Notice
          tone={announcement.tone}
          icon={
            announcement.tone === "warning" ? (
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
            ) : (
              <Info className="size-4 shrink-0" aria-hidden />
            )
          }
          onDismiss={() => {
            try {
              window.localStorage.setItem(DISMISS_KEY, announcement.at);
            } catch {
              // Private mode: it just shows again next time.
            }
            window.dispatchEvent(new Event(DISMISS_EVENT));
          }}
        >
          {announcement.text}
        </Notice>
      )}
    </div>
  );
}

function Notice({
  tone,
  icon,
  children,
  onDismiss,
}: {
  tone: "info" | "warning";
  icon: React.ReactNode;
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 px-4 py-2.5 text-sm sm:px-6",
        tone === "warning" ? "bg-standby/15 text-standby-ink" : "bg-primary/8 text-foreground",
      )}
    >
      <span className="mt-0.5">{icon}</span>
      <span className="min-w-0 flex-1 leading-relaxed">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="hover:bg-foreground/10 -m-1 rounded-md p-1 transition-colors"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
