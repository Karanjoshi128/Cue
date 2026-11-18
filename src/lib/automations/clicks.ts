import { createHmac, timingSafeEqual } from "node:crypto";

function signature(runId: string, destination: string) {
  const key = process.env.TOKEN_ENC_KEY;
  if (!key) throw new Error("Link tracking is not configured.");
  return createHmac("sha256", key).update(`cue-automation-click:v1:${runId}:${destination}`).digest("base64url");
}
/** Destination is signed too; links continue to work after the 30-day activity log expires. */
export function trackedLink(runId: string, destination: string): string {
  const origin = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) return destination;
  const url = new URL(`/api/automations/click/${encodeURIComponent(runId)}`, origin);
  url.searchParams.set("to", Buffer.from(destination).toString("base64url"));
  url.searchParams.set("sig", signature(runId, destination));
  return url.toString();
}
export function verifyTrackedLink(runId: string, encoded: string | null, sig: string | null): string | null {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(runId) || !encoded || encoded.length > 3000 || !sig || sig.length > 100) return null;
  try {
    const destination = Buffer.from(encoded, "base64url").toString("utf8");
    const url = new URL(destination);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const a = Buffer.from(signature(runId, destination));
    const b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b) ? destination : null;
  } catch { return null; }
}
