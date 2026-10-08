"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import type { Platform } from "@prisma/client";
import { PlatformIcon } from "@/components/post-bits";
import { cn } from "@/lib/utils";

/**
 * Steps a playhead through `count` cues, then resets: -1 (nothing called),
 * 0..count-1 (calling that cue), count (all live). Reduced motion parks it
 * mid-sheet so the static frame still tells the story.
 */
export function useCueClock(count: number, interval = 2200, enabled = true) {
  const reduce = usePrefersReducedMotion();
  const [called, setCalled] = useState(-1);
  // A click "calls" a cue by hand; the loop holds there for a few seconds.
  const [heldAt, setHeldAt] = useState(0);
  useEffect(() => {
    if (reduce) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCalled(2);
      return;
    }
    if (!enabled) return;
    let id = 0;
    const start = () => {
      id = window.setInterval(() => {
        setCalled((c) => (c >= count ? -1 : c + 1));
      }, interval);
    };
    const hold = heldAt ? Math.max(0, heldAt + 6000 - Date.now()) : 0;
    const t = window.setTimeout(start, hold);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(id);
    };
  }, [reduce, enabled, count, interval, heldAt]);
  const jump = (i: number) => {
    setCalled(i + 1);
    setHeldAt(Date.now());
  };
  return [called, jump] as const;
}

// Fictional clients: a demo of the product, not a claim about real customers.
export const CUE_ROWS: {
  client: string;
  color: string;
  platform: Platform;
  text: string;
  time: string;
}[] = [
  { client: "Fernwood Coffee", color: "#a8754d", platform: "INSTAGRAM", text: "The Guji is back. Blueberry, jasmine, long finish.", time: "08:30" },
  { client: "Atlas Architecture", color: "#5b8def", platform: "LINKEDIN", text: "Riverside Library: designing for daylight", time: "09:00" },
  { client: "Pulse Fitness", color: "#f0565b", platform: "YOUTUBE", text: "20-minute full-body circuit, no equipment", time: "10:15" },
  { client: "Verdant Plants", color: "#3fb771", platform: "INSTAGRAM", text: "Meet the ZZ plant, the easiest housemate", time: "12:00" },
  { client: "Orbit Labs", color: "#9775ff", platform: "LINKEDIN", text: "We just open-sourced our telemetry pipeline", time: "14:30" },
  { client: "Halcyon Health", color: "#29a3e0", platform: "LINKEDIN", text: "Free screenings at all three clinics this month", time: "16:45" },
];

/**
 * A looping "cue sheet": a playhead walks down the day's posts and each one
 * flips from STANDBY to GO as it's called. Always drawn on a dark stage.
 */
export function CueSheet({
  className,
  rows = 5,
  interval = 2200,
  called: controlled,
  onCall,
  title = "Cue sheet · Today",
}: {
  className?: string;
  rows?: number;
  interval?: number;
  /** Drive the playhead from outside (e.g. to sync other visuals). */
  called?: number;
  /** Called with a row's index when it's clicked. */
  onCall?: (index: number) => void;
  title?: React.ReactNode;
}) {
  const items = CUE_ROWS.slice(0, rows);
  const [own, jump] = useCueClock(items.length, interval, controlled === undefined);
  // -1 = nothing called yet; items.length = all gone live (then reset).
  const called = controlled ?? own;
  const call = onCall ?? jump;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-1.5 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)] backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center justify-between px-3.5 pt-2.5 pb-3 font-mono text-[0.625rem] tracking-[0.14em] text-white/45 uppercase">
        <span className="flex items-center gap-2">
          <span className="tally text-[#ff5a52]" data-live="true" />
          {title}
        </span>
        <span>{items.length} cues</span>
      </div>
      <ol className="relative space-y-1">
        {items.map((row, i) => {
          const live = i < called || called >= items.length;
          const calling = i === called;
          return (
            <li
              key={row.client}
              role="button"
              tabIndex={0}
              title="Call this cue"
              onClick={() => call(i)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), call(i))}
              className={cn(
                "relative grid cursor-pointer grid-cols-[3.25rem_1fr_auto] items-center gap-3 rounded-xl px-3.5 py-3 transition-colors duration-500 outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[#4c8dff]/60",
                calling ? "bg-white/[0.07]" : "bg-transparent",
              )}
            >
              {calling && (
                <motion.span
                  layoutId="cue-playhead"
                  className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[#4c8dff] shadow-[0_0_12px_2px_rgb(76_141_255/0.6)]"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <span
                className={cn(
                  "font-mono text-xs tabular-nums transition-colors",
                  live || calling ? "text-white" : "text-white/40",
                )}
              >
                {row.time}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-white">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="truncate">{row.client}</span>
                  <PlatformIcon
                    platform={row.platform}
                    className="size-3 shrink-0 text-white/40"
                  />
                </span>
                <span className="mt-0.5 block truncate text-xs text-white/45">
                  {row.text}
                </span>
              </span>
              <span className="relative h-6 w-[4.5rem]">
                <AnimatePresence mode="popLayout" initial={false}>
                  {live ? (
                    <motion.span
                      key="go"
                      initial={{ opacity: 0, y: 8, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-full bg-[#1fc677]/15 font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-[#5ee09e] uppercase"
                    >
                      <span className="size-1.5 rounded-full bg-[#1fc677]" />
                      Go
                    </motion.span>
                  ) : (
                    <motion.span
                      key="standby"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className={cn(
                        "absolute inset-0 flex items-center justify-center gap-1.5 rounded-full font-mono text-[0.625rem] font-semibold tracking-[0.12em] uppercase",
                        calling
                          ? "bg-[#f5a524]/15 text-[#ffc266]"
                          : "text-white/35 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          calling ? "animate-pulse bg-[#f5a524]" : "bg-white/25",
                        )}
                      />
                      Standby
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
