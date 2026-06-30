import { NextRequest } from "next/server";

/** Verifies the Bearer token sent by our GitHub Actions cron jobs. */
export function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}
