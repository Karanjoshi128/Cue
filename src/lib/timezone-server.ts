import { cookies } from "next/headers";
import { FALLBACK_TIME_ZONE, TZ_COOKIE, isValidTimeZone } from "@/lib/timezone";

/** The viewer's IANA time zone, as reported by their browser. */
export async function getTimeZone(): Promise<string> {
  const value = (await cookies()).get(TZ_COOKIE)?.value;
  const zone = value ? decodeURIComponent(value) : undefined;
  return isValidTimeZone(zone) ? zone : FALLBACK_TIME_ZONE;
}
