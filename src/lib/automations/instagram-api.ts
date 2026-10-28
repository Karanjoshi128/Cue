import { GRAPH } from "@/lib/platforms/instagram";

// The Instagram API (Instagram Login, graph.instagram.com) calls behind
// comment automations. Comment calls need instagram_business_manage_comments;
// messages (the private reply and everything after it) also use
// instagram_business_manage_messages.
// Docs: developers.facebook.com/docs/instagram-platform/private-replies and
// .../comment-moderation.

/** Codes Meta documents as throttling or temporary. */
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
  }
}

interface MetaError {
  message?: string;
  error_user_msg?: string;
  code?: number;
  error_subcode?: number;
  is_transient?: boolean;
}

function toError(status: number, body: unknown): InstagramApiError {
  const e: MetaError = (body as { error?: MetaError } | null)?.error ?? {};
  const code = e.code;
  const sub = e.error_subcode;
  const raw = e.error_user_msg || e.message || `HTTP ${status}`;
  const retryable =
    status === 429 ||
    status >= 500 ||
    e.is_transient === true ||
    (code !== undefined && RETRYABLE_CODES.has(code));

  let message = raw;
  if (code === 190) {
    message =
      "The Instagram connection expired or was revoked. Reconnect the account in Clients.";
  } else if (code === 10 && (sub === 2534022 || sub === 2018278)) {
    message =
      "Outside Instagram's reply window: 7 days after a comment, or 24 hours after their last message or tap.";
  } else if (code === 10 || code === 200 || (code && code > 200 && code < 300)) {
    message = `Instagram refused: ${raw}. Reconnect the account and allow comment and message access.`;
  } else if (code === 100 && sub === 2534001) {
    // Reported by developers for any non-tester while the app only has
    // Standard Access (Development mode). Not in Meta's docs.
    message =
      "Instagram couldn't open a DM with this person. While Cue's Meta app is in Development mode, DMs only reach Instagram Testers.";
  } else if (code !== undefined) {
    message = `Instagram error ${code}${sub ? `/${sub}` : ""}: ${raw}`;
  }
  return new InstagramApiError(message.slice(0, 400), status, retryable, code, sub);
}

async function call<T>(
  url: string,
  token: string,
  init?: { method?: "GET" | "POST"; json?: unknown },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new InstagramApiError(`Couldn't reach Instagram: ${why}`, 0, true);
  }
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok || (body as { error?: unknown } | null)?.error) {
    throw toError(res.status, body);
  }
  return body as T;
}

/**
 * Asks Meta to send this account's webhooks to Cue: comments (triggers and
 * the Reply Desk), messages (story replies, DM keywords, answers to a
 * question) and postbacks (taps on "Send me the link"). Meta only delivers
 * them once the app is Live with Advanced Access; until then this still
 * succeeds and nothing arrives.
 */
export async function subscribeToWebhooks(token: string): Promise<void> {
  await call<{ success: boolean }>(
    `${GRAPH}/me/subscribed_apps?subscribed_fields=comments,messages,messaging_postbacks`,
    token,
    { method: "POST" },
  );
}

export interface InstagramMedia {
  id: string;
  caption?: string;
  media_type?: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
}

/** The account's most recent posts, newest first. */
export async function listRecentMedia(
  token: string,
  limit = 12,
): Promise<InstagramMedia[]> {
  const fields =
    "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp";
  const data = await call<{ data: InstagramMedia[] }>(
    `${GRAPH}/me/media?fields=${fields}&limit=${limit}`,
    token,
  );
  return data.data ?? [];
}

export interface InstagramComment {
  id: string;
  text?: string;
  timestamp?: string;
  username?: string;
  parent_id?: string;
  from?: { id: string; username?: string };
}

/**
 * Top-level comments on a post (replies are a separate edge). Reads up to
 * `maxPages` pages of 50; the engine ignores anything it has already handled.
 */
export async function listComments(
  token: string,
  mediaId: string,
  maxPages = 3,
): Promise<InstagramComment[]> {
  const out: InstagramComment[] = [];
  let url: string | undefined =
    `${GRAPH}/${mediaId}/comments?fields=id,text,timestamp,username,parent_id,from&limit=50`;
  for (let page = 0; url && page < maxPages; page++) {
    const res: { data?: InstagramComment[]; paging?: { next?: string } } =
      await call(url, token);
    out.push(...(res.data ?? []));
    url = res.paging?.next;
  }
  return out;
}

/** Posts a public reply under a comment, as the account. */
export async function replyToComment(
  token: string,
  commentId: string,
  message: string,
): Promise<string> {
  const res = await call<{ id: string }>(`${GRAPH}/${commentId}/replies`, token, {
    method: "POST",
    json: { message },
  });
  return res.id;
}

/**
 * Who a message goes to. `comment_id` makes it the private reply: the only
 * way a business can message someone who hasn't messaged it, once per
 * comment, within 7 days. `id` (their Instagram-scoped id) works for 24 hours
 * after they last messaged or tapped a button.
 */
export type Recipient = { comment_id: string } | { id: string };

/** A message: plain text, text with a link button, or text with a tap button. */
export type OutgoingMessage =
  | { text: string }
  | { text: string; link: { label: string; url: string } }
  | { text: string; tap: { label: string; payload: string } };

/** What's added to the text when Instagram refuses a tap button. */
export const TAP_FALLBACK = "Reply YES and I'll send it over.";

/**
 * Sends a DM. Buttons go as a button template; Meta doesn't say whether a
 * template is allowed on a private reply, so if one is refused the message
 * goes as text instead: the link in the text, or "reply YES" in place of a
 * tap button (the conversation treats a reply as a tap).
 */
export async function sendMessage(
  token: string,
  igUserId: string,
  recipient: Recipient,
  msg: OutgoingMessage,
): Promise<{ messageId: string; recipientId: string | null }> {
  const url = `${GRAPH}/${igUserId}/messages`;
  const post = async (message: unknown) => {
    const res = await call<{ message_id: string; recipient_id?: string }>(url, token, {
      method: "POST",
      json: { recipient, message },
    });
    return { messageId: res.message_id, recipientId: res.recipient_id ?? null };
  };

  const button =
    "link" in msg
      ? { type: "web_url", url: msg.link.url, title: msg.link.label }
      : "tap" in msg
        ? { type: "postback", payload: msg.tap.payload, title: msg.tap.label }
        : null;
  if (!button) return post({ text: msg.text });

  try {
    return await post({
      attachment: {
        type: "template",
        payload: { template_type: "button", text: msg.text, buttons: [button] },
      },
    });
  } catch (err) {
    // Throttling, auth and "can't message this person" would fail the same
    // way as text, so only a rejected template falls back.
    if (
      err instanceof InstagramApiError &&
      !err.retryable &&
      err.code === 100 &&
      err.subcode !== 2534001
    ) {
      const extra = "link" in msg ? msg.link.url : TAP_FALLBACK;
      return post({ text: `${msg.text}\n\n${extra}` });
    }
    throw err;
  }
}

/**
 * A person's username and whether they follow the account. Instagram only
 * answers once they've messaged or tapped a button (their consent), which is
 * exactly when the follow gate asks.
 */
export async function getUserProfile(
  token: string,
  igsid: string,
): Promise<{ username: string | null; follows: boolean | null }> {
  const res = await call<{ username?: string; is_user_follow_business?: boolean }>(
    `${GRAPH}/${igsid}?fields=username,is_user_follow_business`,
    token,
  );
  return {
    username: res.username ?? null,
    follows:
      typeof res.is_user_follow_business === "boolean" ? res.is_user_follow_business : null,
  };
}
