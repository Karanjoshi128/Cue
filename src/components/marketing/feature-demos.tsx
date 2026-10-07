"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import type { Platform } from "@prisma/client";
import {
  Check,
  Copy,
  MessageSquare,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  InstagramPreview,
  LinkedInPreview,
} from "@/components/post-preview";
import {
  ClientMonogram,
  PlatformIcon,
  PLATFORM_META,
} from "@/components/post-bits";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Compose once, preview per network                                   */
/* ------------------------------------------------------------------ */

const DEMO_LIMITS = { LINKEDIN: 3000, INSTAGRAM: 2200 } as const;
type DemoNet = keyof typeof DEMO_LIMITS;

export function ComposeDemo() {
  const [text, setText] = useState(
    "Riverside Library opens Monday. One roof, eighty skylights, and daylight at every reading table. Come and find your seat.",
  );
  const [net, setNet] = useState<DemoNet>("LINKEDIN");
  const limit = DEMO_LIMITS[net];
  const r = 9;
  const c = 2 * Math.PI * r;

  return (
    <div className="grid h-full gap-4 md:grid-cols-[1fr_minmax(0,19rem)]">
      <div className="bg-background flex flex-col rounded-xl border">
        <div className="text-muted-foreground flex items-center gap-2 border-b px-3.5 py-2 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
          <ClientMonogram
            name="Atlas Architecture"
            color="#23395b"
            className="size-5 rounded-md text-[0.5rem]"
          />
          Atlas Architecture · Draft
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 600))}
          aria-label="Try writing a caption"
          className="min-h-36 flex-1 resize-none bg-transparent px-3.5 py-3 text-sm leading-relaxed outline-none"
        />
        <div className="flex items-center justify-between border-t px-3.5 py-2">
          <span className="text-muted-foreground text-xs">
            Type here. The preview updates as you go.
          </span>
          <svg viewBox="0 0 24 24" className="size-5 -rotate-90" aria-hidden>
            <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2.5" className="stroke-border" />
            <circle
              cx="12"
              cy="12"
              r={r}
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - Math.min(text.length / limit, 1))}
              className="stroke-primary transition-[stroke-dashoffset] duration-300"
            />
          </svg>
        </div>
      </div>
      <div className="min-w-0">
        <div className="bg-muted mb-2.5 flex gap-0.5 rounded-lg p-0.5">
          {(Object.keys(DEMO_LIMITS) as DemoNet[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setNet(p)}
              aria-pressed={net === p}
              className={cn(
                "relative flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors",
                net === p ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {net === p && (
                <motion.span
                  layoutId="demo-net"
                  className="bg-card absolute inset-0 rounded-md shadow-[0_0_0_1px_var(--border)]"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <PlatformIcon platform={p} brand={net === p} className="relative size-3.5" />
              <span className="relative">{PLATFORM_META[p].label}</span>
            </button>
          ))}
        </div>
        <div className="select-none">
          {net === "LINKEDIN" ? (
            <LinkedInPreview
              name="Atlas Architecture"
              color="#23395b"
              body={text}
              images={["/marketing/demo-library.jpg"]}
            />
          ) : (
            <InstagramPreview
              name="Atlas Architecture"
              color="#23395b"
              body={text}
              images={["/marketing/demo-library.jpg"]}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A workspace per client                                              */
/* ------------------------------------------------------------------ */

const ROSTER: {
  name: string;
  color: string;
  accounts: { platform: Platform; handle: string }[];
  queued: number;
  next: { text: string; when: string; image?: string; kind: string };
}[] = [
  {
    name: "Fernwood Coffee",
    color: "#8b5e3c",
    accounts: [
      { platform: "INSTAGRAM", handle: "@fernwoodcoffee" },
      { platform: "LINKEDIN", handle: "Fernwood Coffee" },
    ],
    queued: 4,
    next: { text: "The Guji is back.", when: "Tomorrow 8:30", image: "/marketing/demo-latte.jpg", kind: "Image" },
  },
  {
    name: "Pulse Fitness",
    color: "#e5484d",
    accounts: [
      { platform: "YOUTUBE", handle: "Pulse Fitness" },
      { platform: "INSTAGRAM", handle: "@pulse.fit" },
      { platform: "LINKEDIN", handle: "Pulse Fitness" },
    ],
    queued: 6,
    next: { text: "20-minute full-body circuit", when: "Today 10:15", kind: "Video" },
  },
  {
    name: "Verdant Plants",
    color: "#2f9e5b",
    accounts: [{ platform: "INSTAGRAM", handle: "@verdant.plants" }],
    queued: 3,
    next: { text: "Meet the ZZ plant", when: "Fri 12:00", image: "/marketing/demo-plant.jpg", kind: "Carousel" },
  },
  {
    name: "Orbit Labs",
    color: "#7c4dff",
    accounts: [
      { platform: "LINKEDIN", handle: "Orbit Labs" },
      { platform: "YOUTUBE", handle: "Orbit Labs" },
    ],
    queued: 2,
    next: { text: "We open-sourced our pipeline", when: "Mon 14:30", kind: "Document" },
  },
];

export function WorkspaceDemo() {
  const [active, setActive] = useState(0);
  const client = ROSTER[active];

  return (
    <div>
      <LayoutGroup>
        <div className="flex flex-wrap gap-1.5">
          {ROSTER.map((c, i) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={active === i}
              className={cn(
                "relative flex h-8 items-center gap-2 rounded-full px-3 text-xs font-medium transition-colors",
                active === i ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active === i && (
                <motion.span
                  layoutId="roster-pill"
                  className="bg-background absolute inset-0 rounded-full shadow-[0_0_0_1px_var(--border),0_2px_6px_-2px_rgb(20_20_40/0.12)]"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <span
                className="relative size-2 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              <span className="relative">{c.name.split(" ")[0]}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>
      <div
        className="bg-background relative mt-4 overflow-hidden rounded-xl border p-3.5 transition-shadow duration-500"
        style={{
          boxShadow: `0 0 0 1px color-mix(in oklch, ${client.color} 30%, transparent), 0 16px 40px -20px ${client.color}`,
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={client.name}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-3">
              <ClientMonogram name={client.name} color={client.color} className="size-9 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{client.name}</div>
                <div className="text-muted-foreground font-mono text-[0.625rem] tracking-wider uppercase">
                  {client.queued} queued · {client.accounts.length} accounts
                </div>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5">
              {client.accounts.map((a) => (
                <li
                  key={a.platform + a.handle}
                  className="bg-card flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs shadow-[0_0_0_1px_var(--border)]"
                >
                  <PlatformIcon platform={a.platform} brand className="size-3.5" />
                  <span className="flex-1 truncate">{a.handle}</span>
                  <span className="text-live-ink flex items-center gap-1 text-[0.625rem] font-medium">
                    <span className="tally bg-live size-1.5" /> Connected
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2.5 border-t pt-3">
              {client.next.image ? (
                <Image
                  src={client.next.image}
                  alt=""
                  width={40}
                  height={40}
                  className="size-10 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-lg font-mono text-[0.5625rem] font-semibold tracking-wider uppercase"
                  style={{
                    backgroundColor: `color-mix(in oklch, ${client.color} 14%, transparent)`,
                    color: client.color,
                  }}
                >
                  {client.next.kind.slice(0, 3)}
                </span>
              )}
              <div className="min-w-0 flex-1 leading-tight">
                <div className="label-caps text-[0.5625rem]">Up next · {client.next.kind}</div>
                <div className="truncate text-xs font-medium">{client.next.text}</div>
              </div>
              <span className="text-muted-foreground shrink-0 font-mono text-[0.625rem]">
                {client.next.when}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Approvals                                                           */
/* ------------------------------------------------------------------ */

export function ApprovalDemo() {
  const [state, setState] = useState<"review" | "approved" | "changes">("review");

  return (
    <div className="bg-background relative overflow-hidden rounded-xl border">
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5">
        <ClientMonogram name="Halcyon Health" color="#0e8ac7" className="size-7 rounded-md text-[0.5625rem]" />
        <span className="text-sm font-semibold">Halcyon Health</span>
        <span
          className={cn(
            "ml-auto rounded-md px-1.5 py-0.5 text-[0.625rem] font-medium transition-colors",
            state === "review" && "bg-standby/12 text-standby-ink",
            state === "approved" && "bg-live/12 text-live-ink",
            state === "changes" && "bg-fault/10 text-fault-ink",
          )}
        >
          {state === "review" ? "In review" : state === "approved" ? "Approved" : "Changes requested"}
        </span>
      </div>
      <p className="px-3.5 pt-2.5 pb-3 text-[0.8125rem] leading-relaxed">
        Free health screenings at all three clinics this October. Book in under
        a minute.
      </p>
      <div className="text-muted-foreground mx-3.5 mb-3 flex items-start gap-2 rounded-lg bg-muted/60 px-2.5 py-2 text-xs">
        <MessageSquare className="mt-px size-3.5 shrink-0" />
        <span>
          <span className="text-foreground font-medium">Maya:</span> Mention
          the Thursday late hours too?
        </span>
      </div>
      <div className="bg-muted/40 flex items-center gap-1.5 border-t px-2.5 py-2">
        {state === "review" ? (
          <>
            <button
              type="button"
              onClick={() => setState("approved")}
              className="text-live-ink hover:bg-live/10 flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors"
            >
              <Check className="size-3.5" /> Approve
            </button>
            <button
              type="button"
              onClick={() => setState("changes")}
              className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors"
            >
              <X className="size-3.5" /> Request changes
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setState("review")}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors"
          >
            <RotateCcw className="size-3.5" /> Send back for review
          </button>
        )}
      </div>
      <AnimatePresence>
        {state === "approved" && (
          <motion.div
            key="stamp"
            initial={{ opacity: 0, scale: 1.6, rotate: -18 }}
            animate={{ opacity: 1, scale: 1, rotate: -12 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 18 }}
            className="border-live text-live-ink pointer-events-none absolute top-12 right-5 rounded-md border-2 px-2 py-0.5 font-mono text-xs font-bold tracking-[0.2em] uppercase"
          >
            Approved
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* What goes out next                                                  */
/* ------------------------------------------------------------------ */

function nextQuarterHour(now: number) {
  const q = 15 * 60_000;
  return Math.ceil((now + 1000) / q) * q;
}

export function CountdownDemo() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const target = now ? nextQuarterHour(now) : null;
  const ms = target && now ? target - now : 0;
  const mm = String(Math.floor(ms / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
  const at = target
    ? new Date(target).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "--:--";

  return (
    <div className="bg-background rounded-xl border p-4">
      <div className="label-caps flex items-center gap-2">
        <span className="tally text-standby" data-live="true" />
        Next cue · {at}
      </div>
      <div className="mt-3 font-mono text-5xl font-medium tracking-[-0.04em] tabular-nums">
        00:{now ? mm : "--"}:{now ? ss : "--"}
      </div>
      <div className="mt-4 flex items-center gap-2.5">
        <ClientMonogram name="Pulse Fitness" color="#e5484d" className="size-7 rounded-md text-[0.5625rem]" />
        <span className="min-w-0 flex-1 truncate text-xs">
          <span className="font-semibold">Pulse Fitness</span>
          <span className="text-muted-foreground"> · 20-minute full-body circuit</span>
        </span>
        <span className="text-muted-foreground flex gap-1">
          <PlatformIcon platform="YOUTUBE" className="size-3.5" />
          <PlatformIcon platform="INSTAGRAM" className="size-3.5" />
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

const SNIPPET = `curl -X POST https://trycue.space/api/v1/posts \\
  -H "Authorization: Bearer $CUE_KEY" \\
  -H "Idempotency-Key: shorts-0142" \\
  -d '{
    "clientId": "cmh8…",
    "accountIds": ["cmh9…"],
    "body": "New drop, 6pm.",
    "action": "schedule",
    "scheduledAt": "2026-10-09T18:00:00+05:30"
  }'`;

function highlight(line: string) {
  // Tiny, safe tokenizer: strings, flags and the URL get their own colour.
  const parts = line.split(/("[^"]*"|'|https:\/\/\S+|-[XHd]\b)/g);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith('"')) return <span key={i} className="text-[#7ee2a8]">{p}</span>;
    if (p.startsWith("https://")) return <span key={i} className="text-[#7aa8ff]">{p}</span>;
    if (/^-[XHd]$/.test(p)) return <span key={i} className="text-[#ffc266]">{p}</span>;
    return <span key={i}>{p}</span>;
  });
}

export function ApiDemo() {
  async function copy() {
    try {
      await navigator.clipboard.writeText(SNIPPET);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy, select the text instead");
    }
  }
  return (
    <div className="dark overflow-hidden rounded-xl bg-[#0b0d12] shadow-[0_0_0_1px_rgb(255_255_255/0.06)]">
      <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2">
        <span className="font-mono text-[0.625rem] tracking-[0.12em] text-white/50 uppercase">
          POST /api/v1/posts
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[0.6875rem] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Copy className="size-3" /> Copy
        </button>
      </div>
      <pre className="scrollbar-none overflow-x-auto px-3.5 py-3 font-mono text-[0.6875rem] leading-[1.7] text-white/80">
        {SNIPPET.split("\n").map((line, i) => (
          <div key={i}>{highlight(line)}</div>
        ))}
      </pre>
    </div>
  );
}
