"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import type { CalendarPost } from "@/lib/calendar-shared";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCalendar } from "./context";
import { PostCard } from "./post-card";
import { composerHref, dayKey, minutesOf, slotDate } from "./time";

const DEFAULT_MINUTES = 10 * 60; // an undated draft dropped on a day lands at 10am

export function MonthView({
  days,
  posts,
  monthKey,
}: {
  days: string[];
  posts: CalendarPost[];
  /** yyyy-MM of the month shown, to grey out the neighbours' days. */
  monthKey: string;
}) {
  const cal = useCalendar();
  const router = useRouter();
  const todayKey = dayKey(cal.now, cal.ctx);
  const cap = cal.density === "compact" ? 5 : 3;
  const [over, setOver] = useState<{ key: string; ok: boolean } | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const p of posts) {
      if (!p.scheduledAt) continue;
      const k = dayKey(p.scheduledAt, cal.ctx);
      (map.get(k) ?? map.set(k, []).get(k)!).push(p);
    }
    return map;
  }, [posts, cal.ctx]);

  /** Moving in month view keeps the post's time of day. */
  const landing = (post: CalendarPost, key: string) =>
    slotDate(
      key,
      post.scheduledAt ? minutesOf(post.scheduledAt, cal.timeZone) : DEFAULT_MINUTES,
      cal.timeZone,
    );

  return (
    <div className="bg-card overflow-x-auto rounded-2xl border shadow-[0_1px_2px_0_rgb(20_20_40/0.04)]">
      <div className="bg-border grid min-w-[40rem] grid-cols-7 gap-px">
        {days.slice(0, 7).map((key) => (
          <div
            key={`h-${key}`}
            className="bg-card text-muted-foreground px-2 py-2.5 font-mono text-[0.625rem] font-medium tracking-widest uppercase"
          >
            {format(slotDate(key, 12 * 60, cal.timeZone), "EEE", cal.ctx)}
          </div>
        ))}
        {days.map((key) => {
          const d = slotDate(key, 12 * 60, cal.timeZone);
          const dayPosts = byDay.get(key) ?? [];
          const inMonth = key.startsWith(monthKey);
          const today = key === todayKey;
          const past = key < todayKey;
          const target = over?.key === key ? over : null;
          return (
            <div
              key={key}
              className={cn(
                "group relative flex cursor-pointer flex-col gap-1 p-1.5",
                cal.density === "compact" ? "min-h-28" : "min-h-36",
                inMonth ? "bg-card" : "bg-[color-mix(in_oklch,var(--card),var(--muted)_80%)]",
                past && "bg-[color-mix(in_oklch,var(--card),var(--muted)_45%)]",
                target && (target.ok ? "ring-primary ring-2 ring-inset" : "ring-fault ring-2 ring-inset"),
              )}
              onClick={(e) => {
                if (e.target !== e.currentTarget || past) return;
                router.push(composerHref(key, null, cal.composerClient));
              }}
              onDragOver={(e) => {
                const post = cal.dragPost();
                if (!post) return;
                e.preventDefault();
                const ok = cal.canLand(post, landing(post, key));
                e.dataTransfer.dropEffect = ok ? (e.altKey ? "copy" : "move") : "none";
                if (!over || over.key !== key || over.ok !== ok) setOver({ key, ok });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const post = cal.dragPost();
                if (post) cal.drop(post, landing(post, key), e.altKey);
              }}
            >
              <div className="pointer-events-none flex items-center justify-between">
                <span
                  className={cn(
                    "grid h-6 min-w-6 place-items-center rounded-full px-1 font-mono text-xs tabular-nums",
                    today
                      ? "bg-primary text-primary-foreground font-semibold"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/60",
                  )}
                >
                  {format(d, "d", cal.ctx)}
                </span>
                {!past && (
                  <Link
                    href={composerHref(key, null, cal.composerClient)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Schedule a post on ${format(d, "MMMM d", cal.ctx)}`}
                    className="text-muted-foreground hover:text-primary hover:bg-accent pointer-events-auto grid size-6 place-items-center rounded-md opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Plus className="size-3.5" />
                  </Link>
                )}
              </div>
              <div className="space-y-1">
                {dayPosts.slice(0, cap).map((p) => (
                  <PostCard key={p.id} post={p} variant="chip" />
                ))}
                {dayPosts.length > cap && (
                  <Popover>
                    <PopoverTrigger
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground hover:text-foreground hover:bg-accent w-full rounded px-1.5 py-0.5 text-left font-mono text-[0.625rem]"
                    >
                      +{dayPosts.length - cap} more
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 gap-1.5 p-2">
                      <p className="label-caps px-1 pb-1">{format(d, "EEEE d MMMM", cal.ctx)}</p>
                      {dayPosts.map((p) => (
                        <PostCard key={p.id} post={p} variant="chip" />
                      ))}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
