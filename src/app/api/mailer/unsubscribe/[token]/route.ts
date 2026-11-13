import { NextResponse } from "next/server";
import { suppress, verifyUnsubscribeToken } from "@/lib/mailer/suppression";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/*
 * One-click unsubscribe (RFC 8058): Gmail's and Yahoo's own "Unsubscribe"
 * button POSTs here, using the List-Unsubscribe headers on every email.
 * There's deliberately no GET: link scanners open links, and opening one
 * must never unsubscribe anyone. People clicking the footer link land on
 * /unsubscribe/<token>, which asks first.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const email = verifyUnsubscribeToken((await params).token);
  if (!email) return NextResponse.json({ error: "Invalid link." }, { status: 404 });
  await suppress(email, "unsubscribed", { note: "One-click unsubscribe from the mail app" });
  return NextResponse.json({ ok: true });
}
