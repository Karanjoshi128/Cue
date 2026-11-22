/*
 * Video retention: which videos are deleted 7 days after going live, which are
 * kept, where they're deleted from (Cue's bucket or the workspace's own), and
 * what happens around a deleted video (retry, duplicate, reuse, plan usage).
 *
 * LOCAL ONLY: it refuses any database that isn't local with "test" in its
 * name, and storage deletes go to a fake, so nothing real is touched:
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:55433/cue_test \
 *   TOKEN_ENC_KEY=<64 hex chars> pnpm tsx scripts/e2e-media-retention.ts
 */
import { randomUUID } from "crypto";
import { createServer } from "http";
import type { AddressInfo } from "net";
import type { MediaType, PostStatus, TargetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { runMediaRetention, removedVideoProblem, VIDEO_REMOVED_MESSAGE } from "@/lib/media-retention";
import { assertWorkspaceMedia } from "@/lib/media";
import { getWorkspaceUsage } from "@/lib/plans";
import { deleteEach, makeTarget, type StorageTarget } from "@/lib/storage";

const DB = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(DB) || !/test/.test(DB.split("/").pop() ?? "")) {
  throw new Error("Refusing: needs a local test database (see the top of this file).");
}

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra === undefined ? "" : "  " + JSON.stringify(extra)}`);
  if (!cond) failures++;
}

const TAG = "retention-e2e";
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const CUE = "https://media.trycue.space"; // one of cueMediaBases()
const OWN = "https://cdn.example-agency.com"; // the custom bucket's public URL

// The fake storage call: records what would be deleted where, and refuses
// any key listed in `refuse`.
const deleted: { bucket: string; custom: boolean; keys: string[] }[] = [];
const refuse = new Set<string>();
async function fakeRemove(target: StorageTarget, keys: string[]) {
  deleted.push({ bucket: target.bucket, custom: target.custom, keys });
  return keys.filter((k) => refuse.has(k)).map((key) => ({ key, error: "AccessDenied: no delete permission" }));
}
const wasDeleted = (key: string) => deleted.some((d) => d.keys.includes(key));
const bucketOf = (key: string) => deleted.find((d) => d.keys.includes(key));

async function cleanup() {
  await prisma.post.deleteMany({ where: { client: { workspace: { name: { startsWith: TAG } } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.workspace.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  await cleanup();

  // Two workspaces: one on Cue's storage, one with its own bucket.
  const wsCue = await prisma.workspace.create({ data: { name: `${TAG} cue` } });
  const wsOwn = await prisma.workspace.create({ data: { name: `${TAG} own` } });
  await prisma.storageConfig.create({
    data: {
      workspaceId: wsOwn.id,
      provider: "S3",
      endpoint: "https://s3.example-agency.com",
      region: "us-east-1",
      bucket: "agency-media",
      accessKeyId: "AKIATEST",
      secretAccessKey: encrypt("secret"),
      publicUrl: OWN,
    },
  });
  const user = await prisma.user.create({ data: { email: `${TAG}@example.com`, workspaceId: wsCue.id } });
  const setup = async (workspaceId: string) => {
    const client = await prisma.client.create({ data: { name: `${TAG} client`, workspaceId } });
    const accounts = await Promise.all(
      ["YOUTUBE", "INSTAGRAM"].map((platform, i) =>
        prisma.socialAccount.create({
          data: {
            clientId: client.id,
            platform: platform as "YOUTUBE" | "INSTAGRAM",
            displayName: `${TAG} ${platform}`,
            externalId: `${TAG}-${workspaceId}-${i}`,
            accessToken: encrypt("token"),
          },
        }),
      ),
    );
    return { client, accounts };
  };
  const cue = await setup(wsCue.id);
  const own = await setup(wsOwn.id);

  type T = { status: TargetStatus; publishedAt?: Date | null };
  type M = { type?: MediaType; key?: string; base?: string; size?: number };
  async function makePost(
    ws: typeof cue,
    status: PostStatus,
    targets: T[],
    media: M[] = [{}],
  ) {
    const items = media.map((m) => {
      const key = m.key ?? `posts/${randomUUID()}.${m.type === "IMAGE" ? "jpg" : "mp4"}`;
      return { type: m.type ?? "VIDEO", key, url: `${m.base ?? CUE}/${key}`, size: m.size ?? 10_000_000 };
    });
    const post = await prisma.post.create({
      data: {
        clientId: ws.client.id,
        authorId: user.id,
        body: TAG,
        status,
        targets: {
          create: targets.map((t, i) => ({
            accountId: ws.accounts[i % 2].id,
            platform: ws.accounts[i % 2].platform,
            status: t.status,
            publishedAt: t.publishedAt ?? null,
          })),
        },
        media: {
          create: items.map((m, sortOrder) => ({
            type: m.type,
            url: m.url,
            storageKey: m.key,
            sizeBytes: m.size,
            sortOrder,
          })),
        },
      },
    });
    return { post, key: items[0].key, keys: items.map((m) => m.key) };
  }

  const published8 = [{ status: "PUBLISHED", publishedAt: ago(8) }] as T[];

  const A = await makePost(cue, "PUBLISHED", [
    { status: "PUBLISHED", publishedAt: ago(9) },
    { status: "PUBLISHED", publishedAt: ago(8) },
  ]);
  const B = await makePost(cue, "PUBLISHED", [
    { status: "PUBLISHED", publishedAt: ago(9) },
    { status: "PUBLISHED", publishedAt: ago(6) }, // the latest publish counts
  ]);
  const C = await makePost(cue, "PARTIAL", [
    { status: "PUBLISHED", publishedAt: ago(8) },
    { status: "FAILED" },
  ]);
  const D = await makePost(cue, "FAILED", [{ status: "FAILED" }, { status: "FAILED" }]);
  await prisma.$executeRaw`UPDATE "Post" SET "updatedAt" = now() - interval '30 days' WHERE id = ${D.post.id}`;
  const E = await makePost(cue, "SCHEDULED", [{ status: "SCHEDULED" }]);
  // A duplicate (draft) shares the published post's file.
  const F = await makePost(cue, "PUBLISHED", published8);
  const Fdup = await makePost(cue, "DRAFT", [{ status: "SCHEDULED" }], [{ key: F.key }]);
  const G = await makePost(cue, "PUBLISHED", published8, [{ type: "IMAGE" }]);
  const H = await makePost(own, "PUBLISHED", published8, [{ base: OWN }]);
  const I = await makePost(own, "PUBLISHED", published8, [{ base: "https://old-bucket.example.net" }]);
  const J = await makePost(cue, "PUBLISHED", published8);
  refuse.add(J.key);
  // Partly published, with a failed account being retried right now.
  const K = await makePost(cue, "PARTIAL", [
    { status: "PUBLISHED", publishedAt: ago(8) },
    { status: "PROCESSING" },
  ]);
  // Published before publishedAt was recorded: falls back to updatedAt.
  const L = await makePost(cue, "PUBLISHED", [{ status: "PUBLISHED" }]);
  await prisma.$executeRaw`UPDATE "Post" SET "updatedAt" = now() - interval '10 days' WHERE id = ${L.post.id}`;
  // Right at the line, which is where a time-zone slip would show (Prisma
  // stores UTC; this Postgres may run in another zone).
  const P = await makePost(cue, "PUBLISHED", [{ status: "PUBLISHED", publishedAt: new Date(Date.now() - 7 * DAY + 3 * 3_600_000) }]);
  const Q = await makePost(cue, "PUBLISHED", [{ status: "PUBLISHED", publishedAt: new Date(Date.now() - 7 * DAY - 3 * 3_600_000) }]);
  // A carousel-like post: the image stays, the video goes.
  const M2 = await makePost(cue, "PUBLISHED", published8, [{ type: "IMAGE" }, {}]);

  const usageBefore = (await getWorkspaceUsage(wsCue.id)).storageBytes;

  // ---- first run
  const r1 = await runMediaRetention({ remove: fakeRemove });
  console.log("run 1:", r1);
  const row = (key: string) => prisma.mediaAsset.findFirst({ where: { storageKey: key } });

  check("A: published 8+ days ago is deleted", wasDeleted(A.key) && !!(await row(A.key))?.removedAt);
  check("A: from Cue's bucket", bucketOf(A.key)?.custom === false);
  check("B: last publish 6 days ago is kept", !wasDeleted(B.key) && !(await row(B.key))?.removedAt);
  check("C: partly published 8 days ago is deleted", wasDeleted(C.key));
  check("D: never published (failed) is kept", !wasDeleted(D.key));
  check("E: scheduled is kept", !wasDeleted(E.key));
  check("F: kept while a draft duplicate uses the file", !wasDeleted(F.key) && !(await row(F.key))?.removedAt);
  check("G: images are kept", !wasDeleted(G.key));
  check("H: own bucket: deleted there", bucketOf(H.key)?.custom === true && bucketOf(H.key)?.bucket === "agency-media");
  const iRow = await row(I.key);
  check("I: disconnected bucket: not deleted, error recorded", !wasDeleted(I.key) && !iRow?.removedAt && !!iRow?.removalError && !!iRow?.removalTriedAt, iRow);
  const jRow = await row(J.key);
  check("J: bucket refused: put back with its error", wasDeleted(J.key) && !jRow?.removedAt && jRow?.removalError?.includes("AccessDenied") === true, jRow);
  check("K: account mid-upload: kept", !wasDeleted(K.key));
  check("L: no publishedAt, updated 10 days ago: deleted", wasDeleted(L.key));
  const m2 = await prisma.mediaAsset.findMany({ where: { postId: M2.post.id }, orderBy: { sortOrder: "asc" } });
  check("M: image kept, video deleted in the same post", !m2[0].removedAt && !!m2[1].removedAt);
  check("P: 3 hours short of 7 days is kept", !wasDeleted(P.key));
  check("Q: 3 hours past 7 days is deleted", wasDeleted(Q.key));

  // ---- around a deleted video
  check("retry refused for A", (await removedVideoProblem(A.post.id)) === VIDEO_REMOVED_MESSAGE);
  check("retry allowed for B", (await removedVideoProblem(B.post.id)) === null);
  let reuse = "";
  try {
    await assertWorkspaceMedia(wsCue.id, [{ url: `${CUE}/${A.key}`, storageKey: A.key }]);
  } catch (e) {
    reuse = e instanceof Error ? e.message : String(e);
  }
  check("reusing a deleted video in a new post is refused", reuse.includes("deleted from storage"), reuse);
  let fresh = "ok";
  try {
    await assertWorkspaceMedia(wsCue.id, [{ url: `${CUE}/${B.key}`, storageKey: B.key }]);
  } catch (e) {
    fresh = String(e);
  }
  check("a kept video can still be used", fresh === "ok", fresh);
  const usageAfter = (await getWorkspaceUsage(wsCue.id)).storageBytes;
  // A, C, L, Q and M2's video: 5 files of 10 MB in Cue's bucket.
  check("plan storage stops counting deleted videos", usageBefore - usageAfter === 50_000_000, { usageBefore, usageAfter });

  // ---- second run: nothing new, and failures wait a day
  deleted.length = 0;
  const r2 = await runMediaRetention({ remove: fakeRemove });
  console.log("run 2:", r2);
  check("second run deletes nothing again", !wasDeleted(A.key) && !wasDeleted(H.key));
  check("failed files aren't retried within a day", !wasDeleted(J.key) && !wasDeleted(I.key));

  // A day later the refused file is tried again, and now succeeds.
  refuse.clear();
  await prisma.mediaAsset.updateMany({ where: { storageKey: J.key }, data: { removalTriedAt: ago(1.1) } });
  deleted.length = 0;
  await runMediaRetention({ remove: fakeRemove });
  check("J: retried after a day and deleted", wasDeleted(J.key) && !!(await row(J.key))?.removedAt && !(await row(J.key))?.removalError);

  // Once the draft duplicate is deleted, F's file goes on the next run.
  await prisma.post.delete({ where: { id: Fdup.post.id } });
  deleted.length = 0;
  await runMediaRetention({ remove: fakeRemove });
  check("F: deleted once no draft uses it", wasDeleted(F.key) && !!(await row(F.key))?.removedAt);

  // A storage call that throws (e.g. the bucket is unreachable) puts the whole batch back.
  const N = await makePost(cue, "PUBLISHED", published8);
  await runMediaRetention({
    remove: async () => {
      throw new Error("connect ETIMEDOUT");
    },
  });
  const nRow = await row(N.key);
  check("a storage error puts the file back with the error", !nRow?.removedAt && nRow?.removalError === "Not deleted: connect ETIMEDOUT", nRow);

  // ---- the real storage call, against a local S3-style server
  const requests: string[] = [];
  const s3 = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    if (req.url?.includes("locked")) {
      res.writeHead(403, { "Content-Type": "application/xml" });
      return res.end('<?xml version="1.0"?><Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>');
    }
    res.writeHead(204).end(); // S3 answers 204 whether or not the key existed
  });
  await new Promise<void>((r) => s3.listen(0, "127.0.0.1", r));
  const port = (s3.address() as AddressInfo).port;
  const local = makeTarget(
    {
      provider: "S3",
      endpoint: `http://127.0.0.1:${port}`,
      region: "us-east-1",
      bucket: "media",
      forcePathStyle: true,
      accessKeyId: "test",
      secretAccessKey: "test",
      publicUrl: "https://media.example",
    },
    false, // not a workspace bucket: skips the https/public-host checks for this local server
  );
  const keys = Array.from({ length: 11 }, (_, i) => `posts/${i === 4 ? "locked" : "ok"}-${i}.mp4`);
  const fails = await deleteEach(local, keys, 4);
  s3.close();
  check("deleteEach sends one DELETE per key", requests.length === 11 && requests.every((r) => r.startsWith("DELETE /media/posts/")), requests);
  check("deleteEach reports the refused key with S3's reason", fails.length === 1 && fails[0].key === "posts/locked-4.mp4" && fails[0].error.startsWith("AccessDenied"), fails);

  await cleanup();
  await prisma.$disconnect();
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
