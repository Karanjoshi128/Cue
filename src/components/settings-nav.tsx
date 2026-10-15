"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// A section is "current" once its top passes this far down the window (just
// under the sticky top bar plus the sections' scroll margin).
const LINE_PX = 140;

/**
 * The Settings section list, marking the section being read. The page scrolls
 * inside #app-panel on wide screens and the window on narrow ones, so both
 * are watched. The last sections can't scroll up to the line, so at the very
 * bottom the last one wins; and a clicked link stays marked through the jump
 * it causes.
 */
export function SettingsNav({ sections }: { sections: { id: string; label: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  const clickedAt = useRef(0);
  const ids = sections.map((s) => s.id).join(",");

  useEffect(() => {
    const order = ids.split(",");
    const panel = document.getElementById("app-panel");

    function update() {
      if (Date.now() - clickedAt.current < 800) return;
      const scroller =
        panel && panel.scrollHeight > panel.clientHeight ? panel : document.documentElement;
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
      if (atBottom) {
        setActive(order[order.length - 1]);
        return;
      }
      let current = order[0];
      for (const id of order) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= LINE_PX) current = id;
      }
      setActive(current);
    }

    update();
    panel?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      panel?.removeEventListener("scroll", update);
      window.removeEventListener("scroll", update);
    };
  }, [ids]);

  return (
    <ul className="border-border space-y-0.5 border-l">
      {sections.map((s) => {
        const on = s.id === active;
        return (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={() => {
                clickedAt.current = Date.now();
                setActive(s.id);
              }}
              aria-current={on ? "location" : undefined}
              className={cn(
                "-ml-px block border-l py-1.5 pl-4 text-sm transition-colors",
                on
                  ? "border-primary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:border-foreground border-transparent",
              )}
            >
              {s.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
