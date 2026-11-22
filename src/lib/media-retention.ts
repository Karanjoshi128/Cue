import { Prisma, type StorageConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  cueMediaKey,
  defaultStorage,
  deleteEach,
  makeTarget,
  settingsFromConfig,
  StorageError,
  type StorageTarget,
} from "@/lib/storage";

// Video retention. A video file is deleted from storage (Cue's R2 bucket, or
// the workspace's own bucket) 7 days after its post goes live: by then every
// network has its own copy, and videos are what fill a bucket. Only the file
// goes. The post, its links and its history stay, and images, covers and
// documents are kept. Runs hourly from pg_cron (/api/cron/media-retention).

/** Days a published video stays in storage before it's deleted. */
export const VIDEO_RETENTION_DAYS = 7;

/** Shown wherever a post whose video is gone can't be sent again. */
export const VIDEO_REMOVED_MESSAGE = `This post's video was deleted from storage ${VIDEO_RETENTION_DAYS} days after it went live, so it can't be sent again. Duplicate the post and add the video again.`;

const NOW_UTC = Prisma.sql`(now() AT TIME ZONE 'UTC')`; // Prisma stores UTC in "timestamp" columns

/**
 * True when the post (SQL alias `p`) is finished with its video:
 * - it went live on at least one account (PUBLISHED, or PARTIAL);
 * - nothing is still waiting to go out or mid-upload;
 * - its most recent publish was more than VIDEO_RETENTION_DAYS ago.
 * A partly published post can retry its failed accounts until then. A post
 * that never went live (draft, scheduled, failed) keeps its video.
 */
function doneWithVideo(alias: string) {
  const p = Prisma.raw(alias);
  return Prisma.sql`(
    ${p}.status IN ('PUBLISHED', 'PARTIAL')
    AND NOT EXISTS (
      SELECT 1 FROM "PostTarget" t
      WHERE t."postId" = ${p}.id AND t.status IN ('SCHEDULED', 'PROCESSING'))
    AND COALESCE(
          (SELECT max(t."publishedAt") FROM "PostTarget" t WHERE t."postId" = ${p}.id),
          ${p}."updatedAt")
        <= ${NOW_UTC} - make_interval(days => ${VIDEO_RETENTION_DAYS}::int)
  )`;
}

interface Candidate {
  key: string;
  urls: string[];
  workspaceIds: string[];
  bytes: bigint | null;
}

/**
 * Video files every one of whose posts is done with them. Duplicating a post
 * copies its media rows, so one file can belong to several posts: it's only
 * deleted once all of them qualify. A file whose last attempt failed waits a
 * day before the next one, so a broken bucket isn't retried every hour.
 */
function findCandidates(limit: number) {
  return prisma.$queryRaw<Candidate[]>`
    SELECT m."storageKey" AS key,
           array_agg(DISTINCT m.url) AS urls,
           array_agg(DISTINCT c."workspaceId") AS "workspaceIds",
           max(m."sizeBytes")::bigint AS bytes
    FROM "MediaAsset" m
    JOIN "Post" p ON p.id = m."postId"
    JOIN "Client" c ON c.id = p."clientId"
    WHERE m."storageKey" IN (
      SELECT v."storageKey" FROM "MediaAsset" v
      WHERE v.type = 'VIDEO' AND v."removedAt" IS NULL
        AND (v."removalTriedAt" IS NULL OR v."removalTriedAt" < ${NOW_UTC} - interval '1 day'))
    GROUP BY m."storageKey"
    HAVING bool_and(m.type = 'VIDEO' AND m."removedAt" IS NULL)
       AND bool_and(${doneWithVideo("p")})
    ORDER BY min(m."createdAt")
    LIMIT ${limit}`;
}

/**
 * Marks the files removed, re-checking in the same statement that every post
 * using each one still qualifies (someone may have duplicated a post since
 * the candidates were read). Returns the keys it marked: only those are
 * deleted from storage.
 */
async function markRemoved(keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const rows = await prisma.$queryRaw<{ key: string }[]>`
    UPDATE "MediaAsset" m
    SET "removedAt" = ${NOW_UTC}, "removalTriedAt" = NULL, "removalError" = NULL
    WHERE m."storageKey" IN (${Prisma.join(keys)}) AND m."removedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "MediaAsset" o JOIN "Post" p ON p.id = o."postId"
        WHERE o."storageKey" = m."storageKey" AND NOT ${doneWithVideo("p")})
    RETURNING m."storageKey" AS key`;
  return new Set(rows.map((r) => r.key));
}

/** Records a failed attempt; the file is tried again a day later. */
async function markFailed(keys: string[], error: string) {
  if (!keys.length) return;
  await prisma.mediaAsset.updateMany({
    where: { storageKey: { in: keys } },
    data: { removedAt: null, removalTriedAt: new Date(), removalError: error.slice(0, 300) },
  });
}

/** Where each file lives: Cue's bucket, or the workspace's own. */
interface Group {
  target: () => StorageTarget;
  keys: string[];
}

async function groupByBucket(cands: Candidate[]) {
  const groups = new Map<string, Group>();
  const unreachable: string[] = [];
  const configs = new Map<string, StorageConfig | null>();
  const add = (id: string, target: () => StorageTarget, key: string) => {
    const g = groups.get(id) ?? { target, keys: [] };
    g.keys.push(key);
    groups.set(id, g);
  };

  for (const c of cands) {
    // Cue's bucket can be served from more than one host; match on the key.
    if (c.urls.some((u) => cueMediaKey(u) === c.key)) {
      add("cue", defaultStorage, c.key);
      continue;
    }
    // The workspace's own bucket, found by its public URL. It's used even if
    // a platform admin has since switched "Own storage" off: that only sends
    // new uploads back to Cue's bucket, and the old files are still theirs.
    let found = false;
    for (const ws of c.workspaceIds) {
      if (!configs.has(ws)) {
        configs.set(ws, await prisma.storageConfig.findUnique({ where: { workspaceId: ws } }));
      }
      const cfg = configs.get(ws);
      if (!cfg) continue;
      const base = cfg.publicUrl.replace(/\/+$/, "");
      if (c.urls.some((u) => u === `${base}/${c.key}`)) {
        add(cfg.id, () => makeTarget(settingsFromConfig(cfg)), c.key);
        found = true;
        break;
      }
    }
    // Uploaded to a bucket the workspace has since disconnected or replaced:
    // Cue no longer has the keys to it.
    if (!found) unreachable.push(c.key);
  }
  return { groups: [...groups.values()], unreachable };
}

export interface RetentionResult {
  checked: number;
  removed: number;
  failed: number;
  /** Declared size of the files deleted, where it was recorded. */
  bytesFreed: number;
}

type Remover = (target: StorageTarget, keys: string[]) => Promise<{ key: string; error: string }[]>;

/**
 * One retention pass. `remove` is the storage call; tests pass a fake so
 * nothing real is deleted.
 */
export async function runMediaRetention({
  limit = 500,
  remove = deleteEach,
}: { limit?: number; remove?: Remover } = {}): Promise<RetentionResult> {
  const cands = await findCandidates(limit);
  const result: RetentionResult = { checked: cands.length, removed: 0, failed: 0, bytesFreed: 0 };
  if (!cands.length) return result;

  const { groups, unreachable } = await groupByBucket(cands);
  await markFailed(
    unreachable,
    "Not deleted: the bucket this video was uploaded to is no longer connected to the workspace.",
  );
  result.failed += unreachable.length;

  const sizes = new Map(cands.map((c) => [c.key, Number(c.bytes ?? 0)]));
  for (const g of groups) {
    const marked = await markRemoved(g.keys);
    const keys = g.keys.filter((k) => marked.has(k));
    if (!keys.length) continue;
    let failures: { key: string; error: string }[];
    try {
      failures = await remove(g.target(), keys);
    } catch (e) {
      const why = e instanceof StorageError ? e.message : e instanceof Error ? e.message : String(e);
      failures = keys.map((key) => ({ key, error: `Not deleted: ${why}` }));
    }
    // Put failures back, so they're tried again tomorrow.
    const byError = new Map<string, string[]>();
    for (const f of failures) byError.set(f.error, [...(byError.get(f.error) ?? []), f.key]);
    for (const [error, ks] of byError) await markFailed(ks, error);

    const failedKeys = new Set(failures.map((f) => f.key));
    for (const k of keys) {
      if (failedKeys.has(k)) continue;
      result.removed++;
      result.bytesFreed += sizes.get(k) ?? 0;
    }
    result.failed += failedKeys.size;
  }
  return result;
}

/** Null, or why this post can't be sent again: its video has been deleted. */
export async function removedVideoProblem(postId: string): Promise<string | null> {
  const gone = await prisma.mediaAsset.findFirst({
    where: { postId, removedAt: { not: null } },
    select: { id: true },
  });
  return gone ? VIDEO_REMOVED_MESSAGE : null;
}
