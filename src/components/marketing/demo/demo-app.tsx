"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  CalendarDays,
  Check,
  ChevronsUpDown,
  CornerDownLeft,
  Gauge,
  ListOrdered,
  Moon,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  Sun,
  Users,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ClientDot, PlatformIcon } from "@/components/post-bits";
import { formatCountdown } from "@/components/fx/countdown";
import { cn } from "@/lib/utils";
import { DemoProvider, useDemo, useNow } from "./store";
import { platformsOf, type DemoView } from "./model";
import {
  CalendarView,
  ClientsView,
  DashboardView,
  QueueView,
} from "./views";
import { ComposeView } from "./compose-view";

const NAV: { view: DemoView; label: string; icon: typeof Gauge }[] = [
  { view: "dashboard", label: "Dashboard", icon: Gauge },
  { view: "compose", label: "Compose", icon: PenLine },
  { view: "calendar", label: "Calendar", icon: CalendarDays },
  { view: "queue", label: "Queue", icon: ListOrdered },
  { view: "clients", label: "Clients", icon: Users },
];

/** Renders children at a fixed design size, scaled to the container's width. */
function Scaled({
  width,
  height,
  label,
  children,
}: {
  width: number;
  height: number;
  label: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div
      ref={ref}
      data-demo={label}
      className="relative w-full overflow-hidden"
      style={{ height: height * scale }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ width, height, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

function Sidebar() {
  const { state, go, scopedPosts, clientOf } = useDemo();
  const now = useNow();
  const view = state.route.view;
  const next = useMemo(
    () =>
      scopedPosts
        .filter((p) => p.status === "SCHEDULED" && p.at !== null && p.at > now)
        .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))[0],
    [scopedPosts, now],
  );
  const client = next ? clientOf(next.clientId) : undefined;

  return (
    <aside className="flex w-[218px] shrink-0 flex-col py-3 pr-2 pl-3">
      <div className="flex h-10 items-center px-2">
        <Logo className="h-7 w-auto" />
      </div>
      <button
        type="button"
        onClick={() => go({ view: "compose" })}
        className="bg-primary text-primary-foreground mt-4 flex h-9 items-center justify-between rounded-lg px-3 text-[0.8125rem] font-medium shadow-[inset_0_1px_0_0_rgb(255_255_255/0.2),0_1px_2px_0_rgb(10_20_60/0.25)] transition-[filter] hover:brightness-95"
      >
        <span className="flex items-center gap-2">
          <Plus className="size-4" /> New post
        </span>
        <span className="rounded-[5px] border border-white/20 bg-white/15 px-1 font-mono text-[0.625rem]">N</span>
      </button>
      <div className="label-caps mt-6 px-3 pb-2">Publish</div>
      <nav className="space-y-0.5">
        {NAV.map((n, i) => {
          const active = view === n.view;
          return (
            <div key={n.view}>
              {i === 4 && <div className="label-caps px-3 pt-4 pb-2">Manage</div>}
              <button
                type="button"
                onClick={() => go({ view: n.view })}
                className={cn(
                  "relative flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[0.8125rem] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="demo-nav"
                    className="bg-sidebar-accent absolute inset-0 rounded-lg shadow-[0_0_0_1px_var(--sidebar-border),0_1px_3px_0_rgb(20_20_40/0.06)]"
                    transition={{ type: "spring", stiffness: 520, damping: 42 }}
                  />
                )}
                <n.icon className={cn("relative size-[1.05rem]", active && "text-primary")} />
                <span className="relative">{n.label}</span>
              </button>
            </div>
          );
        })}
      </nav>

      <div className="mt-auto">
        {next && client && view !== "dashboard" && (
          <button
            type="button"
            onClick={() => go({ view: "compose", editId: next.id })}
            className="border-beam bg-card hover:bg-accent/60 mb-3 block w-full rounded-xl border p-3 text-left transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="label-caps flex items-center gap-1.5">
                <span className="tally text-standby" data-live="true" /> Next cue
              </span>
              <span className="text-muted-foreground flex gap-1">
                {platformsOf(next, state.clients).map((p) => (
                  <PlatformIcon key={p} platform={p} className="size-3" />
                ))}
              </span>
            </div>
            <div className="mt-1.5 font-mono text-xl leading-none font-medium tracking-tight tabular-nums">
              {formatCountdown((next.at ?? 0) - now)}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs font-medium">
              <ClientDot color={client.color} />
              <span className="truncate">{client.name}</span>
            </div>
          </button>
        )}
        <div className="flex items-center gap-2.5 rounded-xl p-1.5">
          <span className="bg-foreground text-background grid size-8 place-items-center rounded-lg font-mono text-[0.6875rem] font-semibold">
            RK
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-[0.8125rem] font-medium">Riya Kapoor</span>
            <span className="text-muted-foreground block text-xs">Northlight Studio</span>
          </span>
        </div>
      </div>
    </aside>
  );
}

function ClientSwitcher() {
  const { state, dispatch } = useDemo();
  const [open, setOpen] = useState(false);
  const active = state.clients.find((c) => c.id === state.scope);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "hover:bg-accent flex h-8 items-center gap-2 rounded-lg px-2.5 text-[0.8125rem] font-medium transition-colors",
          (active || open) && "bg-card shadow-[0_0_0_1px_var(--border)]",
        )}
      >
        {active ? (
          <ClientDot color={active.color} />
        ) : (
          <span className="flex -space-x-1">
            {state.clients.slice(0, 3).map((c) => (
              <span key={c.id} className="ring-background size-2.5 rounded-full ring-2" style={{ backgroundColor: c.color }} />
            ))}
          </span>
        )}
        {active?.name ?? "All clients"}
        <ChevronsUpDown className="text-muted-foreground size-3.5" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14 }}
              className="bg-popover absolute top-10 left-0 z-40 w-60 rounded-xl p-1 shadow-float ring-1 ring-foreground/10"
            >
              {[{ id: null as string | null, name: "All clients", color: "" }, ...state.clients].map((c) => (
                <button
                  key={c.id ?? "all"}
                  type="button"
                  onClick={() => {
                    dispatch({ type: "scope", clientId: c.id });
                    setOpen(false);
                  }}
                  className="hover:bg-accent flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm"
                >
                  {c.id ? <ClientDot color={c.color} /> : <span className="bg-muted-foreground/40 size-2.5 rounded-full" />}
                  <span className="truncate">{c.name}</span>
                  {state.scope === c.id && <Check className="text-primary ml-auto size-4" />}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Palette() {
  const { state, dispatch, go } = useDemo();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const items = useMemo(() => {
    const all = [
      { label: "New post", hint: "Action", run: () => go({ view: "compose" }) },
      { label: "Show failed posts", hint: "Action", run: () => go({ view: "queue", filter: "FAILED" }) },
      { label: "Show drafts", hint: "Action", run: () => go({ view: "queue", filter: "DRAFT" }) },
      ...NAV.map((n) => ({ label: `Go to ${n.label}`, hint: "Page", run: () => go({ view: n.view }) })),
      ...state.clients.map((c) => ({
        label: c.name,
        hint: "Focus client",
        run: () => dispatch({ type: "scope", clientId: c.id }),
      })),
    ];
    const s = q.trim().toLowerCase();
    return s ? all.filter((i) => i.label.toLowerCase().includes(s)) : all;
  }, [q, state.clients, go, dispatch]);

  return (
    <AnimatePresence>
      {state.paletteOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-40 grid place-items-start justify-center bg-[oklch(0.15_0.02_270/0.3)] pt-24 backdrop-blur-[2px]"
          onClick={() => dispatch({ type: "palette", open: false })}
        >
          <motion.div
            initial={{ y: 8, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-popover w-[520px] overflow-hidden rounded-2xl shadow-float ring-1 ring-foreground/10"
          >
            <div className="flex items-center gap-3 border-b px-4">
              <Search className="text-muted-foreground size-4" />
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSel(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") setSel((i) => Math.min(i + 1, items.length - 1));
                  else if (e.key === "ArrowUp") setSel((i) => Math.max(i - 1, 0));
                  else if (e.key === "Enter") items[sel]?.run();
                  else if (e.key === "Escape") dispatch({ type: "palette", open: false });
                  else return;
                  e.preventDefault();
                }}
                placeholder="Search pages, clients and actions…"
                className="placeholder:text-muted-foreground h-12 w-full bg-transparent text-[0.9375rem] outline-none"
              />
            </div>
            <ul className="max-h-72 overflow-y-auto p-1.5">
              {items.length === 0 && (
                <li className="text-muted-foreground py-8 text-center text-sm">Nothing matches that.</li>
              )}
              {items.map((it, i) => (
                <li key={it.label}>
                  <button
                    type="button"
                    onMouseEnter={() => setSel(i)}
                    onClick={it.run}
                    className={cn(
                      "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm",
                      i === sel && "bg-accent",
                    )}
                  >
                    {it.label}
                    <span className="text-muted-foreground ml-auto font-mono text-[0.625rem] tracking-wider uppercase">
                      {it.hint}
                    </span>
                    {i === sel && <CornerDownLeft className="text-muted-foreground size-3.5" />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Topbar() {
  const { state, dispatch } = useDemo();
  const { resolvedTheme, setTheme } = useTheme();
  const page = NAV.find((n) => n.view === state.route.view);

  return (
    <header className="bg-background/80 flex h-13 shrink-0 items-center gap-1.5 border-b px-6 backdrop-blur-xl">
      <span className="text-muted-foreground px-1 text-[0.8125rem]">Northlight Studio</span>
      <span className="text-border text-lg font-light">/</span>
      <ClientSwitcher />
      {page && (
        <>
          <span className="text-border text-lg font-light">/</span>
          <span className="flex items-center gap-1.5 px-1 text-[0.8125rem] font-medium">
            <page.icon className="text-muted-foreground size-3.5" /> {page.label}
          </span>
        </>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => dispatch({ type: "palette", open: true })}
          className="text-muted-foreground hover:text-foreground bg-card flex h-8 w-56 items-center gap-2 rounded-lg px-2.5 text-[0.8125rem] shadow-[0_0_0_1px_var(--border)]"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Search or jump to…</span>
          <span className="bg-muted rounded-[5px] border px-1 font-mono text-[0.625rem]">⌘K</span>
        </button>
        <button
          type="button"
          title="Switch theme"
          aria-label="Switch theme"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="hover:bg-accent text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-lg"
        >
          {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <button
          type="button"
          title="Reset the demo"
          aria-label="Reset the demo"
          onClick={() => dispatch({ type: "reset", now: Date.now(), view: "dashboard" })}
          className="hover:bg-accent text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-lg"
        >
          <RotateCcw className="size-4" />
        </button>
      </div>
    </header>
  );
}

function Toast() {
  const { state } = useDemo();
  return (
    <div className="pointer-events-none absolute right-5 bottom-5 z-50">
      <AnimatePresence>
        {state.toast && (
          <motion.div
            key={state.toast.id}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            className="bg-popover flex max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-[0.8125rem] shadow-float ring-1 ring-foreground/10"
          >
            <span className="bg-live grid size-5 shrink-0 place-items-center rounded-full text-white">
              <Check className="size-3" strokeWidth={3} />
            </span>
            {state.toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ViewSwitch() {
  const { state } = useDemo();
  const key = `${state.route.view}:${state.route.editId ?? ""}:${state.route.day ?? ""}:${state.route.filter ?? ""}`;
  const View = {
    dashboard: DashboardView,
    compose: ComposeView,
    calendar: CalendarView,
    queue: QueueView,
    clients: ClientsView,
  }[state.route.view];
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <View />
      </motion.div>
    </AnimatePresence>
  );
}

function FullFrame() {
  const { dispatch } = useDemo();
  // "N" for a new post while the pointer is over the demo, like the real app.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let over = false;
    const enter = () => (over = true);
    const leave = () => (over = false);
    const key = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? "");
      if (!over || typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "n") dispatch({ type: "nav", route: { view: "compose" } });
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    window.addEventListener("keydown", key);
    return () => {
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      window.removeEventListener("keydown", key);
    };
  }, [dispatch]);

  return (
    <div ref={ref} className="bg-canvas text-foreground flex h-full font-sans">
      <Sidebar />
      <div className="min-w-0 flex-1 py-2 pr-2">
        <div className="bg-background relative flex h-full flex-col overflow-hidden rounded-2xl shadow-[0_0_0_1px_var(--border),0_1px_3px_0_rgb(20_20_40/0.04)]">
          <Topbar />
          <main className="flex-1 overflow-y-auto px-8 pt-7 pb-10">
            <ViewSwitch />
          </main>
          <Palette />
          <Toast />
        </div>
      </div>
    </div>
  );
}

function BareFrame() {
  return (
    <div className="bg-background text-foreground relative h-full overflow-y-auto px-7 py-6 font-sans">
      <ViewSwitch />
      <Toast />
    </div>
  );
}

/**
 * A working, in-browser copy of the Cue app on sample data. `bare` drops the
 * shell and shows just the current view (used for focused demos).
 */
export default function DemoApp({
  initialView = "dashboard",
  bare = false,
  width = 1280,
  height = 800,
}: {
  initialView?: DemoView;
  bare?: boolean;
  width?: number;
  height?: number;
}) {
  return (
    <DemoProvider initialView={initialView} bare={bare}>
      <Scaled width={width} height={height} label={bare ? `${initialView}-focused` : "app"}>
        {bare ? <BareFrame /> : <FullFrame />}
      </Scaled>
    </DemoProvider>
  );
}

