"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, X } from "lucide-react";
import type { HelpSearchEntry } from "@/lib/help";

/**
 * Filters every guide as you type; while the box is empty, the topic grid
 * (children) shows instead. Every word must appear somewhere in a guide;
 * title matches rank first.
 */
export function HelpSearch({
  index,
  base,
  children,
}: {
  index: HelpSearchEntry[];
  base: string;
  children: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);

  const results = useMemo(() => {
    if (!words.length) return [];
    return index
      .filter((e) => words.every((w) => e.text.includes(w)))
      .map((e) => ({
        e,
        score: words.filter((w) => e.title.toLowerCase().includes(w)).length,
      }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, index]);

  return (
    <div className="space-y-10">
      <div className="relative max-w-2xl">
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the guides, e.g. “connect instagram”"
          aria-label="Search the guides"
          className="bg-card focus-visible:ring-ring/30 focus-visible:border-ring h-12 w-full rounded-xl border pr-11 pl-11 text-[0.9375rem] shadow-[0_1px_2px_0_rgb(20_20_40/0.04)] outline-none focus-visible:ring-3 [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {words.length === 0 ? (
        children
      ) : (
        <section aria-live="polite" aria-label="Search results">
          <p className="label-caps mb-3">
            {results.length} {results.length === 1 ? "guide" : "guides"}
          </p>
          {results.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing matches that. Try fewer or different words, or email{" "}
              <a href="mailto:karan@trycue.space" className="text-foreground underline underline-offset-4">
                karan@trycue.space
              </a>
              .
            </p>
          ) : (
            <ul className="divide-y rounded-2xl border bg-card">
              {results.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`${base}/${r.slug}`}
                    prefetch={base === "/help" ? undefined : false}
                    className="hover:bg-accent/50 group flex items-center gap-4 px-5 py-4 transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-muted-foreground block font-mono text-[0.6875rem] tracking-wider uppercase">
                        {r.group}
                      </span>
                      <span className="mt-0.5 block font-medium">{r.title}</span>
                      <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-sm">
                        {r.summary}
                      </span>
                    </span>
                    <ArrowRight className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-colors" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
