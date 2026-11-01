"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { CalendarPost } from "@/lib/calendar-shared";
import { cn } from "@/lib/utils";
import { useCalendar } from "./context";
import { PostCard } from "./post-card";
import { composerHref, dayKey, minutesOf, shortTime, slotDate } from "./time";

const SNAP_DROP = 15;
const SNAP_HOVER = 30;

/** Pixels per hour, and a card's height, per density. */
function metrics(compact: boolean) {
  return compact ? { hour: 36, card: 24 } : { hour: 60, card: 46 };
}

type Placed = { post: CalendarPost; top: number; lane: number; lanes: number };

/**
 * Side-by-side lanes for cards whose boxes would overlap, like a calendar
 * app's clashing events: a cluster of overlapping cards shares the column.
 */
function layout(posts: CalendarPost[], timeZone: string, hourPx: number, cardPx: number): Placed[] {
  const items = posts
    .filter((p) => p.scheduledAt)
    .map((post) => ({ post, top: (minutesOf(post.scheduledAt!, timeZone) / 60) * hourPx }))
    .sort((a, b) => a.top - b.top);
  const out: Placed[] = [];
  let cluster: { post: CalendarPost; top: number; lane: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) out.push({ ...c, lanes });
    cluster = [];
  };
  let laneEnds: number[] = [];
  for (const it of items) {
    if (cluster.length && it.top >= clusterEnd) {
      flush();
      laneEnds = [];
    }
    let lane = laneEnds.findIndex((end) => end <= it.top);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = it.top + cardPx;
    cluster.push({ ...it, lane });
    clusterEnd = Math.max(clusterEnd, it.top + cardPx);
  }
  if (cluster.length) flush();
  return out;
}

export function WeekView({ days, posts }: { days: string[]; posts: CalendarPost[] }) {
  const cal = useCalendar();
  const router = useRouter();
  const compact = cal.density === "compact";
  const { hour: hourPx, card: cardPx } = metrics(compact);
  const scroller = useRef<HTMLDivElement>(null);
  const todayKey = dayKey(cal.now, cal.ctx);
  const nowMin = minutesOf(cal.now, cal.timeZone);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const p of posts) {
      if (!p.scheduledAt) continue;
      const k = dayKey(p.scheduledAt, cal.ctx);
      (map.get(k) ?? map.set(k, []).get(k)!).push(p);
    }
    return map;
  }, [posts, cal.ctx]);

  // Open on the working day: the earliest post this week, or 8am, whichever is earlier.
  const firstMinute = useMemo(() => {
    const mins = posts
      .filter((p) => p.scheduledAt)
      .map((p) => minutesOf(p.scheduledAt!, cal.timeZone));
    return Math.min(8 * 60, ...mins);
  }, [posts, cal.timeZone]);
  useEffect(() => {
    if (scroller.current) {
      scroller.current.scrollTop = Math.max(0, (firstMinute / 60 - 0.5) * hourPx);
    }
    // Only when the week or density changes, not on every post move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0], hourPx]);

  const [hover, setHover] = useState<{ key: string; min: number } | null>(null);
  const [target, setTarget] = useState<{ key: string; min: number; ok: boolean } | null>(null);

  const minuteAt = (e: React.MouseEvent<HTMLElement>, snap: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = ((e.clientY - rect.top) / hourPx) * 60;
    return Math.min(24 * 60 - snap, Math.max(0, Math.floor(raw / snap) * snap));
  };

  const isPast = (key: string, min: number) =>
    slotDate(key, min, cal.timeZone).getTime() < cal.now.getTime();

  return (
    <div className="bg-card overflow-hidden rounded-2xl border shadow-[0_1px_2px_0_rgb(20_20_40/0.04)]">
      <div ref={scroller} className="max-h-[calc(100dvh-17rem)] min-h-[28rem] overflow-auto">
        <div className="min-w-[44rem]">
          {/* Day headers */}
          <div className="bg-card/95 sticky top-0 z-20 grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b backdrop-blur">
            <div />
            {days.map((key) => {
              const d = slotDate(key, 12 * 60, cal.timeZone);
              const today = key === todayKey;
              const count = byDay.get(key)?.length ?? 0;
              return (
                <div key={key} className="flex items-center gap-2 border-l px-2 py-2">
                  <span className="text-muted-foreground font-mono text-[0.625rem] tracking-widest uppercase">
                    {format(d, "EEE", cal.ctx)}
                  </span>
                  <span
                    className={cn(
                      "grid h-6 min-w-6 place-items-center rounded-full px-1 font-mono text-xs tabular-nums",
                      today && "bg-primary text-primary-foreground font-semibold",
                    )}
                  >
                    {format(d, "d", cal.ctx)}
                  </span>
                  {count > 0 && (
                    <span className="text-muted-foreground ml-auto font-mono text-[0.625rem]">
                      {count}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Hours + day columns */}
          <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]">
            <div className="relative" style={{ height: 24 * hourPx }}>
              {Array.from({ length: 24 }, (_, h) => (
                <span
                  key={h}
                  className="text-muted-foreground absolute right-2 -translate-y-1/2 font-mono text-[0.625rem] tabular-nums"
                  style={{ top: h * hourPx }}
                >
                  {h === 0 ? "" : shortTime(h * 60)}
                </span>
              ))}
            </div>

            {days.map((key) => {
              const dayPosts = byDay.get(key) ?? [];
              const placed = layout(dayPosts, cal.timeZone, hourPx, cardPx);
              const pastDay = key < todayKey;
              const today = key === todayKey;
              const hoverHere = hover?.key === key && !cal.draggingId ? hover.min : null;
              const targetHere = target?.key === key ? target : null;
              return (
                <div
                  key={key}
                  className="relative cursor-pointer border-l"
                  style={{
                    height: 24 * hourPx,
                    backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${hourPx}px)`,
                  }}
                  onMouseMove={(e) => {
                    if (e.target !== e.currentTarget) return setHover(null);
                    const min = minuteAt(e, SNAP_HOVER);
                    if (!hover || hover.key !== key || hover.min !== min) setHover({ key, min });
                  }}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const min = minuteAt(e, SNAP_HOVER);
                    if (isPast(key, min)) return;
                    router.push(composerHref(key, min, cal.composerClient));
                  }}
                  onDragOver={(e) => {
                    const post = cal.dragPost();
                    if (!post) return;
                    e.preventDefault();
                    const min = minuteAt(e, SNAP_DROP);
                    const ok = cal.canLand(post, slotDate(key, min, cal.timeZone));
                    e.dataTransfer.dropEffect = ok ? (e.altKey ? "copy" : "move") : "none";
                    if (!target || target.key !== key || target.min !== min || target.ok !== ok) {
                      setTarget({ key, min, ok });
                    }
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setTarget(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setTarget(null);
                    const post = cal.dragPost();
                    if (!post) return;
                    const when = slotDate(key, minuteAt(e, SNAP_DROP), cal.timeZone);
                    cal.drop(post, when, e.altKey);
                  }}
                >
                  {/* The past is shaded: whole days before today, and today up to now. */}
                  {(pastDay || today) && (
                    <div
                      aria-hidden
                      className="bg-muted/45 pointer-events-none absolute inset-x-0 top-0"
                      style={{ height: pastDay ? "100%" : (nowMin / 60) * hourPx }}
                    />
                  )}
                  {today && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                      style={{ top: (nowMin / 60) * hourPx }}
                    >
                      <span className="bg-fault -ml-1 size-2 rounded-full" />
                      <span className="bg-fault h-px flex-1" />
                    </div>
                  )}

                  {hoverHere !== null && !isPast(key, hoverHere) && (
                    <div
                      aria-hidden
                      className="text-primary border-primary/40 bg-primary/5 pointer-events-none absolute inset-x-1 rounded-md border border-dashed px-1.5 py-0.5 font-mono text-[0.625rem]"
                      style={{ top: (hoverHere / 60) * hourPx, height: hourPx / 2 }}
                    >
                      + {shortTime(hoverHere)}
                    </div>
                  )}

                  {targetHere && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 z-20"
                      style={{ top: (targetHere.min / 60) * hourPx }}
                    >
                      <div className={cn("h-0.5", targetHere.ok ? "bg-primary" : "bg-fault")} />
                      <span
                        className={cn(
                          "ml-1 inline-block rounded px-1 font-mono text-[0.625rem] text-white",
                          targetHere.ok ? "bg-primary" : "bg-fault",
                        )}
                      >
                        {targetHere.ok ? shortTime(targetHere.min) : "Past"}
                      </span>
                    </div>
                  )}

                  {placed.map(({ post, top, lane, lanes }) => (
                    <div
                      key={post.id}
                      className="absolute z-[5] px-0.5"
                      style={{
                        top: top + 1,
                        height: cardPx - 2,
                        left: `${(lane / lanes) * 100}%`,
                        width: `${100 / lanes}%`,
                      }}
                    >
                      <PostCard post={post} variant={compact || lanes > 2 ? "chip" : "block"} className="h-full" />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
