import { createHash, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Verifies the Bearer token sent by the cron jobs (Supabase pg_cron and the
 * GitHub keepalive). Compared in constant time, on digests so the lengths
 * always match, so response timing can't reveal the secret a byte at a time.
 */
export function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
