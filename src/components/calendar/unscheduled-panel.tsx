"use client";

import Link from "next/link";
import { format } from "date-fns";
import { GripVertical, Inbox } from "lucide-react";
import {
  isMovable,
  needsApproval,
  type CalendarPost,
  type ClientOption,
} from "@/lib/calendar-shared";
import { ClientMonogram, StatusDot } from "@/components/post-bits";
import { cn } from "@/lib/utils";
import { useCalendar } from "./context";
import { PlatformStack } from "./post-card";
import { composerHref } from "./time";

/** Posts that need a person: failures, approvals, and drafts with no date. */
export function groupUnscheduled(posts: CalendarPost[]) {
  const failed = posts.filter((p) => p.status === "FAILED" || p.status === "PARTIAL");
  const review = posts.filter((p) => !failed.includes(p) && needsApproval(p));
  const undated = posts.filter(
    (p) => !failed.includes(p) && !review.includes(p) && p.status === "DRAFT" && !p.scheduledAt,
  );
  return { failed, review, undated, total: failed.length + review.length + undated.length };
}

export function UnscheduledPanel({ posts, className }: { posts: CalendarPost[]; className?: string }) {
  const { failed, review, undated, total } = groupUnscheduled(posts);
  return (
    <aside className={cn("space-y-5", className)} aria-label="Unscheduled">
      <div className="flex items-center gap-2">
        <Inbox className="text-muted-foreground size-4" />
        <h2 className="text-sm font-semibold">Unscheduled</h2>
        <span className="text-muted-foreground font-mono text-xs">{total}</span>
      </div>
      {total === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed px-3 py-6 text-center text-xs">
          All clear. Nothing is waiting on you.
        </p>
      ) : (
        <>
          <Group title="Needs attention" hint="Failed in the last 14 days" posts={failed} />
          <Group title="Waiting for approval" posts={review} />
          <Group title="No date yet" hint="Drag onto the calendar to plan" posts={undated} />
        </>
      )}
    </aside>
  );
}

function Group({ title, hint, posts }: { title: string; hint?: string; posts: CalendarPost[] }) {
  const cal = useCalendar();
  if (!posts.length) return null;
  return (
    <section className="space-y-1.5">
      <div>
        <p className="label-caps">{title}</p>
        {hint && <p className="text-muted-foreground text-[0.6875rem]">{hint}</p>}
      </div>
      <ul className="space-y-1.5">
        {posts.map((p) => {
          const movable = isMovable(p);
          return (
            <li key={p.id}>
              <button
                type="button"
                draggable={movable}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "copyMove";
                  e.dataTransfer.setData("text/plain", p.id);
                  cal.startDrag(p);
                }}
                onDragEnd={() => cal.endDrag()}
                onClick={() => cal.open(p.id)}
                className={cn(
                  "bg-card hover:bg-accent/50 flex w-full items-start gap-2 rounded-lg border p-2 text-left transition-colors",
                  movable && "cursor-grab active:cursor-grabbing",
                  cal.draggingId === p.id && "opacity-40",
                )}
              >
                <ClientMonogram
                  name={p.client.name}
                  color={p.client.color}
                  className="mt-0.5 size-6 shrink-0 rounded-md text-[0.5625rem]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs">
                    <StatusDot status={p.status} />
                    <span className="truncate font-medium">{p.client.name}</span>
                    <PlatformStack post={p} className="ml-auto" />
                  </span>
                  <span className="text-muted-foreground line-clamp-2 text-xs">{p.title || p.body}</span>
                  {p.scheduledAt && (
                    <span className="text-muted-foreground font-mono text-[0.625rem]">
                      {format(new Date(p.scheduledAt), "EEE d MMM, h:mm a", cal.ctx)}
                    </span>
                  )}
                </span>
                {movable && <GripVertical className="text-muted-foreground/60 mt-0.5 size-3.5 shrink-0" />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Clients with nothing planned in the visible range: how an agency notices a
 * brand going quiet. Each chip opens the composer for that client.
 */
export function QuietClients({
  clients,
  posts,
  rangeLabel,
  firstOpenDay,
}: {
  clients: ClientOption[];
  posts: CalendarPost[];
  rangeLabel: string;
  /** The first day in range that isn't past, for the composer link. */
  firstOpenDay: string;
}) {
  const busy = new Set(
    posts.filter((p) => p.status !== "FAILED").map((p) => p.client.id),
  );
  const quiet = clients.filter((c) => !busy.has(c.id));
  if (clients.length < 2 || quiet.length === 0) return null;
  const shown = quiet.slice(0, 8);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-3 py-2">
      <span className="text-muted-foreground text-xs">Nothing planned {rangeLabel} for</span>
      {shown.map((c) => (
        <Link
          key={c.id}
          href={composerHref(firstOpenDay, null, c.id)}
          title={`Plan a post for ${c.name}`}
          className="bg-card hover:border-primary/50 flex h-6 items-center gap-1.5 rounded-full border pr-2 pl-0.5 text-xs transition-colors"
        >
          <ClientMonogram name={c.name} color={c.color} className="size-5 rounded-full text-[0.5rem]" />
          {c.name}
        </Link>
      ))}
      {quiet.length > shown.length && (
        <span className="text-muted-foreground text-xs">+{quiet.length - shown.length} more</span>
      )}
    </div>
  );
}
