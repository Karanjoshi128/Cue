"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

/** A miniature of the app shell, drawn in the given palette. */
function Miniature({ dark }: { dark: boolean }) {
  const c = dark
    ? { canvas: "#060709", panel: "#0c0e12", line: "#22262e", ink: "#edeef0", soft: "#1a1e25" }
    : { canvas: "#edece6", panel: "#f9f8f5", line: "#e4e2db", ink: "#121420", soft: "#efeee9" };
  return (
    <div className="flex h-full gap-1.5 p-2" style={{ background: c.canvas }}>
      <div className="flex w-1/4 flex-col gap-1 pt-1">
        <span className="h-1.5 w-3/4 rounded-full" style={{ background: "#196bf5" }} />
        <span className="mt-1 h-1 w-full rounded-full" style={{ background: c.soft }} />
        <span className="h-1 w-2/3 rounded-full" style={{ background: c.soft }} />
        <span className="h-1 w-3/4 rounded-full" style={{ background: c.soft }} />
      </div>
      <div
        className="flex-1 rounded-md p-1.5"
        style={{ background: c.panel, boxShadow: `0 0 0 1px ${c.line}` }}
      >
        <span className="block h-1.5 w-1/2 rounded-full" style={{ background: c.ink }} />
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-5 rounded"
              style={{ background: i === 0 ? "#196bf5" : c.soft }}
            />
          ))}
        </div>
        <span className="mt-1.5 block h-1 w-3/4 rounded-full" style={{ background: c.soft }} />
      </div>
    </div>
  );
}

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const current = mounted ? (theme ?? "system") : undefined;

  const options = [
    { key: "light", label: "Paper", hint: "Warm light" },
    { key: "dark", label: "Control room", hint: "Low-light dark" },
    { key: "system", label: "System", hint: "Follow your OS" },
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
      {options.map((o) => {
        const on = current === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setTheme(o.key)}
            className={cn(
              "group overflow-hidden rounded-xl border text-left transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
              on
                ? "border-primary/60 shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_14%,transparent)]"
                : "hover:border-[color-mix(in_oklch,var(--border),var(--foreground)_18%)]",
            )}
          >
            <div className="h-20 overflow-hidden border-b">
              {o.key === "system" ? (
                <div className="grid h-full grid-cols-2">
                  <Miniature dark={false} />
                  <Miniature dark />
                </div>
              ) : (
                <Miniature dark={o.key === "dark"} />
              )}
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{o.label}</div>
                <div className="text-muted-foreground text-xs">{o.hint}</div>
              </div>
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full transition-all",
                  on
                    ? "bg-primary text-primary-foreground"
                    : "shadow-[inset_0_0_0_1.5px_var(--border)]",
                )}
              >
                {on && <Check className="size-3" strokeWidth={3} />}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
