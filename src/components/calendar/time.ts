import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { zoned } from "@/lib/timezone";

// Every calendar boundary and label is in the viewer's zone (the cue_tz
// cookie), never the browser's or the server's (UTC on Vercel).

export type TzCtx = { in: ReturnType<typeof zoned> };

export function tzCtx(timeZone: string): TzCtx {
  return { in: zoned(timeZone) };
}

/** yyyy-MM-dd for a date in the viewer's zone. */
export function dayKey(date: Date | string, ctx: TzCtx): string {
  return format(typeof date === "string" ? new Date(date) : date, "yyyy-MM-dd", ctx);
}

/** Minutes past midnight, in the viewer's zone. */
export function minutesOf(date: Date | string, timeZone: string): number {
  const d = new TZDate(new Date(date).getTime(), timeZone);
  return d.getHours() * 60 + d.getMinutes();
}

/** The instant for a day (yyyy-MM-dd) plus minutes past midnight, in the zone. */
export function slotDate(key: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(
    new TZDate(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, timeZone).getTime(),
  );
}

export function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "10:30a" style label for a minutes value. */
export function shortTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
}

/** "IST" style abbreviation for the zone, or the zone id. */
export function zoneLabel(timeZone: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return part ?? timeZone;
  } catch {
    return timeZone;
  }
}

/** Composer link for a slot. The client is passed only when one is filtered. */
export function composerHref(key: string, minutes: number | null, clientId?: string): string {
  const q = new URLSearchParams({ date: key });
  if (minutes !== null) q.set("time", hhmm(minutes));
  if (clientId) q.set("client", clientId);
  return `/composer?${q.toString()}`;
}
