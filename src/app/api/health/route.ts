import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Liveness check for the Oracle VM deploy (see docs/oracle-vm-runbook.md):
 * a new release only gets traffic once this returns 200, which needs the app
 * to be up and the database reachable. Public on purpose, and says nothing
 * beyond up or down.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`select 1`;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
