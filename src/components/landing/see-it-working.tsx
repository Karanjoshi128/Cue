"use client";

import { useState } from "react";
import { LiveDashboard } from "@/components/marketing/demo/loader";
import type { DemoView } from "@/components/marketing/demo/model";
import { cn } from "@/lib/utils";

// The tabs open the demo's own screens; each one starts the demo afresh on
// that screen. The path is what the real app shows in the address bar.
const TABS: { view: DemoView; label: string; path: string }[] = [
  { view: "dashboard", label: "Dashboard", path: "dashboard" },
  { view: "calendar", label: "Calendar", path: "calendar" },
  { view: "compose", label: "Compose", path: "composer" },
  { view: "queue", label: "Queue", path: "queue" },
  { view: "clients", label: "Clients", path: "clients" },
];

/** The "See it working" tabs and the live demo in a browser window. */
export function SeeItWorking() {
  const [view, setView] = useState<DemoView>("dashboard");
  const path = TABS.find((t) => t.view === view)?.path ?? "dashboard";
  return (
    <>
      <div role="tablist" aria-label="Demo screens" className="mt-9 hidden flex-wrap justify-center gap-2 lg:flex">
        {TABS.map((t) => (
          <button
            key={t.view}
            type="button"
            role="tab"
            aria-selected={view === t.view}
            onClick={() => setView(t.view)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
              view === t.view
                ? "border-transparent bg-[#1f1b2d] text-white dark:bg-[#2b2550]"
                : "bg-card text-foreground hover:bg-accent",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card mt-9 overflow-hidden rounded-2xl border shadow-[0_30px_60px_-30px_rgb(31_27_45/0.25)] lg:mt-10">
        <div className="flex h-12 items-center border-b px-4 lg:h-[59px] lg:px-5">
          <div className="flex gap-2">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="bg-muted text-muted-foreground mx-auto hidden w-full max-w-110 truncate rounded-lg px-3 py-1.5 text-center font-mono text-xs sm:block">
            trycue.space/{path}
          </div>
          <div className="w-13 shrink-0" />
        </div>
        <div role="tabpanel" aria-label={`Cue ${path} demo`}>
          <LiveDashboard key={view} initialView={view} />
        </div>
      </div>
    </>
  );
}
