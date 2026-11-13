import { after, NextRequest, NextResponse } from "next/server";
import { handleWebhookComments } from "@/lib/automations/engine";
import { handleIncomingMessages } from "@/lib/automations/conversation";
import {
  commentsFromWebhook,
  messagesFromWebhook,
  verifySignature,
} from "@/lib/automations/webhook";

export const dynamic = "force-dynamic";
// The DM and public reply go out after the 200, inside this budget.
export const maxDuration = 60;

/**
 * Meta's one-time check when the callback URL is saved in the App Dashboard:
 * echo hub.challenge back if the verify token matches.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const expected = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  if (
    expected &&
    p.get("hub.mode") === "subscribe" &&
    p.get("hub.verify_token") === expected
  ) {
    return new NextResponse(p.get("hub.challenge") ?? "", {
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * Comment, message and button-tap notifications. Answer 200 straight away
 * (Meta retries anything slower or non-200 for 36 hours) and do the work in
 * after(). Duplicates are harmless: each comment or message becomes at most
 * one run, and a repeated tap just repeats the same step.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const comments = commentsFromWebhook(payload);
  const messages = messagesFromWebhook(payload);
  if (comments.size > 0 || messages.length > 0) {
    after(async () => {
      await handleWebhookComments(comments).catch((err) =>
        console.error("[automations] comment webhook handling failed:", err),
      );
      await handleIncomingMessages(messages).catch((err) =>
        console.error("[automations] message webhook handling failed:", err),
      );
    });
  }
  return NextResponse.json({ ok: true });
}
