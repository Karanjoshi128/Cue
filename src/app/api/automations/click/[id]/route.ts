import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTrackedLink } from "@/lib/automations/clicks";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const destination = verifyTrackedLink(id, req.nextUrl.searchParams.get("to"), req.nextUrl.searchParams.get("sig"));
  if (!destination) return new NextResponse("This link is invalid.", { status: 400 });
  const automated = /bot|crawl|spider|preview|facebookexternalhit|meta-externalagent|slack|whatsapp/i.test(req.headers.get("user-agent") ?? "") || req.headers.get("purpose") === "prefetch";
  if (!automated) {
    // No IPs, cookies, browser fingerprints or recipient data are recorded.
    await prisma.automationRun.updateMany({ where: { id, dmMessageId: { not: null }, clickedAt: null }, data: { clickedAt: new Date() } }).catch(() => {});
    await prisma.automationRun.updateMany({ where: { id, dmMessageId: { not: null } }, data: { clickCount: { increment: 1 } } }).catch(() => {});
  }
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
