"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  MessageSquare,
  Pencil,
  PenLine,
  Plus,
  RotateCw,
  Search,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import type { Platform } from "@prisma/client";
import {
  ClientDot,
  ClientMonogram,
  PlatformIcon,
  PLATFORM_META,
  StatusBadge,
  StatusDot,
} from "@/components/post-bits";
import { formatCountdown } from "@/components/fx/countdown";
import { cn } from "@/lib/utils";
import { DAY_MS, startOfDay, useDemo, useNow } from "./store";
import {
  newId,
  platformsOf,
  SWATCHES,
  type DemoFilter,
} from "./model";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const fmt = (t: number, o: Intl.DateTimeFormatOptions) =>
  new Date(t).toLocaleString("en-GB", { ...o });
const time = (t: number) =>
  new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayLabel = (t: number, now: number) => {
  const d = startOfDay(t);
  const today = startOfDay(now);
  if (d === today) return "Today";
  if (d === today + DAY_MS) return "Tomorrow";
  return fmt(t, { weekday: "short", day: "numeric", month: "short" });
};

function Header({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-6">
      <div className="min-w-0">
        <div className="label-caps flex items-center gap-2">{eyebrow}</div>
        <h1 className="headline mt-2 text-[2.35rem]">{title}</h1>
        {sub && <p className="text-muted-foreground mt-1.5 text-sm">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

function Btn({
  children,
  onClick,
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "ghost";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-[background-color,filter,transform] active:scale-[0.97] [&_svg]:size-4",
        variant === "primary" &&
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.2),0_1px_2px_0_rgb(10_20_60/0.25)] hover:brightness-95",
        variant === "outline" && "bg-card hover:bg-accent shadow-[0_0_0_1px_var(--border)]",
        variant === "ghost" && "text-foreground/80 hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export function DashboardView() {
  const { scopedPosts, state, clientOf, go } = useDemo();
  const now = useNow();
  const hour = new Date(now).getHours();
  const greeting =
    hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const upcoming = scopedPosts
    .filter((p) => p.status === "SCHEDULED" && p.at !== null && p.at > now)
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const next = upcoming[0];
  const scheduled = upcoming.length;
  const published = scopedPosts.filter((p) => p.status === "PUBLISHED").length;
  const failed = scopedPosts.filter((p) => p.status === "FAILED").length;
  const drafts = scopedPosts.filter((p) => p.status === "DRAFT").length;
  const review = scopedPosts.filter((p) => p.approval !== "APPROVED").length;
  const clientCount = state.scope ? 1 : state.clients.length;
  const accounts = state.clients
    .filter((c) => !state.scope || c.id === state.scope)
    .reduce((n, c) => n + c.accounts.length, 0);

  const today = startOfDay(now);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = today + i * DAY_MS;
    return {
      d,
      posts: scopedPosts.filter(
        (p) => p.at !== null && p.status !== "DRAFT" && startOfDay(p.at) === d,
      ),
    };
  });

  const tiles = [
    { label: "On standby", caption: "Scheduled to publish", value: scheduled, tone: "text-standby", filter: "SCHEDULED" as DemoFilter },
    { label: "Gone live", caption: "Published, all time", value: published, tone: "text-live", filter: "PUBLISHED" as DemoFilter },
    { label: "Faults", caption: failed ? "Need a retry" : "Nothing failed", value: failed, tone: "text-fault", filter: "FAILED" as DemoFilter },
    { label: state.scope ? "Client" : "Clients", caption: `${accounts} accounts connected`, value: clientCount, tone: "text-primary", filter: null },
  ];

  const nextClient = next ? clientOf(next.clientId) : undefined;

  return (
    <div>
      <Header
        eyebrow={
          <>
            <span className="tally text-live" data-live="true" />
            {fmt(now, { weekday: "short", day: "numeric", month: "short" })}
            <span className="text-border">/</span>
            <span className="tabular-nums">{new Date(now).toLocaleTimeString("en-GB")}</span>
          </>
        }
        title={
          <>
            {greeting}, <em>Riya.</em>
          </>
        }
        sub={`${scheduled} posts on standby${state.scope ? "" : ` across ${state.clients.length} clients`}.${failed ? ` ${failed} need${failed === 1 ? "s" : ""} a retry.` : ""}`}
        actions={
          <>
            <Btn variant="outline" onClick={() => go({ view: "calendar" })}>
              <CalendarDays /> Calendar
            </Btn>
            <Btn onClick={() => go({ view: "compose" })}>
              <Plus /> New post
            </Btn>
          </>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        {next && nextClient ? (
          <button
            type="button"
            onClick={() => go({ view: "compose", editId: next.id })}
            className="group border-beam bg-card relative col-span-7 flex min-h-60 flex-col overflow-hidden rounded-2xl border p-6 text-left [--beam-duration:9s]"
          >
            <div className="bg-grid pointer-events-none absolute inset-0 mask-[radial-gradient(ellipse_at_top_right,black,transparent_65%)]" />
            <div
              className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full opacity-25 blur-3xl"
              style={{ backgroundColor: nextClient.color }}
            />
            <div className="relative flex items-center justify-between">
              <span className="label-caps flex items-center gap-2">
                <span className="tally text-standby" data-live="true" /> Next cue
              </span>
              <span className="flex gap-1.5">
                {platformsOf(next, state.clients).map((p) => (
                  <span key={p} className="bg-background grid size-7 place-items-center rounded-lg shadow-[0_0_0_1px_var(--border)]">
                    <PlatformIcon platform={p} brand className="size-3.5" />
                  </span>
                ))}
              </span>
            </div>
            <div className="relative mt-5 font-mono text-[3.4rem] leading-none font-medium tracking-[-0.04em] tabular-nums">
              {formatCountdown((next.at ?? 0) - now)}
            </div>
            <div className="text-muted-foreground relative mt-2.5 font-mono text-xs tracking-wide uppercase">
              {dayLabel(next.at ?? 0, now)} · {time(next.at ?? 0)}
            </div>
            <div className="relative mt-auto flex items-end gap-4 pt-6">
              <ClientMonogram name={nextClient.name} color={nextClient.color} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{nextClient.name}</div>
                <p className="text-muted-foreground line-clamp-1 text-sm">{next.title ?? next.body}</p>
              </div>
              <span className="bg-foreground text-background grid size-9 shrink-0 place-items-center rounded-full transition-transform group-hover:-rotate-45">
                <ArrowRight className="size-4" />
              </span>
            </div>
          </button>
        ) : (
          <div className="bg-card col-span-7 flex min-h-60 flex-col items-start justify-end rounded-2xl border p-6">
            <span className="label-caps">Next cue</span>
            <p className="headline mt-2 text-3xl">
              The stage is <em>clear.</em>
            </p>
            <Btn className="mt-4" onClick={() => go({ view: "compose" })}>
              <Plus /> Schedule a post
            </Btn>
          </div>
        )}

        <div className="col-span-5 grid grid-cols-2 gap-4">
          {tiles.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => go(t.filter ? { view: "queue", filter: t.filter } : { view: "clients" })}
              className="bg-card group hover:border-primary/40 flex flex-col justify-between rounded-2xl border p-4 text-left transition-colors"
            >
              <span className="label-caps flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className={cn("tally size-1.5", t.tone)} /> {t.label}
                </span>
                <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span>
                <motion.span
                  key={t.value}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="headline block text-[2.6rem] leading-none tabular-nums"
                >
                  {t.value}
                </motion.span>
                <span className="text-muted-foreground mt-1 block text-xs">{t.caption}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <section className="bg-card mt-4 rounded-2xl border p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-[0.9375rem] font-semibold tracking-tight">The next two weeks</h2>
            <p className="text-muted-foreground text-xs">Each mark is a post in its client&apos;s colour. Click a day to open it.</p>
          </div>
          <span className="label-caps">
            {fmt(days[0].d, { day: "numeric", month: "short" })} to {fmt(days[13].d, { day: "numeric", month: "short" })}
          </span>
        </div>
        <ol className="mt-4 grid grid-cols-14 gap-1.5">
          {days.map(({ d, posts }, i) => {
            const weekend = [0, 6].includes(new Date(d).getDay());
            return (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => (posts.length ? go({ view: "calendar", day: d }) : go({ view: "compose", day: d }))}
                  title={`${posts.length} post${posts.length === 1 ? "" : "s"}`}
                  className={cn(
                    "group hover:border-primary/40 flex h-28 w-full flex-col rounded-xl border p-2 text-left transition-colors",
                    i === 0 ? "border-primary/50 bg-primary/[0.04]" : weekend ? "bg-muted/50" : "bg-background",
                  )}
                >
                  <span className={cn("font-mono text-[0.625rem] tracking-wider uppercase", i === 0 ? "text-primary" : "text-muted-foreground")}>
                    {i === 0 ? "Today" : fmt(d, { weekday: "short" })}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{new Date(d).getDate()}</span>
                  <span className="mt-auto flex flex-col-reverse gap-[3px]">
                    {posts.slice(0, 5).map((p) => (
                      <span
                        key={p.id}
                        className={cn("h-[5px] rounded-full", p.status !== "SCHEDULED" && "opacity-40")}
                        style={{ backgroundColor: clientOf(p.clientId)?.color }}
                      />
                    ))}
                    {posts.length === 0 && (
                      <Plus className="text-muted-foreground/0 group-hover:text-primary size-3.5 transition-colors" />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <section className="bg-card col-span-2 rounded-2xl border">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="text-[0.9375rem] font-semibold tracking-tight">Run of show</h2>
            <button type="button" onClick={() => go({ view: "queue", filter: "SCHEDULED" })} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium">
              Full schedule <ArrowUpRight className="size-3.5" />
            </button>
          </div>
          <ol className="mt-2 pb-2">
            {upcoming.slice(1, 5).map((p) => {
              const c = clientOf(p.clientId);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => go({ view: "compose", editId: p.id })}
                    className="hover:bg-accent/60 group grid w-full grid-cols-[6.5rem_1fr_auto] items-center gap-3 px-5 py-2.5 text-left transition-colors"
                  >
                    <span className="font-mono text-[0.6875rem] leading-tight tracking-wide uppercase">
                      <span className="block">{dayLabel(p.at ?? 0, now)}</span>
                      <span className="text-muted-foreground">{time(p.at ?? 0)}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <ClientDot color={c?.color} /> {c?.name}
                        <span className="text-muted-foreground flex gap-1">
                          {platformsOf(p, state.clients).map((pl) => (
                            <PlatformIcon key={pl} platform={pl} className="size-3" />
                          ))}
                        </span>
                      </span>
                      <span className="text-muted-foreground line-clamp-1 text-sm">{p.title ?? p.body}</span>
                    </span>
                    <ArrowRight className="text-muted-foreground size-4 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="bg-card rounded-2xl border p-5">
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">Needs attention</h2>
          <ul className="mt-2 space-y-1">
            {[
              failed > 0 && { label: "Failed to publish", value: failed, icon: AlertTriangle, tone: "text-fault-ink bg-fault/10", filter: "FAILED" as DemoFilter },
              review > 0 && { label: "Awaiting approval", value: review, icon: Clock, tone: "text-primary bg-primary/10", filter: "SCHEDULED" as DemoFilter },
              drafts > 0 && { label: "Drafts", value: drafts, icon: PenLine, tone: "text-muted-foreground bg-muted", filter: "DRAFT" as DemoFilter },
            ]
              .filter(Boolean)
              .map((a) => {
                const item = a as { label: string; value: number; icon: typeof Clock; tone: string; filter: DemoFilter };
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => go({ view: "queue", filter: item.filter })}
                      className="hover:bg-accent/60 -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors"
                    >
                      <span className={cn("grid size-8 place-items-center rounded-lg", item.tone)}>
                        <item.icon className="size-4" />
                      </span>
                      <span className="flex-1 text-sm font-medium">{item.label}</span>
                      <span className="font-mono text-sm tabular-nums">{item.value}</span>
                    </button>
                  </li>
                );
              })}
            {failed + review + drafts === 0 && (
              <li className="flex items-center gap-2 py-2 text-sm">
                <CheckCircle2 className="text-live size-4" /> All clear.
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calendar: drag posts between days                                   */
/* ------------------------------------------------------------------ */

export function CalendarView() {
  const { scopedPosts, state, clientOf, go, dispatch, toast } = useDemo();
  const now = useNow(30_000);
  const anchor = state.route.day ?? now;
  const [month, setMonth] = useState(() => {
    const d = new Date(anchor);
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<number | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);

  const m = new Date(month);
  const gridStart = startOfDay(new Date(m.getFullYear(), m.getMonth(), 1 - m.getDay()).getTime());
  const weeks = Math.ceil((new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate() + m.getDay()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => gridStart + i * DAY_MS);
  const visible = scopedPosts.filter(
    (p) => p.at !== null && p.status !== "DRAFT" && (!platform || platformsOf(p, state.clients).includes(platform)),
  );
  const shift = (delta: number) => {
    const d = new Date(month);
    setMonth(new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime());
  };

  function drop(day: number) {
    setOverDay(null);
    if (!dragId) return;
    const post = scopedPosts.find((p) => p.id === dragId);
    setDragId(null);
    if (!post || post.at === null || startOfDay(post.at) === day) return;
    if (post.status !== "SCHEDULED") {
      toast("Only scheduled posts can be moved. Published ones are already live.");
      return;
    }
    const target = day + (post.at - startOfDay(post.at));
    if (target < now) {
      toast("That time has already passed. Drop it on today or later.");
      return;
    }
    dispatch({ type: "move", id: post.id, dayStart: day });
    toast(`Moved ${clientOf(post.clientId)?.name ?? "post"} to ${fmt(day, { weekday: "long", day: "numeric", month: "long" })}.`);
  }

  return (
    <div>
      <Header
        eyebrow={
          <>
            Calendar <span className="text-border">/</span> Drag a post to reschedule it
          </>
        }
        title={
          <>
            {m.toLocaleString("en-GB", { month: "long" })} <em>{m.getFullYear()}</em>
          </>
        }
        actions={
          <>
            <Btn variant="outline" className="px-2.5" onClick={() => shift(-1)}>
              <ChevronLeft />
            </Btn>
            <Btn
              variant="outline"
              onClick={() => {
                const d = new Date();
                setMonth(new Date(d.getFullYear(), d.getMonth(), 1).getTime());
              }}
            >
              Today
            </Btn>
            <Btn variant="outline" className="px-2.5" onClick={() => shift(1)}>
              <ChevronRight />
            </Btn>
            <Btn onClick={() => go({ view: "compose" })}>
              <Plus /> New post
            </Btn>
          </>
        }
      />
      <div className="mb-3 flex justify-end">
        <div className="bg-muted flex gap-0.5 rounded-lg p-0.5">
          {([null, "LINKEDIN", "INSTAGRAM", "YOUTUBE"] as (Platform | null)[]).map((p) => (
            <button
              key={p ?? "all"}
              type="button"
              onClick={() => setPlatform(p)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
                platform === p ? "bg-card text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p ? <PlatformIcon platform={p} className="size-3.5" /> : null}
              {p ? PLATFORM_META[p].label : "All"}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-card overflow-hidden rounded-2xl border">
        <div className="bg-border grid grid-cols-7 gap-px">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="bg-card text-muted-foreground px-2 py-2 font-mono text-[0.625rem] font-medium tracking-widest uppercase">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const inMonth = new Date(d).getMonth() === m.getMonth();
            const isToday = d === startOfDay(now);
            const posts = visible.filter((p) => startOfDay(p.at ?? 0) === d).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
            const over = overDay === d;
            return (
              <div
                key={d}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  setOverDay(d);
                }}
                onDragLeave={() => setOverDay((o) => (o === d ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(d);
                }}
                className={cn(
                  "group relative flex min-h-[6.25rem] flex-col gap-1 p-1.5 transition-colors",
                  inMonth ? "bg-card" : "bg-[color-mix(in_oklch,var(--card),var(--muted)_85%)]",
                  over && "bg-[color-mix(in_oklch,var(--card),var(--primary)_10%)] ring-2 ring-primary/50 ring-inset",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "grid h-6 min-w-6 place-items-center rounded-full px-1 font-mono text-xs tabular-nums",
                      isToday ? "bg-primary text-primary-foreground font-semibold" : inMonth ? "" : "text-muted-foreground/60",
                    )}
                  >
                    {new Date(d).getDate()}
                  </span>
                  <button
                    type="button"
                    aria-label="Schedule a post on this day"
                    onClick={() => go({ view: "compose", day: d })}
                    className="text-muted-foreground hover:text-primary hover:bg-background grid size-6 place-items-center rounded-md opacity-0 transition group-hover:opacity-100"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                {posts.slice(0, 3).map((p) => {
                  const c = clientOf(p.clientId);
                  const movable = p.status === "SCHEDULED";
                  return (
                    <div
                      key={p.id}
                      draggable={movable}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", p.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(p.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverDay(null);
                      }}
                      onClick={() => movable && go({ view: "compose", editId: p.id })}
                      title={movable ? "Drag to another day, or click to edit" : "Already published"}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md py-1 pr-1.5 pl-2 text-[0.6875rem] leading-tight shadow-[inset_2px_0_0_0_var(--chip)] transition-[filter,opacity]",
                        movable ? "cursor-grab hover:brightness-95 active:cursor-grabbing dark:hover:brightness-125" : "opacity-55",
                        dragId === p.id && "opacity-40",
                      )}
                      style={
                        {
                          "--chip": c?.color,
                          backgroundColor: `color-mix(in oklch, ${c?.color} 11%, var(--card))`,
                        } as React.CSSProperties
                      }
                    >
                      {p.status !== "SCHEDULED" && <StatusDot status={p.status} />}
                      <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
                        {new Date(p.at ?? 0).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{p.title ?? p.body}</span>
                    </div>
                  );
                })}
                {posts.length > 3 && (
                  <span className="text-muted-foreground px-1 font-mono text-[0.625rem]">+{posts.length - 3} more</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

const FILTERS: { key: DemoFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Drafts" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "PUBLISHED", label: "Published" },
  { key: "FAILED", label: "Failed" },
];

export function QueueView() {
  const { scopedPosts, state, clientOf, go, dispatch, toast } = useDemo();
  const now = useNow(30_000);
  const [filter, setFilter] = useState<DemoFilter>(state.route.filter ?? "ALL");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: scopedPosts.length };
    for (const p of scopedPosts) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [scopedPosts]);

  const shown = scopedPosts
    .filter((p) => (filter === "ALL" ? true : filter === "PUBLISHED" ? p.status === "PUBLISHED" || p.status === "PUBLISHING" : p.status === filter))
    .filter((p) => !q.trim() || `${p.body} ${clientOf(p.clientId)?.name}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => {
      // Drafts on top, then whatever is closest to now.
      if (a.at === null) return -1;
      if (b.at === null) return 1;
      return Math.abs(a.at - now) - Math.abs(b.at - now);
    });

  return (
    <div>
      <Header
        eyebrow={
          <>
            Queue <span className="text-border">/</span> {scopedPosts.length} posts
          </>
        }
        title={
          <>
            Every post, <em>in order.</em>
          </>
        }
        actions={
          <Btn onClick={() => go({ view: "compose" })}>
            <Plus /> New post
          </Btn>
        }
      />
      <div className="mb-4 flex items-center gap-3">
        <div className="bg-muted flex gap-0.5 rounded-xl p-1">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "relative flex h-8 items-center gap-2 rounded-lg px-3 text-[0.8125rem] font-medium",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span layoutId="demo-queue-filter" className="bg-card absolute inset-0 rounded-lg shadow-[0_0_0_1px_var(--border)]" />
                )}
                {f.key !== "ALL" && <StatusDot status={f.key} className="relative" />}
                <span className="relative">{f.label}</span>
                <span className="text-muted-foreground relative font-mono text-[0.6875rem]">{counts[f.key] ?? 0}</span>
              </button>
            );
          })}
        </div>
        <div className="relative ml-auto w-60">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search posts or clients"
            className="bg-card focus:ring-ring/15 focus:border-ring h-9 w-full rounded-lg border pr-3 pl-9 text-sm outline-none focus:ring-4"
          />
        </div>
      </div>

      <ul className="space-y-2.5">
        <AnimatePresence initial={false}>
          {shown.map((p) => {
            const c = clientOf(p.clientId);
            const editable = p.status === "DRAFT" || p.status === "SCHEDULED";
            return (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="bg-card overflow-hidden rounded-2xl border"
              >
                {p.status === "FAILED" && p.error && (
                  <div className="text-fault-ink bg-fault/[0.07] flex items-center gap-2 border-b px-4 py-2 text-xs">
                    <AlertTriangle className="size-3.5 shrink-0" /> {p.error}
                  </div>
                )}
                <div className="grid grid-cols-[7rem_1fr] gap-4 px-4 py-3.5">
                  <div>
                    <div className="font-mono text-[0.6875rem] tracking-wide uppercase">
                      {p.at ? dayLabel(p.at, now) : "Unscheduled"}
                    </div>
                    {p.at && (
                      <div className="text-muted-foreground font-mono text-[0.6875rem] uppercase">{time(p.at)}</div>
                    )}
                    <StatusBadge status={p.status} className="mt-2" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ClientMonogram name={c?.name ?? "?"} color={c?.color} className="size-6 rounded-md text-[0.5625rem]" />
                      <span className="text-sm font-semibold">{c?.name}</span>
                      {p.approval !== "APPROVED" && (
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium",
                            p.approval === "PENDING" ? "bg-standby/12 text-standby-ink" : "bg-fault/10 text-fault-ink",
                          )}
                        >
                          {p.approval === "PENDING" ? "In review" : "Changes requested"}
                        </span>
                      )}
                      <span className="text-muted-foreground ml-auto flex gap-1.5">
                        {platformsOf(p, state.clients).map((pl) => (
                          <PlatformIcon key={pl} platform={pl} brand className="size-3.5" />
                        ))}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed">{p.body}</p>
                  </div>
                </div>
                <div className="bg-muted/35 flex items-center gap-1 border-t px-2.5 py-1.5">
                  {editable && p.approval !== "APPROVED" && (
                    <>
                      <Btn variant="ghost" className="text-live-ink h-8 px-2.5 text-[0.8125rem]" onClick={() => { dispatch({ type: "approval", id: p.id, approval: "APPROVED" }); toast("Approved. It'll go out on schedule."); }}>
                        <Check /> Approve
                      </Btn>
                      {p.approval === "PENDING" && (
                        <Btn variant="ghost" className="h-8 px-2.5 text-[0.8125rem]" onClick={() => { dispatch({ type: "approval", id: p.id, approval: "CHANGES_REQUESTED" }); toast("Changes requested. The author gets a note."); }}>
                          <X /> Request changes
                        </Btn>
                      )}
                    </>
                  )}
                  {editable && p.approval === "APPROVED" && (
                    <Btn variant="ghost" className="h-8 px-2.5 text-[0.8125rem]" onClick={() => { dispatch({ type: "approval", id: p.id, approval: "PENDING" }); toast("Sent for approval."); }}>
                      Send for approval
                    </Btn>
                  )}
                  {p.notes > 0 && (
                    <span className="text-muted-foreground flex items-center gap-1 px-2 text-[0.8125rem]">
                      <MessageSquare className="size-4" /> {p.notes}
                    </span>
                  )}
                  <span className="ml-auto flex gap-1">
                    {editable && (
                      <Btn variant="ghost" className="h-8 px-2.5 text-[0.8125rem]" onClick={() => go({ view: "compose", editId: p.id })}>
                        <Pencil /> Edit
                      </Btn>
                    )}
                    {p.status === "FAILED" && (
                      <Btn variant="outline" className="h-8 px-2.5 text-[0.8125rem]" onClick={() => { dispatch({ type: "publishing", ids: [p.id] }); toast("Retrying now…"); }}>
                        <RotateCw /> Retry
                      </Btn>
                    )}
                    <Btn variant="ghost" className="hover:text-destructive h-8 px-2" onClick={() => { dispatch({ type: "delete", id: p.id }); toast("Post deleted."); }}>
                      <Trash2 />
                    </Btn>
                  </span>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
        {shown.length === 0 && (
          <li className="bg-card text-muted-foreground rounded-2xl border py-14 text-center text-sm">Nothing here.</li>
        )}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Clients                                                             */
/* ------------------------------------------------------------------ */

export function ClientsView() {
  const { state, dispatch, toast, go } = useDemo();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const used = new Set(state.clients.map((c) => c.color));
  const [color, setColor] = useState(SWATCHES.find((s) => !used.has(s)) ?? SWATCHES[0]);

  function add() {
    const n = name.trim();
    if (!n) return;
    dispatch({ type: "addClient", client: { id: newId("client"), name: n, color, accounts: [] } });
    toast(`${n} added. Connect their accounts next.`);
    setName("");
    setAdding(false);
  }

  return (
    <div>
      <Header
        eyebrow={
          <>
            Clients <span className="text-border">/</span> {state.clients.length} clients
          </>
        }
        title={
          <>
            Your <em>roster.</em>
          </>
        }
        actions={
          <Btn onClick={() => setAdding(true)}>
            <Plus /> Add client
          </Btn>
        }
      />
      <div className="grid grid-cols-3 gap-4">
        <AnimatePresence>
          {adding && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="bg-card border-primary/50 flex flex-col gap-3 rounded-2xl border p-5 shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_12%,transparent)]"
            >
              <div className="flex items-center gap-3">
                <ClientMonogram name={name.trim() || "New client"} color={color} className="size-10 rounded-xl" />
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                  placeholder="Client name"
                  className="bg-background focus:border-ring h-9 min-w-0 flex-1 rounded-lg border px-3 text-sm outline-none"
                />
              </div>
              <div className="flex gap-1.5">
                {SWATCHES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-label={`Colour ${s}`}
                    onClick={() => setColor(s)}
                    className={cn("size-7 rounded-lg transition-transform hover:scale-110", color === s && "ring-foreground ring-offset-card ring-2 ring-offset-2")}
                    style={{ backgroundColor: s }}
                  />
                ))}
              </div>
              <div className="mt-auto flex justify-end gap-2">
                <Btn variant="ghost" onClick={() => setAdding(false)}>Cancel</Btn>
                <Btn onClick={add}>Add client</Btn>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {state.clients.map((c) => {
          const posts = state.posts.filter((p) => p.clientId === c.id).length;
          return (
            <div key={c.id} className="bg-card relative flex flex-col overflow-hidden rounded-2xl border">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-20"
                style={{ background: `linear-gradient(180deg, color-mix(in oklch, ${c.color} 14%, transparent), transparent)` }}
              />
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: "scope", clientId: c.id });
                  go({ view: "dashboard" });
                }}
                className="relative flex items-center gap-3 p-4 pb-3 text-left"
                title="Focus the app on this client"
              >
                <ClientMonogram name={c.name} color={c.color} className="size-10 rounded-xl" />
                <span className="min-w-0">
                  <span className="block truncate text-[0.9375rem] font-semibold">{c.name}</span>
                  <span className="text-muted-foreground font-mono text-[0.625rem] tracking-wide uppercase">
                    {posts} posts · {c.accounts.length} accounts
                  </span>
                </span>
              </button>
              <div className="relative flex-1 px-4">
                {c.accounts.length === 0 ? (
                  <div className="text-muted-foreground rounded-xl border border-dashed py-3 text-center text-xs">No accounts yet.</div>
                ) : (
                  <ul className="divide-border divide-y rounded-xl border">
                    {c.accounts.map((a) => (
                      <li key={a.id} className="group/acct flex items-center gap-2.5 px-3 py-2 text-sm">
                        <PlatformIcon platform={a.platform} brand className="size-4" />
                        <span className="min-w-0 flex-1 truncate">{a.handle}</span>
                        <span className={cn("flex items-center gap-1.5 text-[0.6875rem] font-medium", a.health === "ok" ? "text-live-ink" : "text-standby-ink")}>
                          <span className={cn("tally size-1.5", a.health === "ok" ? "text-live" : "text-standby")} data-live={a.health === "warn" ? "true" : undefined} />
                          {a.healthLabel}
                        </span>
                        <button
                          type="button"
                          aria-label="Disconnect"
                          onClick={() => toast(`In the real app this disconnects ${a.handle} after you confirm.`)}
                          className="text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover/acct:opacity-100"
                        >
                          <Unplug className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="relative mt-3 flex items-center gap-1.5 border-t px-4 py-2.5">
                <span className="label-caps mr-auto">Connect</span>
                {(["LINKEDIN", "INSTAGRAM", "YOUTUBE"] as Platform[]).map((pl) => (
                  <button
                    key={pl}
                    type="button"
                    onClick={() => toast(`In the real app, ${c.name}'s owner signs in on ${PLATFORM_META[pl].label}'s own consent screen.`)}
                    title={`Connect ${PLATFORM_META[pl].label}`}
                    className="bg-card hover:bg-accent flex h-7 w-10 items-center justify-center gap-0.5 rounded-md shadow-[0_0_0_1px_var(--border)]"
                  >
                    <PlatformIcon platform={pl} brand className="size-3.5" />
                    <Plus className="text-muted-foreground size-2.5" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

