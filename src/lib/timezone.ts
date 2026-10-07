import { tz } from "@date-fns/tz";

// Client-safe. The browser reports its IANA zone into this cookie (see
// <TimezoneSync />) so server-rendered times match the viewer's clock. Vercel
// functions run in UTC, so without it every server-formatted time is off.
export const TZ_COOKIE = "cue_tz";
export const FALLBACK_TIME_ZONE = "UTC";

export function isValidTimeZone(zone: string | undefined | null): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** date-fns context for a zone: pass as `{ in: zoned(zone) }`. */
export function zoned(zone: string) {
  return tz(isValidTimeZone(zone) ? zone : FALLBACK_TIME_ZONE);
}
