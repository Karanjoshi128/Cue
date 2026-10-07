"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // The resolved theme is only known on the client: render the light state
  // during SSR and hydration, then the real one.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "hover:bg-accent text-muted-foreground hover:text-foreground relative grid size-9 place-items-center overflow-hidden rounded-lg transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
        className,
      )}
    >
      {/* Sun and moon swap with a small orbit, not a hard cut. */}
      <Sun
        className={cn(
          "absolute size-[1.05rem] transition-all duration-500 ease-[cubic-bezier(.2,.8,.2,1)]",
          isDark ? "translate-y-0 rotate-0 opacity-100" : "translate-y-5 rotate-90 opacity-0",
        )}
      />
      <Moon
        className={cn(
          "absolute size-[1.05rem] transition-all duration-500 ease-[cubic-bezier(.2,.8,.2,1)]",
          isDark ? "-translate-y-5 -rotate-90 opacity-0" : "translate-y-0 rotate-0 opacity-100",
        )}
      />
    </button>
  );
}
