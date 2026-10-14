import crypto from "crypto";
import type { IncomingComment } from "./engine";

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

interface WebhookPayload {
  object?: string;
  entry?: {
    id?: string | number;
    time?: number;
    changes?: { field?: string; value?: CommentValue }[];
  }[];
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
    // Meta's examples use both seconds and milliseconds here.
    const sentAt = entry.time
      ? new Date(entry.time > 1e12 ? entry.time : entry.time * 1000)
      : new Date();
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
