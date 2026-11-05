"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_SITE_THEME, siteTheme } from "@/lib/site-themes";
import { ThemeMiniature } from "@/components/theme-miniature";

const subscribe = () => () => {};

// The person's own light/dark choice. The site theme (Diwali and so on) is set
// for everyone in the admin panel; these previews show the everyday palette.
const { light, dark } = siteTheme(DEFAULT_SITE_THEME);

function Miniature({ dark: isDark }: { dark: boolean }) {
  return <ThemeMiniature colors={isDark ? dark : light} />;
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
