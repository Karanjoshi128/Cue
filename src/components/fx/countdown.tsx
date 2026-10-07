"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86_400),
    h: Math.floor((s % 86_400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "02:14:09" under two days out, "3d 04h 12m" beyond, "Now" once due. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "Now";
  const { d, h, m, s } = parts(ms);
  if (d >= 2) return `${d}d ${pad(h)}h ${pad(m)}m`;
  return `${pad(d * 24 + h)}:${pad(m)}:${pad(s)}`;
}

/**
 * A live, ticking countdown to `to`. Renders in mono with tabular figures so
 * the digits don't jitter as they change.
 */
export function Countdown({
  to,
  className,
  prefix,
}: {
  to: string | Date;
  className?: string;
  prefix?: string;
}) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span
      className={cn("font-mono tabular-nums", className)}
      // The server's clock and the browser's differ by a second or two.
      suppressHydrationWarning
    >
      {prefix}
      {formatCountdown(target - now)}
    </span>
  );
}
