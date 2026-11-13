import { createHash } from "crypto";

/*
 * The Resend API, just the parts the mailer uses. MAILER_RESEND_BASE_URL
 * points it at a fake server for local tests; production leaves it unset.
 */

const BASE = () => (process.env.MAILER_RESEND_BASE_URL ?? "https://api.resend.com").replace(/\/+$/, "");
const TIMEOUT_MS = 20_000;

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  headers?: Record<string, string>;
  /** Resend tags: ASCII letters, numbers, _ and - only. */
  tags?: { name: string; value: string }[];
}

export type SendOutcome =
  | { ok: true; id: string }
  | { ok: false; error: string; /** worth trying again later */ transient: boolean };

function body(m: OutgoingEmail) {
  return {
    from: m.from,
    to: [m.to],
    subject: m.subject,
    html: m.html,
    text: m.text,
    ...(m.replyTo ? { reply_to: m.replyTo } : {}),
    ...(m.headers ? { headers: m.headers } : {}),
    ...(m.tags ? { tags: m.tags } : {}),
  };
}

async function post(path: string, apiKey: string, payload: unknown, idempotencyKey?: string) {
  const res = await fetch(`${BASE()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep the raw text for the error message
  }
  return { status: res.status, json, text };
}

function errorMessage(status: number, json: unknown, text: string): string {
  const msg =
    json && typeof json === "object" && "message" in json ? String((json as { message: unknown }).message) : text;
  return `Resend ${status}: ${msg}`.slice(0, 500);
}

/** 429 and 5xx are worth retrying; anything else 4xx is a problem with the email or the account. */
const isTransient = (status: number) => status === 429 || status >= 500;

export async function sendOne(apiKey: string, m: OutgoingEmail, idempotencyKey?: string): Promise<SendOutcome> {
  try {
    const r = await post("/emails", apiKey, body(m), idempotencyKey);
    const id = (r.json as { id?: string } | null)?.id;
    if (r.status >= 200 && r.status < 300 && id) return { ok: true, id };
    return { ok: false, error: errorMessage(r.status, r.json, r.text), transient: isTransient(r.status) };
  } catch (e) {
    return { ok: false, error: `Couldn't reach Resend: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500), transient: true };
  }
}

/**
 * Sends up to 100 emails in one request. If Resend rejects the batch as a
 * whole for a validation problem (one bad address can do that), each email is
 * sent on its own so only the bad one fails.
 */
export async function sendBatch(apiKey: string, emails: OutgoingEmail[], keyParts: string[]): Promise<SendOutcome[]> {
  if (emails.length === 0) return [];
  if (emails.length === 1) return [await sendOne(apiKey, emails[0], `cue-${keyParts[0]}`)];
  const idem = `cue-batch-${createHash("sha256").update(keyParts.join(",")).digest("hex").slice(0, 40)}`;
  try {
    const r = await post("/emails/batch", apiKey, emails.map(body), idem);
    const data = (r.json as { data?: { id?: string }[] } | null)?.data;
    if (r.status >= 200 && r.status < 300 && Array.isArray(data) && data.length === emails.length) {
      return data.map((d) => (d?.id ? { ok: true, id: d.id } : { ok: false, error: "Resend returned no id", transient: false }));
    }
    if (r.status === 400 || r.status === 422) {
      return Promise.all(emails.map((m, i) => sendOne(apiKey, m, `cue-${keyParts[i]}`)));
    }
    const error = errorMessage(r.status, r.json, r.text);
    return emails.map(() => ({ ok: false, error, transient: isTransient(r.status) }));
  } catch (e) {
    const error = `Couldn't reach Resend: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500);
    return emails.map(() => ({ ok: false, error, transient: true }));
  }
}

export function fromHeader(name: string, email: string): string {
  const clean = name.replace(/["<>\r\n]/g, "").trim();
  return clean ? `"${clean}" <${email}>` : email;
}
