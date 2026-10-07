"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TZ_COOKIE } from "@/lib/timezone";

/**
 * Reports the browser's time zone to the server via a cookie. If it was
 * missing or has changed (first visit, travel), re-render once so every
 * server-formatted time and calendar day uses the viewer's clock.
 */
export function TimezoneSync() {
  const router = useRouter();

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${TZ_COOKIE}=`))
      ?.split("=")[1];
    if (current && decodeURIComponent(current) === zone) return;
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);

  return null;
}
