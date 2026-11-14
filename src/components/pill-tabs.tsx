"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export interface PillTab<K extends string> {
  key: K;
  label: string;
  count?: number;
  /** Shown in the standby colour: something here needs the person. */
  alert?: boolean;
  /** A link instead of a button, when the tab is a page of its own. */
  href?: string;
}

/**
 * The segmented tab bar used across the engage pages: Reply Desk filters,
 * the Automations sections and the activity filter.
 */
export function PillTabs<K extends string>({
  tabs,
  active,
  onSelect,
  label,
  size = "md",
  className,
}: {
  tabs: PillTab<K>[];
  active: K;
  onSelect?: (key: K) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "bg-muted flex max-w-full gap-0.5 overflow-x-auto rounded-xl p-1 [scrollbar-width:none]",
        size === "sm" && "w-fit",
        className,
      )}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        const cls = cn(
          "flex shrink-0 items-center gap-2 rounded-lg px-3 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          size === "sm" ? "h-7 text-xs" : "h-8 text-[0.8125rem]",
          on
            ? "bg-card text-foreground shadow-[0_0_0_1px_var(--border),0_1px_2px_0_rgb(20_20_40/0.06)]"
            : "text-muted-foreground hover:text-foreground",
        );
        const inner = (
          <>
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  "font-mono text-[0.6875rem] tabular-nums",
                  t.alert && t.count > 0 ? "text-standby-ink font-semibold" : "text-muted-foreground",
                )}
              >
                {t.count}
              </span>
            )}
          </>
        );
        return t.href ? (
          <Link key={t.key} href={t.href} aria-current={on ? "page" : undefined} className={cls}>
            {inner}
          </Link>
        ) : (
          <button
            key={t.key}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect?.(t.key)}
            className={cls}
          >
            {inner}
          </button>
        );
      })}
    </nav>
  );
}
