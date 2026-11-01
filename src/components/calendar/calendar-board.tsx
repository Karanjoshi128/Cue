"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, addMonths, format } from "date-fns";
import { toast } from "sonner";
import {
  CalendarSearch,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Plus,
  Rows2,
  Rows4,
} from "lucide-react";
import { duplicatePost, reschedulePost } from "@/lib/actions";
import {
  CAL_COOKIE,
  calendarHref,
  serializePrefs,
  type CalendarFilters,
  type CalendarPost,
  type CalendarPrefs,
  type CalendarView,
  type ClientOption,
  type Density,
} from "@/lib/calendar-shared";
import { SCOPE_COOKIE } from "@/lib/scope";
import { PageHeader, Kbd } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { CalendarContext, type CalendarApi } from "./context";
import { AgendaView } from "./agenda-view";
import { FilterBar } from "./filter-bar";
import { MonthView } from "./month-view";
import { PostPeek } from "./post-peek";
import { groupUnscheduled, QuietClients, UnscheduledPanel } from "./unscheduled-panel";
import { WeekView } from "./week-view";
import { dayKey, slotDate, tzCtx, zoneLabel } from "./time";

export interface CalendarBoardProps {
  view: CalendarView;
  /** yyyy-MM-dd the view is anchored on. */
  anchor: string;
  /** The days the grid shows (week: 7, month: 35-42, list: days with posts). */
  days: string[];
  posts: CalendarPost[];
  unscheduled: CalendarPost[];
  clients: ClientOption[];
  filters: CalendarFilters;
  /** Clients the user picked before the topbar switcher narrowed things. */
  savedClients: string[];
  scopeClient?: ClientOption;
  timeZone: string;
  nowIso: string;
  density: Density;
  drawer: boolean;
  /** A post to open on load (a copied link). */
  openPostId?: string;
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

const segment = (active: boolean) =>
  cn(
    "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
    active
      ? "bg-card text-foreground shadow-[0_0_0_1px_var(--border),0_1px_2px_0_rgb(20_20_40/0.06)]"
      : "text-muted-foreground hover:text-foreground",
  );

export function CalendarBoard(props: CalendarBoardProps) {
  const { view, anchor, days, clients, filters, scopeClient, timeZone } = props;
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const ctx = useMemo(() => tzCtx(timeZone), [timeZone]);
  const now = useMemo(() => new Date(props.nowIso), [props.nowIso]);

  // Local copies so a drag shows at once; the server refresh then confirms.
  const [posts, setPosts] = useState(props.posts);
  const [unscheduled, setUnscheduled] = useState(props.unscheduled);
  // Fresh server data replaces the local copies (React's "reset on prop
  // change" pattern: compare during render, no effect).
  const [seen, setSeen] = useState({ posts: props.posts, unscheduled: props.unscheduled });
  if (seen.posts !== props.posts || seen.unscheduled !== props.unscheduled) {
    setSeen({ posts: props.posts, unscheduled: props.unscheduled });
    setPosts(props.posts);
    setUnscheduled(props.unscheduled);
  }

  const [density, setDensity] = useState<Density>(props.density);
  const [drawer, setDrawer] = useState(props.drawer);
  const [drawerSheet, setDrawerSheet] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(props.openPostId ?? null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<CalendarPost | null>(null);

  // ---- remembered preferences (cookie, read by the server on the next visit)
  const prefs = useRef<CalendarPrefs>({
    view,
    density: props.density,
    drawer: props.drawer,
    filters: { ...filters, clients: scopeClient ? props.savedClients : filters.clients },
  });
  const savePrefs = useCallback((patch: Partial<CalendarPrefs>) => {
    prefs.current = { ...prefs.current, ...patch };
    document.cookie = `${CAL_COOKIE}=${serializePrefs(prefs.current)}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  // ---- navigation
  const go = useCallback(
    (next: { view?: CalendarView; anchor?: string; filters?: CalendarFilters }) => {
      const v = next.view ?? view;
      const f = next.filters ?? filters;
      savePrefs({
        view: v,
        filters: { ...f, clients: scopeClient ? props.savedClients : f.clients },
      });
      startNav(() => router.push(calendarHref(v, next.anchor ?? anchor, f), { scroll: false }));
    },
    [view, filters, anchor, router, savePrefs, scopeClient, props.savedClients],
  );
  const todayKey = dayKey(now, ctx);
  const step = useCallback(
    (delta: number) => {
      const base = slotDate(anchor, 12 * 60, timeZone);
      const next = view === "month" ? addMonths(base, delta, ctx) : addDays(base, delta * 7, ctx);
      go({ anchor: dayKey(next, ctx) });
    },
    [anchor, view, ctx, timeZone, go],
  );
  const dateInput = useRef<HTMLInputElement>(null);

  // ---- drag and drop
  const canLand = useCallback(
    (post: CalendarPost, when: Date) =>
      post.status !== "SCHEDULED" || when.getTime() > Date.now() + 60_000,
    [],
  );

  // Undo calls drop from inside drop, so it goes through a ref.
  const dropRef = useRef<((post: CalendarPost, when: Date, copy: boolean) => Promise<void>) | null>(null);
  const drop = useCallback(
    async (post: CalendarPost, when: Date, copy: boolean) => {
      dragRef.current = null;
      setDraggingId(null);
      const label = format(when, "EEE d MMM, h:mm a", ctx);
      if (copy) {
        const res = await duplicatePost(post.id, when.toISOString());
        if (!res.ok) return void toast.error(res.error);
        toast.success(`Copied to ${label} as a draft`, {
          action: { label: "Open", onClick: () => router.push(`/composer?edit=${res.data.id}`) },
        });
        router.refresh();
        return;
      }
      if (!canLand(post, when)) {
        return void toast.error("Scheduled posts can only move to a time in the future.");
      }
      const prev = post.scheduledAt;
      if (prev && Math.abs(new Date(prev).getTime() - when.getTime()) < 60_000) return;

      const iso = when.toISOString();
      const moved = { ...post, scheduledAt: iso };
      const snapshot = { posts, unscheduled };
      setPosts((ps) => (ps.some((p) => p.id === post.id) ? ps.map((p) => (p.id === post.id ? moved : p)) : [...ps, moved]));
      setUnscheduled((us) => us.map((p) => (p.id === post.id ? moved : p)));

      const res = await reschedulePost(post.id, iso);
      if (!res.ok) {
        setPosts(snapshot.posts);
        setUnscheduled(snapshot.unscheduled);
        return void toast.error(res.error);
      }
      toast.success(`Moved to ${label}`, {
        description: post.status === "DRAFT" ? "Still a draft. Open it to schedule it." : undefined,
        action: prev
          ? { label: "Undo", onClick: () => void dropRef.current?.(moved, new Date(prev), false) }
          : undefined,
      });
      router.refresh();
    },
    [ctx, canLand, posts, unscheduled, router],
  );
  useEffect(() => {
    dropRef.current = drop;
  }, [drop]);

  const api: CalendarApi = {
    timeZone,
    ctx,
    now,
    density,
    composerClient: scopeClient?.id ?? (filters.clients.length === 1 ? filters.clients[0] : undefined),
    draggingId,
    dragPost: () => dragRef.current,
    startDrag: (p) => {
      dragRef.current = p;
      setDraggingId(p.id);
    },
    endDrag: () => {
      dragRef.current = null;
      setDraggingId(null);
    },
    drop: (p, when, copy) => void drop(p, when, copy),
    canLand,
    open: setPeekId,
  };

  // ---- keyboard: T today, ←/→ period, W/M/L views, U drawer, C density
  const setDensityPref = useCallback(
    (d: Density) => {
      setDensity(d);
      savePrefs({ density: d });
    },
    [savePrefs],
  );
  const toggleDrawer = useCallback(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setDrawer((d) => {
        savePrefs({ drawer: !d });
        return !d;
      });
    } else {
      setDrawerSheet((s) => !s);
    }
  }, [savePrefs]);
  useEffect(() => {
    let gAt = 0;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || peekId) return;
      const k = e.key.toLowerCase();
      // "g" then a letter is the app's go-to shortcut; leave those alone.
      if (k === "g") return void (gAt = Date.now());
      if (Date.now() - gAt < 900) return;
      const actions: Record<string, () => void> = {
        t: () => go({ anchor: todayKey }),
        arrowleft: () => view !== "list" && step(-1),
        arrowright: () => view !== "list" && step(1),
        w: () => go({ view: "week" }),
        m: () => go({ view: "month" }),
        l: () => go({ view: "list" }),
        u: toggleDrawer,
        c: () => setDensityPref(density === "compact" ? "comfortable" : "compact"),
      };
      if (actions[k]) {
        e.preventDefault();
        actions[k]();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peekId, go, step, view, todayKey, toggleDrawer, setDensityPref, density]);

  // ---- derived
  const anchorDate = slotDate(anchor, 12 * 60, timeZone);
  const first = days[0] ? slotDate(days[0], 12 * 60, timeZone) : anchorDate;
  const last = days.length ? slotDate(days[days.length - 1], 12 * 60, timeZone) : anchorDate;
  const title =
    view === "week" ? (
      <>
        {format(first, "d MMM", ctx)} <em>to</em> {format(last, "d MMM", ctx)}
      </>
    ) : view === "month" ? (
      <>
        {format(anchorDate, "MMMM", ctx)} <em>{format(anchorDate, "yyyy", ctx)}</em>
      </>
    ) : (
      <>
        Coming <em>up</em>
      </>
    );
  const peekPost =
    posts.find((p) => p.id === peekId) ?? unscheduled.find((p) => p.id === peekId) ?? null;
  const pending = groupUnscheduled(unscheduled).total;
  const quietCandidates = scopeClient
    ? []
    : filters.clients.length
      ? clients.filter((c) => filters.clients.includes(c.id))
      : clients;
  const lastKey = days[days.length - 1] ?? anchor;
  const showQuiet =
    view !== "list" && !filters.platforms.length && !filters.statuses.length && lastKey >= todayKey;
  const firstOpenDay = days.find((d) => d >= todayKey) ?? todayKey;

  return (
    <CalendarContext.Provider value={api}>
      <div className="mx-auto max-w-[96rem] space-y-5">
        <PageHeader
          eyebrow={
            <>
              Calendar
              <span className="text-border">/</span>
              {posts.length} post{posts.length === 1 ? "" : "s"}
              <span className="text-border">/</span>
              {zoneLabel(timeZone)}
            </>
          }
          title={title}
          actions={
            <>
              {view !== "list" && (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label={view === "week" ? "Previous week" : "Previous month"}>
                    <ChevronLeft />
                  </Button>
                  <Button variant="outline" onClick={() => go({ anchor: todayKey })}>
                    Today
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => step(1)} aria-label={view === "week" ? "Next week" : "Next month"}>
                    <ChevronRight />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Jump to a date"
                    onClick={() => {
                      const el = dateInput.current;
                      if (!el) return;
                      try {
                        el.showPicker();
                      } catch {
                        el.focus();
                      }
                    }}
                    className="relative"
                  >
                    <CalendarSearch />
                    <input
                      ref={dateInput}
                      type="date"
                      tabIndex={-1}
                      aria-hidden
                      value={anchor}
                      onChange={(e) => e.target.value && go({ anchor: e.target.value })}
                      className="pointer-events-none absolute inset-0 opacity-0"
                    />
                  </Button>
                </div>
              )}
              <Button render={<Link href="/composer" />}>
                <Plus /> New post
              </Button>
            </>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-muted flex items-center gap-0.5 rounded-lg p-0.5" role="group" aria-label="View">
              {(["week", "month", "list"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => go({ view: v })}
                  aria-pressed={view === v}
                  title={`${v[0].toUpperCase()}${v.slice(1)} (${v[0].toUpperCase()})`}
                  className={segment(view === v)}
                >
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <FilterBar
              filters={filters}
              clients={clients}
              scopeClient={scopeClient}
              onChange={(f) => go({ filters: f })}
              onShowAllClients={() => {
                document.cookie = `${SCOPE_COOKIE}=all; path=/; max-age=31536000; samesite=lax`;
                router.refresh();
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            {view !== "list" && (
              <div className="bg-muted hidden items-center gap-0.5 rounded-lg p-0.5 md:flex" role="group" aria-label="Density">
                <button type="button" onClick={() => setDensityPref("comfortable")} aria-pressed={density === "comfortable"} title="Comfortable (C)" className={segment(density === "comfortable")}>
                  <Rows2 className="size-3.5" />
                </button>
                <button type="button" onClick={() => setDensityPref("compact")} aria-pressed={density === "compact"} title="Compact (C)" className={segment(density === "compact")}>
                  <Rows4 className="size-3.5" />
                </button>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={toggleDrawer} aria-pressed={drawer} title="Unscheduled (U)">
              <Inbox /> Unscheduled
              {pending > 0 && (
                <span className="bg-primary text-primary-foreground grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[0.625rem]">
                  {pending}
                </span>
              )}
            </Button>
          </div>
        </div>

        {showQuiet && (
          <QuietClients
            clients={quietCandidates}
            posts={posts}
            rangeLabel={view === "week" ? "this week" : "this month"}
            firstOpenDay={firstOpenDay}
          />
        )}

        <div className={cn("grid gap-5", drawer && "lg:grid-cols-[minmax(0,1fr)_17rem]")}>
          <div className={cn("min-w-0 transition-opacity", navigating && "opacity-60")}>
            {view === "week" && (
              <>
                <div className="hidden md:block">
                  <WeekView days={days} posts={posts} />
                </div>
                <div className="md:hidden">
                  <AgendaView days={days} posts={posts} showEmptyDays emptyLabel="Nothing this week." />
                </div>
              </>
            )}
            {view === "month" && (
              <>
                <div className="hidden md:block">
                  <MonthView days={days} posts={posts} monthKey={anchor.slice(0, 7)} />
                </div>
                <div className="md:hidden">
                  <AgendaView
                    days={days.filter((d) => d.startsWith(anchor.slice(0, 7)))}
                    posts={posts}
                    showEmptyDays={false}
                    emptyLabel="Nothing this month."
                  />
                </div>
              </>
            )}
            {view === "list" && (
              <AgendaView days={days} posts={posts} showEmptyDays={false} emptyLabel="Nothing coming up." />
            )}
          </div>
          {drawer && (
            <UnscheduledPanel
              posts={unscheduled}
              className="hidden lg:block lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto"
            />
          )}
        </div>

        <p className="text-muted-foreground hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs md:flex">
          <span className="flex items-center gap-1"><Kbd>T</Kbd> today</span>
          <span className="flex items-center gap-1"><Kbd>←</Kbd><Kbd>→</Kbd> move</span>
          <span className="flex items-center gap-1"><Kbd>W</Kbd><Kbd>M</Kbd><Kbd>L</Kbd> views</span>
          <span className="flex items-center gap-1"><Kbd>C</Kbd> density</span>
          <span className="flex items-center gap-1"><Kbd>U</Kbd> unscheduled</span>
          <span>Drag a post to move it. Hold <Kbd>Alt</Kbd> while dropping to copy it.</span>
        </p>
      </div>

      <Sheet open={drawerSheet} onOpenChange={setDrawerSheet}>
        <SheetContent side="right" className="w-full overflow-y-auto p-5 sm:max-w-sm">
          <SheetTitle className="sr-only">Unscheduled</SheetTitle>
          <UnscheduledPanel posts={unscheduled} />
        </SheetContent>
      </Sheet>

      <PostPeek post={peekPost} onClose={() => setPeekId(null)} />
    </CalendarContext.Provider>
  );
}
