"use client";

import { useEffect, useState } from "react";

/** The viewer's wall clock, ticking each second, e.g. "23:14:05 IST". */
export function LiveClock({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("en-GB", { hour12: false });
  const zone =
    // The viewer's own locale names the zone best ("IST", not "GMT+5:30").
    new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? "";

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }} suppressHydrationWarning>
      {time} {zone}
    </span>
  );
}
