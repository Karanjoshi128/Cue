import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Who runs the platform, and the signed cookie behind "view as". Kept free of
// auth.ts imports (auth.ts imports this), so there's no cycle.

const DEFAULT_ADMINS = ["joshikaran0008@gmail.com"];

/**
 * Platform admins: PLATFORM_ADMIN_EMAILS (comma-separated) when set, else the
 * default above. Set but empty means nobody: the panel is switched off. They
 * get /admin; nobody else can tell it exists.
 */
export function platformAdminEmails(): string[] {
  const raw = process.env.PLATFORM_ADMIN_EMAILS;
  return (raw !== undefined ? raw.split(",") : DEFAULT_ADMINS)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  return !!email && platformAdminEmails().includes(email.toLowerCase());
}

// ---------------------------------------------------------------------------
// "View as": read-only, time-limited, bound to the admin who started it
// ---------------------------------------------------------------------------

export const VIEW_AS_COOKIE = "cue_view_as";
export const VIEW_AS_MINUTES = 30;

export interface ViewAsToken {
  workspaceId: string;
  adminEmail: string;
  /** Epoch ms. */
  expiresAt: number;
}

function signingKey(): Buffer {
  const secret = process.env.TOKEN_ENC_KEY;
  if (!secret) throw new Error("TOKEN_ENC_KEY is not set");
  // Derived, so this HMAC key is never the encryption key itself.
  return createHmac("sha256", secret).update("cue:view-as:v1").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function signViewAs(token: ViewAsToken): string {
  const payload = Buffer.from(JSON.stringify(token)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyViewAs(value: string | undefined): ViewAsToken | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  try {
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      return null;
    }
    const token = JSON.parse(Buffer.from(payload, "base64url").toString()) as ViewAsToken;
    if (
      typeof token.workspaceId !== "string" ||
      typeof token.adminEmail !== "string" ||
      typeof token.expiresAt !== "number" ||
      token.expiresAt <= Date.now()
    ) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export async function readViewAsCookie(): Promise<ViewAsToken | null> {
  return verifyViewAs((await cookies()).get(VIEW_AS_COOKIE)?.value);
}
