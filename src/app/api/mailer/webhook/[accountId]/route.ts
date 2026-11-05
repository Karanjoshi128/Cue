import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { applyResendEvent, verifySvix } from "@/lib/mailer/webhook";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ accountId: string }> };

/*
 * Resend delivery events for one sending account. Set this URL as a webhook
 * in that Resend account and paste its signing secret into the account in
 * /admin/mailer/accounts. Unsigned or wrongly signed requests are refused.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { accountId } = await params;
  const account = await prisma.mailerAccount.findUnique({
    where: { id: accountId.slice(0, 100) },
    select: { webhookSecret: true },
  });
  if (!account?.webhookSecret) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const payload = await req.text();
  if (payload.length > 256_000) return NextResponse.json({ error: "Too large." }, { status: 413 });
  let secret: string;
  try {
    secret = decrypt(account.webhookSecret);
  } catch {
    return NextResponse.json({ error: "Webhook secret unreadable." }, { status: 500 });
  }
  const ok = verifySvix(
    secret,
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    payload,
  );
  if (!ok) return NextResponse.json({ error: "Bad signature." }, { status: 401 });

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }
  const result = await applyResendEvent(event as Parameters<typeof applyResendEvent>[0]);
  return NextResponse.json({ ok: true, result });
}
