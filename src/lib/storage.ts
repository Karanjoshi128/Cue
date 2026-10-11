import { lookup as lookupCallback, type LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { Agent } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageConfig, StorageProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

// Media storage. Every workspace uploads to Cue's default Cloudflare R2 bucket
// (the R2_* env vars) unless an admin has connected their own bucket in
// Settings, in which case it goes there. Either way it is S3 over the same
// SDK; only the endpoint, keys and public URL change.
//
// Large files never pass through a function: the browser PUTs them straight
// to the bucket with a presigned URL (see presignPut), which is what lifts the
// ~4.5 MB platform cap on request bodies. That needs the bucket's CORS policy
// to allow PUT from the app's origin.

/** Connection settings with the secret in plaintext. Server-only. */
export interface StorageSettings {
  provider: StorageProvider;
  accountId?: string | null;
  jurisdiction?: string | null;
  endpoint?: string | null;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
}

/** A workspace's storage, resolved for one request. */
export interface StorageTarget {
  client: S3Client;
  bucket: string;
  /** Base URL objects are publicly readable at, no trailing slash. */
  publicUrl: string;
  /** The S3 API endpoint, or null for AWS S3's own. */
  endpoint: string | null;
  /** True for a workspace's own bucket, false for Cue's default. */
  custom: boolean;
}

export function r2Endpoint(accountId: string, jurisdiction?: string | null) {
  return `https://${accountId}${jurisdiction ? `.${jurisdiction}` : ""}.r2.cloudflarestorage.com`;
}

export function resolveEndpoint(s: StorageSettings): string | null {
  if (s.provider === "R2") return r2Endpoint(s.accountId ?? "", s.jurisdiction);
  return s.endpoint || null;
}

export function makeTarget(s: StorageSettings, custom = true): StorageTarget {
  const endpoint = resolveEndpoint(s);
  return {
    client: new S3Client({
      region: s.provider === "R2" ? "auto" : s.region,
      endpoint: endpoint ?? undefined,
      forcePathStyle: s.provider === "S3" && s.forcePathStyle,
      credentials: {
        accessKeyId: s.accessKeyId,
        secretAccessKey: s.secretAccessKey,
      },
      // Add checksums only where an operation demands one. The SDK default
      // signs a CRC32 of an *empty* body into every presigned PUT URL, which
      // AWS S3, Backblaze B2 and others then reject against the real upload.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      // A workspace's own endpoint is untrusted: connect only to public
      // addresses, and fail in seconds rather than hang on a wrong one.
      ...(custom && {
        requestHandler: {
          httpsAgent: publicOnlyAgent(),
          connectionTimeout: 5_000,
          requestTimeout: 30_000,
          throwOnRequestTimeout: true,
        },
      }),
    }),
    bucket: s.bucket,
    publicUrl: s.publicUrl.replace(/\/+$/, ""),
    endpoint,
    custom,
  };
}

let _default: StorageTarget | null = null;

/** Cue's own bucket, used by every workspace that hasn't connected one. */
export function defaultStorage(): StorageTarget {
  _default ??= makeTarget(
    {
      provider: "R2",
      accountId: process.env.R2_ACCOUNT_ID ?? "",
      region: "auto",
      bucket: process.env.R2_BUCKET ?? "",
      forcePathStyle: false,
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      publicUrl: process.env.R2_PUBLIC_URL ?? "",
    },
    false,
  );
  return _default;
}

export function settingsFromConfig(cfg: StorageConfig): StorageSettings {
  return { ...cfg, secretAccessKey: decrypt(cfg.secretAccessKey) };
}

/** Where this workspace's uploads go: its own bucket, else Cue's default. */
export async function getWorkspaceStorage(
  workspaceId: string,
): Promise<StorageTarget> {
  const cfg = await prisma.storageConfig.findUnique({ where: { workspaceId } });
  return cfg ? makeTarget(settingsFromConfig(cfg)) : defaultStorage();
}

export function objectUrl(target: StorageTarget, key: string): string {
  return `${target.publicUrl}/${key}`;
}

/**
 * A short-lived URL the browser can PUT one object to. Only `host` is signed,
 * so the uploader may send any Content-Type.
 */
export function presignPut(
  target: StorageTarget,
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<string> {
  return getSignedUrl(
    target.client,
    new PutObjectCommand({
      Bucket: target.bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn },
  );
}

/** Server-side upload. Returns the object's public URL. */
export async function putObject(
  target: StorageTarget,
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
): Promise<string> {
  if (target.custom) await assertPublicHost(target.endpoint);
  await target.client.send(
    new PutObjectCommand({
      Bucket: target.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return objectUrl(target, key);
}

export async function deleteObject(target: StorageTarget, key: string) {
  if (target.custom) await assertPublicHost(target.endpoint);
  await target.client.send(
    new DeleteObjectCommand({ Bucket: target.bucket, Key: key }),
  );
}

/** Batch delete, up to 1000 keys per request. */
export async function deleteObjects(target: StorageTarget, keys: string[]) {
  if (keys.length === 0) return;
  if (target.custom) await assertPublicHost(target.endpoint);
  for (let i = 0; i < keys.length; i += 1000) {
    await target.client.send(
      new DeleteObjectsCommand({
        Bucket: target.bucket,
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) },
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Network safety for user-supplied endpoints
// ---------------------------------------------------------------------------

// Anyone can sign up and create a workspace, so a workspace's endpoint and
// public URL are untrusted: without these checks they could point Cue's
// servers at internal addresses (cloud metadata, the database, localhost).

/** A message safe to show the user, for an input or connection problem. */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

/** True for anything that isn't a public unicast address. */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(v) === 4) return isPrivateIPv4(v);
  if (isIP(v) === 6) {
    // Allow only global unicast (2000::/3), minus 6to4, which can wrap a
    // private IPv4. That rules out loopback, link-local, unique-local,
    // multicast and every IPv4-mapped or NAT64 form in one test.
    return !/^[23][0-9a-f]{0,3}:/.test(v) || v.startsWith("2002:");
  }
  return true;
}

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan"];

/**
 * Validates a user-supplied https URL without touching the network: https
 * only, no credentials or query, and not an obviously internal host.
 */
export function checkPublicHttpsUrl(raw: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new StorageError(`${label} isn't a valid URL.`);
  }
  if (url.protocol !== "https:") {
    throw new StorageError(`${label} must start with https://`);
  }
  if (url.username || url.password) {
    throw new StorageError(`${label} can't contain a username or password.`);
  }
  if (url.search || url.hash) {
    throw new StorageError(`${label} can't contain "?" or "#".`);
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const blocked = isIP(host)
    ? isPrivateAddress(host)
    : !host.includes(".") ||
      host === "localhost" ||
      BLOCKED_SUFFIXES.some((s) => host.endsWith(s));
  if (blocked) {
    throw new StorageError(`${label} must be a public internet address.`);
  }
  return url;
}

/**
 * dns.lookup that refuses private addresses. Used as the connection's own
 * lookup, so the check covers the exact host the SDK connects to (with
 * virtual-hosted addressing that's bucket.endpoint, not just the endpoint)
 * and leaves no gap for DNS rebinding between a check and the connect.
 */
const publicOnlyLookup = ((
  hostname: string,
  options: { all?: boolean },
  callback: (
    err: Error | null,
    address?: string | LookupAddress[],
    family?: number,
  ) => void,
) => {
  lookupCallback(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
      return callback(
        new StorageError(`${hostname} points to a private network address.`),
      );
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}) as LookupFunction;

let _agent: Agent | null = null;
/** HTTPS agent for anything a workspace pointed us at. */
export function publicOnlyAgent(): Agent {
  _agent ??= new Agent({ keepAlive: true, lookup: publicOnlyLookup });
  return _agent;
}

/**
 * Resolves the URL's host and refuses if any address is private. The agent
 * above is what enforces this on every connection; checking first just gives
 * the user a clear message instead of a socket error. Null means AWS S3.
 */
export async function assertPublicHost(url: string | null): Promise<void> {
  if (!url) return;
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new StorageError(`${host} is not a public internet address.`);
    }
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new StorageError(`Couldn't find ${host}. Check the address.`);
  }
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new StorageError(`${host} points to a private network address.`);
  }
}
