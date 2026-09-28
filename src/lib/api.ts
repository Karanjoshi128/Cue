import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Shared plumbing for the programmatic API under /api/v1: key handling,
// bearer authentication, and one error shape for every route.

/**
 * An error that carries its HTTP status. Business-rule failures throw this so
 * the API can answer 4xx instead of 500. It is still a plain Error, so the
 * cookie-session server actions that share the same code keep working: they
 * only ever read `.message`.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Every /api/v1 failure has the same body: `{ error, details? }`. `details` is
 * only present for validation failures, listing each field that failed.
 */
export function apiErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: err.issues[0]?.message ?? "Invalid request",
        details: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  // Unexpected: log the real cause for Vercel logs, never leak it to callers.
  console.error("[api] unhandled error:", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/** Parses a JSON body, turning a malformed one into a 400 instead of a 500. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "Invalid request body: expected JSON.");
  }
}

/**
 * The optional Idempotency-Key header. Absent is fine (no dedupe); present but
 * empty or oversized is rejected, so a caller relying on it can't silently
 * lose that protection.
 */
export function readIdempotencyKey(req: Request): string | undefined {
  const raw = req.headers.get("idempotency-key");
  if (raw === null) return undefined;
  const key = raw.trim();
  if (!key || key.length > 255) {
    throw new ApiError(400, "Idempotency-Key must be 1-255 characters.");
  }
  return key;
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

const KEY_PREFIX = "cue_";

/**
 * A new API key: `cue_` + 32 random bytes as base64url. Returns the plaintext
 * exactly once, for showing to the admin who created it. Only `hash` and a
 * short display `prefix` are ever persisted.
 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

/**
 * sha256 of a key. A fast hash is correct here, unlike for passwords: the key
 * is 256 bits of randomness, so there's nothing to brute-force, and a
 * deterministic hash lets a request find its key through a unique index.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function unauthorized(): ApiError {
  return new ApiError(401, "Invalid or missing API key.");
}

/**
 * Authenticates a request by its `Authorization: Bearer <key>` header and
 * returns the key's User - the same shape requireUser() returns for a cookie
 * session, so code written against a session user works unchanged.
 *
 * Every failure (no header, malformed, unknown key, revoked key) produces the
 * same 401, so a caller can't learn whether a given key ever existed.
 */
export async function requireApiUser(req: Request): Promise<User> {
  const header = req.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(header.trim())?.[1];
  if (!token || !token.startsWith(KEY_PREFIX)) throw unauthorized();

  const key = await prisma.apiKey.findUnique({
    where: { hash: hashApiKey(token) },
    include: { user: true },
  });
  if (!key || key.revokedAt) throw unauthorized();
  // A key belongs to one workspace. If its user ever ended up elsewhere, the
  // key must not become a way into that other tenant.
  if (key.user.workspaceId !== key.workspaceId) throw unauthorized();

  // Telemetry for the Settings list. Best effort: a failed write here is not a
  // reason to refuse an otherwise valid request.
  await prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return key.user;
}
