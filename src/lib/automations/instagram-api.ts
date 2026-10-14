import { GRAPH } from "@/lib/platforms/instagram";

// The Instagram API (Instagram Login, graph.instagram.com) calls behind
// comment automations. Every call needs instagram_business_manage_comments;
// the private reply also uses instagram_business_manage_messages.
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
    message = "Instagram only allows this DM within 7 days of the comment.";
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
 * Asks Meta to send this account's comment webhooks to Cue. Only `comments`:
 * Cue doesn't read the inbox, so it doesn't ask for message events. Meta only
 * delivers them once the app is Live with Advanced Access; until then this
 * still succeeds and nothing arrives.
 */
export async function subscribeToCommentWebhooks(token: string): Promise<void> {
  await call<{ success: boolean }>(
    `${GRAPH}/me/subscribed_apps?subscribed_fields=comments`,
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
 * The private reply: a DM tied to the comment, which is the only way a
 * business can message someone who hasn't messaged it first. One per comment,
 * within 7 days of it. With a link, it's sent as a button template; Meta
 * doesn't say whether templates are allowed on a private reply, so if that's
 * refused the link goes in the text instead.
 */
export async function sendPrivateReply(
  token: string,
  igUserId: string,
  commentId: string,
  text: string,
  button?: { label: string; url: string } | null,
): Promise<string> {
  const url = `${GRAPH}/${igUserId}/messages`;
  const recipient = { comment_id: commentId };
  const plain = () =>
    call<{ message_id: string }>(url, token, {
      method: "POST",
      json: {
        recipient,
        message: { text: button ? `${text}\n\n${button.url}` : text },
      },
    });

  if (!button) return (await plain()).message_id;
  try {
    const res = await call<{ message_id: string }>(url, token, {
      method: "POST",
      json: {
        recipient,
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text,
              buttons: [{ type: "web_url", url: button.url, title: button.label }],
            },
          },
        },
      },
    });
    return res.message_id;
  } catch (err) {
    // Throttling, auth and "can't message this person" would fail the same
    // way as text, so only a rejected template falls back.
    if (
      err instanceof InstagramApiError &&
      !err.retryable &&
      err.code === 100 &&
      err.subcode !== 2534001
    ) {
      return (await plain()).message_id;
    }
    throw err;
  }
}
