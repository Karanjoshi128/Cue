import { request } from "node:https";
import { z } from "zod";
import type { StorageConfig } from "@prisma/client";
import {
  assertPublicHost,
  checkPublicHttpsUrl,
  deleteObject,
  makeTarget,
  objectUrl,
  presignPut,
  publicOnlyAgent,
  putObject,
  resolveEndpoint,
  settingsFromConfig,
  StorageError,
  type StorageSettings,
  type StorageTarget,
} from "@/lib/storage";

// Validation and the live connection test behind Settings > Media storage.
// Server-only: it handles plaintext secrets.

const bucket = z
  .string()
  .trim()
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,61}[a-zA-Z0-9]$/,
    "Bucket names are 3 to 63 letters, numbers, dots, dashes or underscores.",
  );
const accessKeyId = z
  .string()
  .trim()
  .min(1, "Enter the access key ID.")
  .max(128)
  .regex(/^\S+$/, "The access key ID can't contain spaces.");
// Blank on edit means "keep the saved secret".
const secretAccessKey = z.string().trim().max(256).optional();
const publicUrl = z.string().trim().min(1, "Enter the public URL.").max(300);

export const storageInputSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("R2"),
    accountId: z
      .string()
      .trim()
      .regex(
        /^[a-f0-9]{32}$/i,
        "The account ID is the 32-character ID from your Cloudflare dashboard.",
      ),
    jurisdiction: z.enum(["default", "eu", "fedramp"]),
    bucket,
    accessKeyId,
    secretAccessKey,
    publicUrl,
  }),
  z.object({
    provider: z.literal("S3"),
    endpoint: z.string().trim().max(300),
    region: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9-]{1,40}$/, "Enter the region, e.g. us-east-1."),
    forcePathStyle: z.boolean(),
    bucket,
    accessKeyId,
    secretAccessKey,
    publicUrl,
  }),
]);

export type StorageInput = z.infer<typeof storageInputSchema>;

/**
 * Turns form input into connection settings, or throws a StorageError with a
 * message for the user. A blank secret reuses the saved one, but only while
 * the access key and endpoint are unchanged: pointing saved credentials at a
 * different service needs the secret typed again.
 */
export function settingsFromInput(
  raw: unknown,
  existing: StorageConfig | null,
): StorageSettings {
  const parsed = storageInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new StorageError(parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const input = parsed.data;

  let base: Omit<StorageSettings, "secretAccessKey">;
  if (input.provider === "R2") {
    base = {
      provider: "R2",
      accountId: input.accountId.toLowerCase(),
      jurisdiction: input.jurisdiction === "default" ? null : input.jurisdiction,
      endpoint: null,
      region: "auto",
      bucket: input.bucket,
      forcePathStyle: false,
      accessKeyId: input.accessKeyId,
      publicUrl: input.publicUrl,
    };
  } else {
    const endpoint = input.endpoint
      ? checkPublicHttpsUrl(input.endpoint, "The endpoint").href.replace(/\/+$/, "")
      : null;
    base = {
      provider: "S3",
      accountId: null,
      jurisdiction: null,
      endpoint,
      region: input.region,
      bucket: input.bucket,
      forcePathStyle: input.forcePathStyle,
      accessKeyId: input.accessKeyId,
      publicUrl: input.publicUrl,
    };
  }
  base.publicUrl = checkPublicHttpsUrl(base.publicUrl, "The public URL").href.replace(
    /\/+$/,
    "",
  );

  let secret = input.secretAccessKey ?? "";
  if (!secret) {
    const sameIdentity =
      existing &&
      existing.provider === base.provider &&
      existing.accessKeyId === base.accessKeyId &&
      resolveEndpoint(settingsFromConfig(existing)) ===
        resolveEndpoint({ ...base, secretAccessKey: "" });
    if (!sameIdentity) {
      throw new StorageError(
        existing
          ? "Enter the secret access key again: the access key or endpoint changed."
          : "Enter the secret access key.",
      );
    }
    secret = settingsFromConfig(existing).secretAccessKey;
  }
  return { ...base, secretAccessKey: secret };
}

// ---------------------------------------------------------------------------
// The live test
// ---------------------------------------------------------------------------

export type CheckStatus = "ok" | "fail" | "warn" | "skip";

export interface StorageCheck {
  id: "write" | "public" | "cleanup";
  status: CheckStatus;
  detail?: string;
}

export interface StorageTestResult {
  /** True when uploads would work and the files would be publicly readable. */
  ok: boolean;
  checks: StorageCheck[];
  /** Where the browser should PUT a test file, to prove CORS allows uploads. */
  browserTest?: { uploadUrl: string; key: string };
  /** A form-level problem (bad input) rather than a failed check. */
  error?: string;
}

const TEST_PREFIX = "cue-connection-test/";
export const BROWSER_TEST_KEY =
  /^cue-connection-test\/[0-9a-f-]{36}-browser\.txt$/;

/** A user-facing explanation of an S3 SDK or network failure. */
export function describeStorageError(e: unknown, s: StorageSettings): string {
  if (e instanceof StorageError) return e.message;
  const err = e as {
    name?: string;
    code?: string;
    message?: string;
    cause?: { code?: string };
    $metadata?: { httpStatusCode?: number };
  };
  const name = err?.name ?? "";
  const code = err?.code ?? err?.cause?.code ?? "";
  const status = err?.$metadata?.httpStatusCode;
  const host = (() => {
    const ep = resolveEndpoint(s);
    return ep ? new URL(ep).host : `s3.${s.region}.amazonaws.com`;
  })();

  if (name === "InvalidAccessKeyId" || status === 401) {
    return "The access key ID wasn't recognised. Check it, and that the key hasn't been deleted.";
  }
  if (name === "SignatureDoesNotMatch") {
    return "The secret access key doesn't match the access key ID.";
  }
  if (name === "NoSuchBucket" || status === 404) {
    return `There's no bucket called "${s.bucket}" here. Check the bucket name${
      s.provider === "R2" ? " and the jurisdiction" : " and the endpoint"
    }.`;
  }
  if (
    name === "PermanentRedirect" ||
    name === "AuthorizationHeaderMalformed" ||
    name === "IllegalLocationConstraintException" ||
    status === 301
  ) {
    return "The bucket is in a different region. Check the region.";
  }
  if (name === "AccessDenied" || name === "Forbidden" || status === 403) {
    return `These keys can't write to "${s.bucket}". Check the bucket name, and that the keys have read and write access to it.`;
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return `Couldn't find ${host}. Check the ${s.provider === "R2" ? "account ID" : "endpoint"}.`;
  }
  if (code === "ECONNREFUSED" || code === "ECONNRESET") {
    return `${host} refused the connection. Check the endpoint.`;
  }
  if (name === "TimeoutError" || code === "ETIMEDOUT" || name === "RequestTimeout") {
    return `${host} didn't respond in time. Check the endpoint.`;
  }
  if (code.startsWith("CERT_") || code.includes("SSL") || code.includes("TLS")) {
    return `${host} doesn't have a valid HTTPS certificate.`;
  }
  const said = (err?.message ?? "").trim().slice(0, 200);
  return said ? `The storage service said: ${said}` : "The storage service rejected the request.";
}

/**
 * GETs a URL through the public-only agent (no redirects followed) and keeps
 * at most the first 2 KB of the body.
 */
function getSome(
  url: string,
): Promise<{ status: number; location: string | null; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        agent: publicOnlyAgent(),
        timeout: 10_000,
        headers: { "cache-control": "no-cache", "user-agent": "Cue storage check" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const done = () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location ?? null,
            body: Buffer.concat(chunks).subarray(0, 2048).toString("utf8"),
          });
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          size += chunk.length;
          if (size >= 2048) res.destroy();
        });
        res.on("end", done);
        res.on("close", done);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/** Fetches the test file through the public URL and checks it's ours. */
async function checkPublicRead(
  target: StorageTarget,
  key: string,
  token: string,
): Promise<string | null> {
  const url = objectUrl(target, key);
  try {
    await assertPublicHost(target.publicUrl);
  } catch (e) {
    return (e as Error).message;
  }
  let res: Awaited<ReturnType<typeof getSome>>;
  try {
    // No redirects: a public URL that bounces elsewhere could bounce Cue's
    // servers somewhere internal, and platforms want the final URL anyway.
    res = await getSome(url);
  } catch (e) {
    return e instanceof StorageError
      ? e.message
      : `Couldn't reach ${new URL(url).host}. Check the public URL.`;
  }
  if (res.status >= 300 && res.status < 400) {
    return `The public URL redirects${res.location ? ` to ${res.location.slice(0, 120)}` : ""}. Enter the final address instead.`;
  }
  if (res.status === 401 || res.status === 403) {
    return `The file uploaded, but the public URL refused to serve it (${res.status}). Turn on public read access for the bucket.`;
  }
  if (res.status === 404) {
    return "The file uploaded, but it isn't at the public URL (404). Check that the public URL belongs to this bucket and that public access is on.";
  }
  if (res.status < 200 || res.status >= 300) {
    return `The public URL answered ${res.status}.`;
  }
  if (res.body.trim() !== token) {
    return "The public URL served something other than the test file. Check that it points at this bucket.";
  }
  return null;
}

/**
 * Proves a bucket works for Cue end to end, from the server side: write a
 * small file, read it back through the public URL (which is how Instagram,
 * LinkedIn and YouTube fetch media), then delete it. Also hands back a
 * presigned PUT so the browser can prove the bucket's CORS allows uploads.
 */
export async function testStorage(s: StorageSettings): Promise<StorageTestResult> {
  const target = makeTarget(s);
  const id = crypto.randomUUID();
  const key = `${TEST_PREFIX}${id}.txt`;
  const token = `cue-storage-check ${id}`;
  const checks: StorageCheck[] = [];

  try {
    await putObject(target, key, token, "text/plain");
    checks.push({ id: "write", status: "ok" });
  } catch (e) {
    checks.push({ id: "write", status: "fail", detail: describeStorageError(e, s) });
    checks.push({ id: "public", status: "skip" }, { id: "cleanup", status: "skip" });
    return { ok: false, checks };
  }

  const publicProblem = await checkPublicRead(target, key, token);
  checks.push(
    publicProblem
      ? { id: "public", status: "fail", detail: publicProblem }
      : { id: "public", status: "ok" },
  );

  try {
    await deleteObject(target, key);
    checks.push({ id: "cleanup", status: "ok" });
  } catch {
    // Cue never deletes media, so a key without delete rights still works.
    checks.push({
      id: "cleanup",
      status: "warn",
      detail: `Cue couldn't delete its test file (${key}). Uploads still work; you can delete it yourself.`,
    });
  }

  const ok = !publicProblem;
  return {
    ok,
    checks,
    browserTest: ok
      ? {
          key: `${TEST_PREFIX}${id}-browser.txt`,
          uploadUrl: await presignPut(
            target,
            `${TEST_PREFIX}${id}-browser.txt`,
            "text/plain",
            120,
          ),
        }
      : undefined,
  };
}

