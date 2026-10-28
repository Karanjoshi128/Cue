import crypto from "crypto";
import type { IncomingComment } from "./engine";
import type { IncomingMessage } from "./conversation";

// Meta's webhook for Instagram (Instagram Login). Setup lives in
// docs/instagram-automations.md.

/**
 * Meta signs each notification with the app secret: X-Hub-Signature-256 is
 * "sha256=" + HMAC-SHA256(raw body). Instagram Login apps have an Instagram
 * app secret as well as the Meta app's, so either is accepted:
 * META_WEBHOOK_SECRET when set, and META_APP_SECRET.
 */
export function verifySignature(rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  const secrets = [process.env.META_WEBHOOK_SECRET, process.env.META_APP_SECRET].filter(
    (s): s is string => !!s,
  );
  return secrets.some((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest();
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

interface CommentValue {
  id?: string;
  text?: string;
  parent_id?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string; media_product_type?: string };
}

interface MessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    reply_to?: { story?: { id?: string; url?: string } };
  };
  postback?: { mid?: string; title?: string; payload?: string };
}

interface WebhookPayload {
  object?: string;
  entry?: {
    id?: string | number;
    time?: number;
    changes?: { field?: string; value?: CommentValue }[];
    messaging?: MessagingEvent[];
  }[];
}

/** Meta's examples use both seconds and milliseconds for times. */
function toDate(t: number | undefined): Date {
  return t ? new Date(t > 1e12 ? t : t * 1000) : new Date();
}

/**
 * The messages and button taps in a notification (fields `messages` and
 * `messaging_postbacks`), in order. Reactions, reads and other events are
 * ignored.
 */
export function messagesFromWebhook(payload: unknown): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  const body = payload as WebhookPayload | null;
  if (body?.object !== "instagram" || !Array.isArray(body.entry)) return out;
  for (const entry of body.entry) {
    if (entry.id === undefined || !Array.isArray(entry.messaging)) continue;
    for (const m of entry.messaging) {
      const senderId = m.sender?.id;
      if (!senderId) continue;
      const base = { igUserId: String(entry.id), senderId, at: toDate(m.timestamp) };
      if (m.postback?.payload) {
        out.push({
          ...base,
          mid: m.postback.mid ?? `postback:${senderId}:${m.timestamp}`,
          text: m.postback.title ?? null,
          payload: m.postback.payload,
          storyId: null,
          isEcho: false,
        });
      } else if (m.message?.mid) {
        out.push({
          ...base,
          mid: m.message.mid,
          text: m.message.text ?? null,
          payload: null,
          storyId: m.message.reply_to?.story?.id ?? null,
          isEcho: m.message.is_echo === true,
        });
      }
    }
  }
  return out;
}

/**
 * The `comments` changes in a notification, grouped by the Instagram account
 * they're for. Anything else (live_comments, mentions without a media id) is
 * ignored. The payload has no comment time, so the notification's is used.
 */
export function commentsFromWebhook(payload: unknown): Map<string, IncomingComment[]> {
  const out = new Map<string, IncomingComment[]>();
  const body = payload as WebhookPayload | null;
  if (body?.object !== "instagram" || !Array.isArray(body.entry)) return out;

  for (const entry of body.entry) {
    if (entry.id === undefined || !Array.isArray(entry.changes)) continue;
    const igUserId = String(entry.id);
    const sentAt = toDate(entry.time);
    for (const change of entry.changes) {
      const v = change.value;
      if (change.field !== "comments" || !v?.id || !v.media?.id) continue;
      const list = out.get(igUserId) ?? [];
      list.push({
        id: v.id,
        text: v.text ?? "",
        mediaId: v.media.id,
        fromId: v.from?.id ?? null,
        fromUsername: v.from?.username ?? null,
        parentId: v.parent_id ?? null,
        timestamp: sentAt,
      });
      out.set(igUserId, list);
    }
  }
  return out;
}
