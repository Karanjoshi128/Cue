"use client";

import Link from "next/link";
import { format, isToday, isTomorrow } from "date-fns";
import { ChevronRight, Plus } from "lucide-react";
import type { CalendarPost } from "@/lib/calendar-shared";
import { needsApproval } from "@/lib/calendar-shared";
import { ClientMonogram, StatusBadge } from "@/components/post-bits";
import { cn } from "@/lib/utils";
import { useCalendar } from "./context";
import { KindGlyph, PlatformStack } from "./post-card";
import { composerHref, dayKey, minutesOf, shortTime, slotDate } from "./time";

/**
 * Posts grouped by day. The List view on desktop, and how Week and Month read
 * on phones: tap a post to open it, no dragging.
 */
export function AgendaView({
  days,
  posts,
  showEmptyDays,
  emptyLabel,
}: {
  /** Days to list, in order; posts outside them are ignored. */
  days: string[];
  posts: CalendarPost[];
  showEmptyDays: boolean;
  emptyLabel: string;
}) {
  const cal = useCalendar();
  const todayKey = dayKey(cal.now, cal.ctx);
  const byDay = new Map<string, CalendarPost[]>();
  for (const p of posts) {
    if (!p.scheduledAt) continue;
    const k = dayKey(p.scheduledAt, cal.ctx);
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(p);
  }
  const sections = days
    .map((key) => ({ key, posts: byDay.get(key) ?? [] }))
    .filter((s) => showEmptyDays || s.posts.length > 0);

  if (!sections.length) {
    return (
      <div className="bg-card relative overflow-hidden rounded-2xl border px-6 py-16 text-center">
        <div
          aria-hidden
          className="bg-grid pointer-events-none absolute inset-0 mask-[radial-gradient(ellipse_at_center,black,transparent_70%)]"
        />
        <p className="headline relative text-2xl">{emptyLabel}</p>
        <Link
          href={composerHref(todayKey, null, cal.composerClient)}
          className="text-primary relative mt-3 inline-flex items-center gap-1 text-sm font-medium"
        >
          <Plus className="size-4" /> Schedule a post
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sections.map(({ key, posts: dayPosts }) => {
        const d = slotDate(key, 12 * 60, cal.timeZone);
        const past = key < todayKey;
        return (
          <section key={key} className="grid gap-2 md:grid-cols-[8.5rem_1fr] md:gap-4">
            <div className="flex items-center justify-between md:sticky md:top-20 md:block md:self-start">
              <div>
                <div className="label-caps">
                  {isToday(d, cal.ctx) ? "Today" : isTomorrow(d, cal.ctx) ? "Tomorrow" : format(d, "EEEE", cal.ctx)}
                </div>
                <div className="headline mt-0.5 text-xl md:text-2xl">{format(d, "d MMM", cal.ctx)}</div>
              </div>
              {!past && (
                <Link
                  href={composerHref(key, null, cal.composerClient)}
                  aria-label={`Schedule a post on ${format(d, "MMMM d", cal.ctx)}`}
                  className="text-primary hover:bg-accent grid size-9 place-items-center rounded-lg md:mt-2 md:size-7"
                >
                  <Plus className="size-4" />
                </Link>
              )}
            </div>
            {dayPosts.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-3 text-sm">
                Nothing scheduled.
              </p>
            ) : (
              <ul className="bg-card divide-border divide-y overflow-hidden rounded-2xl border">
                {dayPosts.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => cal.open(p.id)}
                      className={cn(
                        "hover:bg-accent/50 group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors",
                        p.status === "PUBLISHED" && "opacity-75",
                      )}
                    >
                      <span className="w-12 shrink-0 font-mono text-xs tabular-nums">
                        {p.scheduledAt ? shortTime(minutesOf(p.scheduledAt, cal.timeZone)) : "-"}
                      </span>
                      <ClientMonogram
                        name={p.client.name}
                        color={p.client.color}
                        className="size-8 shrink-0 rounded-lg text-[0.625rem]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <span className="truncate">{p.client.name}</span>
                          <PlatformStack post={p} />
                          <KindGlyph kind={p.kind} className="text-muted-foreground" />
                        </span>
                        <span className="text-muted-foreground line-clamp-1 text-sm">
                          {p.title || p.body}
                        </span>
                      </span>
                      {needsApproval(p) && (
                        <span className="bg-standby/15 text-standby-ink hidden shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium sm:inline">
                          Needs approval
                        </span>
                      )}
                      <StatusBadge status={p.status} className="hidden sm:inline-flex" />
                      <ChevronRight className="text-muted-foreground size-4 shrink-0 opacity-0 transition group-hover:opacity-100" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
