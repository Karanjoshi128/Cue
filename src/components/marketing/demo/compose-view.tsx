"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Platform } from "@prisma/client";
import { AlertTriangle, CalendarClock, Check, Save, Send } from "lucide-react";
import {
  ClientMonogram,
  PlatformIcon,
  PLATFORM_META,
} from "@/components/post-bits";
import {
  InstagramPreview,
  LinkedInPreview,
  YouTubePreview,
} from "@/components/post-preview";
import { formatCountdown } from "@/components/fx/countdown";
import { cn } from "@/lib/utils";
import { startOfDay, useDemo, useNow } from "./store";
import { DEMO_IMAGES } from "./model";

const LIMITS: Record<Platform, number> = { LINKEDIN: 3000, INSTAGRAM: 2200, YOUTUBE: 5000 };
const DEFAULT_IMAGE: Record<string, string | undefined> = {
  fernwood: DEMO_IMAGES.latte,
  atlas: DEMO_IMAGES.library,
  verdant: DEMO_IMAGES.plant,
};

function at(dayOffset: number, h: number, m = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}
function nextMonday9() {
  const d = new Date();
  const add = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + add);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

// "In 1 minute" exists only in the demo, so visitors can watch a cue go live.
const PRESETS: { label: string; at: () => number; demo?: boolean }[] = [
  { label: "In 1 minute", at: () => Math.ceil((Date.now() + 60_000) / 1000) * 1000, demo: true },
  { label: "In an hour", at: () => Math.ceil((Date.now() + 3600_000) / 300_000) * 300_000 },
  { label: "Tomorrow 9 AM", at: () => at(1, 9) },
  { label: "Monday 9 AM", at: nextMonday9 },
];

const toLocalInput = (t: number) => {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function Ring({ used, limit }: { used: number; limit: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const over = used > limit;
  return (
    <svg viewBox="0 0 24 24" className="size-6 -rotate-90" aria-hidden>
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2.5" className="stroke-border" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(used / limit, 1))}
        className={cn("transition-[stroke-dashoffset] duration-300", over ? "stroke-fault" : "stroke-primary")}
      />
    </svg>
  );
}

function Step({ n, title, hint, children }: { n: string; title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-card rounded-2xl border p-5">
      <div className="mb-3.5 flex items-baseline gap-3">
        <span className="text-primary font-mono text-[0.6875rem] font-medium tracking-wider">{n}</span>
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
        {hint && <span className="text-muted-foreground ml-auto text-xs">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function ComposeView() {
  const { state, dispatch, go, toast, newDraft, bare, clientOf } = useDemo();
  const now = useNow();
  const editing = state.route.editId ? state.posts.find((p) => p.id === state.route.editId) : undefined;


  const [clientId, setClientId] = useState(editing?.clientId ?? state.scope ?? "atlas");
  const [selected, setSelected] = useState<string[]>(
    editing?.accountIds ?? clientOf(state.scope ?? "atlas")?.accounts.slice(0, 1).map((a) => a.id) ?? [],
  );
  const [body, setBody] = useState(
    editing?.body ?? "Riverside Library opens Monday. One roof, eighty skylights, and daylight at every reading table.",
  );
  const [title, setTitle] = useState(editing?.title ?? "");
  const [when, setWhen] = useState<number | null>(() => {
    if (editing?.at) return editing.at;
    const day = state.route.day;
    if (day === undefined) return null;
    const t = Date.now();
    const nine = day + 9 * 3600_000;
    return nine > t ? nine : Math.ceil((t + 3600_000) / 300_000) * 300_000;
  });
  const [tab, setTab] = useState<Platform | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const client = clientOf(clientId);
  const accounts = client?.accounts ?? [];
  const chosen = accounts.filter((a) => selected.includes(a.id));
  const platforms = [...new Set(chosen.map((a) => a.platform))];
  const shown: Platform = tab && platforms.includes(tab) ? tab : (platforms[0] ?? "LINKEDIN");
  const limit = platforms.length ? Math.min(...platforms.map((p) => LIMITS[p])) : 3000;
  const image = editing?.image ?? DEFAULT_IMAGE[clientId];
  const ytSelected = platforms.includes("YOUTUBE");

  function pickClient(id: string) {
    setClientId(id);
    const c = clientOf(id);
    setSelected(c?.accounts.slice(0, 1).map((a) => a.id) ?? []);
    setProblem(null);
  }

  function finish(message: string, route: Parameters<typeof go>[0]) {
    toast(message);
    if (bare) {
      // The focused demo stays put: clear the form for another go.
      setWhen(null);
      return;
    }
    go(route);
  }

  function submit(action: "draft" | "now" | "schedule") {
    if (selected.length === 0) return setProblem("Choose at least one account.");
    if (!body.trim()) return setProblem("Write a caption first.");
    if (body.length > limit) return setProblem(`That's over the ${limit}-character limit.`);
    if (ytSelected && action !== "draft" && !title.trim()) return setProblem("Add a title for the YouTube video.");
    if (action === "schedule" && (!when || when <= now)) return setProblem("Pick a time in the future.");
    setProblem(null);

    const base = editing ?? newDraft({ clientId });
    const post = {
      ...base,
      clientId,
      accountIds: selected,
      body: body.trim(),
      title: ytSelected ? title.trim() || undefined : undefined,
      image,
      approval: base.approval,
    };
    const name = client?.name ?? "the client";

    if (action === "draft") {
      dispatch({ type: "save", post: { ...post, status: "DRAFT", at: null } });
      finish(`Draft saved for ${name}.`, { view: "queue", filter: "DRAFT" });
    } else if (action === "now") {
      dispatch({ type: "save", post: { ...post, status: "PUBLISHING", at: now, approval: "APPROVED" } });
      finish(`Publishing to ${platforms.map((p) => PLATFORM_META[p].label).join(" and ")} now…`, { view: "queue", filter: "PUBLISHED" });
    } else {
      dispatch({ type: "save", post: { ...post, status: "SCHEDULED", at: when } });
      const d = new Date(when!);
      const label = `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
      finish(`${editing ? "Rescheduled" : "Scheduled"} for ${label}. It's on the calendar.`, { view: "calendar", day: startOfDay(when!) });
    }
  }

  const previewProps = {
    name: client?.name ?? "Client",
    color: client?.color,
    body,
    title,
    images: image && shown !== "YOUTUBE" ? [image] : [],
  };

  return (
    <div>
      {!bare && (
        <div className="mb-6">
          <div className="label-caps flex items-center gap-2">
            {editing ? (
              <>
                <span className="tally text-standby" /> Editing a {editing.status === "DRAFT" ? "draft" : "scheduled post"}
              </>
            ) : (
              "Compose"
            )}
          </div>
          <h1 className="headline mt-2 text-[2.35rem]">
            {editing ? (
              <>
                Fine-tune the <em>cue.</em>
              </>
            ) : (
              <>
                Write it once. <em>Cue it everywhere.</em>
              </>
            )}
          </h1>
        </div>
      )}

      <div className={cn("grid gap-5", bare ? "grid-cols-[1fr_300px]" : "grid-cols-[1fr_340px]")}>
        <div className="min-w-0 space-y-3.5">
          <Step n="01" title="Who it's for" hint={`${selected.length} account${selected.length === 1 ? "" : "s"}`}>
            <div className="flex flex-wrap gap-1.5">
              {state.clients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickClient(c.id)}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-full pr-3 pl-1 text-[0.8125rem] font-medium transition-colors",
                    clientId === c.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ClientMonogram name={c.name} color={c.color} className="size-6 rounded-full text-[0.5rem]" />
                  {c.name.split(" ")[0]}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {accounts.map((a) => {
                const on = selected.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setSelected((s) => (on ? s.filter((x) => x !== a.id) : [...s, a.id]));
                      setProblem(null);
                    }}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all",
                      on ? "border-primary/60 bg-primary/[0.05] shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_12%,transparent)]" : "bg-background hover:border-[color-mix(in_oklch,var(--border),var(--foreground)_16%)]",
                    )}
                  >
                    <span className={cn("grid size-8 place-items-center rounded-lg", on ? "bg-card shadow-[0_0_0_1px_var(--border)]" : "bg-muted")}>
                      <PlatformIcon platform={a.platform} brand={on} className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-medium">{a.handle}</span>
                      <span className="text-muted-foreground text-xs">{PLATFORM_META[a.platform].label}</span>
                    </span>
                    <span className={cn("grid size-5 place-items-center rounded-full", on ? "bg-primary text-primary-foreground" : "shadow-[inset_0_0_0_1.5px_var(--border)]")}>
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
              {accounts.length === 0 && (
                <p className="text-muted-foreground col-span-2 rounded-xl border border-dashed py-3 text-center text-xs">
                  No accounts connected for this client yet.
                </p>
              )}
            </div>
          </Step>

          <Step n="02" title="What it says">
            <div className="bg-background focus-within:border-ring focus-within:ring-ring/15 rounded-xl border transition-[border-color,box-shadow] focus-within:ring-4">
              {ytSelected && (
                <input
                  value={title}
                  maxLength={100}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="YouTube video title"
                  className="w-full border-b bg-transparent px-4 py-2.5 text-sm font-medium outline-none"
                />
              )}
              <textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value.slice(0, 5000));
                  setProblem(null);
                }}
                placeholder="What do you want to say?"
                className={cn("w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed outline-none", bare ? "h-20" : "h-28")}
              />
              <div className="flex items-center justify-between border-t px-3 py-1.5">
                <span className="text-muted-foreground text-xs">
                  {image ? "1 image attached" : "Text only"}
                </span>
                <span className="flex items-center gap-2">
                  {body.length > limit * 0.9 && (
                    <span className={cn("font-mono text-xs", body.length > limit ? "text-fault-ink" : "text-standby-ink")}>
                      {limit - body.length}
                    </span>
                  )}
                  <Ring used={body.length} limit={limit} />
                </span>
              </div>
            </div>
          </Step>

          <Step n="03" title="When it goes out">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setWhen(p.at());
                    setProblem(null);
                  }}
                  className={cn(
                    "h-8 rounded-full border px-3 text-[0.8125rem] font-medium transition-colors",
                    p.demo ? "border-primary/40 text-primary hover:bg-primary/[0.06]" : "bg-background hover:bg-accent",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input
                type="datetime-local"
                value={when ? toLocalInput(when) : ""}
                onChange={(e) => setWhen(e.target.value ? new Date(e.target.value).getTime() : null)}
                className="bg-background focus:border-ring h-9 rounded-lg border px-3 font-mono text-xs outline-none"
              />
              <span className="text-sm">
                {when ? (
                  <>
                    <span className="text-muted-foreground">Goes out in </span>
                    <span className="text-primary font-mono font-medium tabular-nums">{formatCountdown(when - now)}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Pick a time, or post now.</span>
                )}
              </span>
            </div>
          </Step>

          <div className="bg-background/80 flex items-center gap-2 rounded-2xl border p-2.5 shadow-float backdrop-blur-xl">
            <span className="min-w-0 flex-1 px-1 text-xs">
              <AnimatePresence mode="wait" initial={false}>
                {problem ? (
                  <motion.span key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-standby-ink flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5" /> {problem}
                  </motion.span>
                ) : bare ? null : (
                  <motion.span key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-muted-foreground flex items-center gap-2">
                    <span className="tally text-live" data-live="true" /> Ready for {selected.length} account{selected.length === 1 ? "" : "s"}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <button type="button" onClick={() => submit("draft")} className="hover:bg-accent flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium">
              <Save className="size-4" /> Draft
            </button>
            <button type="button" onClick={() => submit("now")} className="bg-card hover:bg-accent flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium shadow-[0_0_0_1px_var(--border)]">
              <Send className="size-4" /> Post now
            </button>
            <button
              type="button"
              onClick={() => submit("schedule")}
              className="bg-primary text-primary-foreground flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium shadow-[inset_0_1px_0_0_rgb(255_255_255/0.2),0_1px_2px_0_rgb(10_20_60/0.25)] hover:brightness-95"
            >
              <CalendarClock className="size-4" /> {editing && editing.status !== "DRAFT" ? "Reschedule" : "Schedule"}
            </button>
          </div>
        </div>

        <aside className="min-w-0">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="label-caps">Live preview</span>
            {platforms.length > 1 && (
              <div className="bg-muted flex gap-0.5 rounded-lg p-0.5">
                {platforms.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTab(p)}
                    aria-label={`${PLATFORM_META[p].label} preview`}
                    className={cn("relative grid h-7 w-9 place-items-center rounded-md", p === shown ? "text-foreground" : "text-muted-foreground")}
                  >
                    {p === shown && <motion.span layoutId={`demo-prev-${bare ? "b" : "f"}`} className="bg-card absolute inset-0 rounded-md shadow-[0_0_0_1px_var(--border)]" />}
                    <PlatformIcon platform={p} brand={p === shown} className="relative size-3.5" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="bg-canvas/60 rounded-2xl border p-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={shown} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
                {shown === "INSTAGRAM" ? (
                  <InstagramPreview {...previewProps} />
                ) : shown === "YOUTUBE" ? (
                  <YouTubePreview {...previewProps} />
                ) : (
                  <LinkedInPreview {...previewProps} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </aside>
      </div>
    </div>
  );
}

