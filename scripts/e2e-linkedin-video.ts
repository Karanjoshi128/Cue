/*
 * LinkedIn video posting, with LinkedIn and the media download faked: the
 * Videos API flow (initializeUpload → parts → finalizeUpload → status), the
 * post that carries the video, and the rules for what LinkedIn accepts.
 * Touches no database and no network.
 *
 *   npx tsx scripts/e2e-linkedin-video.ts
 */
import https from "https";
import { EventEmitter } from "events";
import { Readable } from "stream";
import { linkedinAdapter, uploadLinkedInVideo } from "@/lib/platforms/linkedin";
import { linkedInVideoProblem } from "@/lib/linkedin-media";
import { assertPostIsPublishable } from "@/lib/posts";

let passed = 0;
let failed = 0;
function check(name: string, cond: unknown, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}`, extra ?? "");
  }
}

const MB = 1024 * 1024;
const PART = 4 * MB;

// ------------------------------------------------------------ LinkedIn fake
type Call = { method: string; url: string; headers: Headers; body?: unknown; bytes?: number };
let calls: Call[] = [];
let statuses: string[] = [];
let failReason: string | null = null;
let partNeedsAuth = -1; // this part's URL answers 401 without the token

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const headers = new Headers(init?.headers);
  const raw = init?.body;
  const isBytes = raw instanceof Uint8Array;
  calls.push({
    method,
    url,
    headers,
    body: !isBytes && typeof raw === "string" ? JSON.parse(raw) : undefined,
    bytes: isBytes ? (raw as Uint8Array).byteLength : undefined,
  });
  if (url.endsWith("/rest/videos?action=initializeUpload")) {
    const size = (JSON.parse(String(raw)) as { initializeUploadRequest: { fileSizeBytes: number } })
      .initializeUploadRequest.fileSizeBytes;
    const parts = [];
    for (let first = 0, i = 0; first < size; first += PART, i++) {
      parts.push({ uploadUrl: `https://www.linkedin.com/dms-uploads/V1/part${i}?sau=x`, firstByte: first, lastByte: Math.min(first + PART, size) - 1 });
    }
    return json(200, { value: { video: "urn:li:video:V1", uploadToken: "", uploadInstructions: parts, uploadUrlsExpireAt: 0 } });
  }
  const part = /\/dms-uploads\/V1\/part(\d+)/.exec(url);
  if (part && method === "PUT") {
    const i = Number(part[1]);
    if (i === partNeedsAuth && !headers.get("authorization")) return new Response("", { status: 401 });
    return new Response("", { status: 200, headers: { etag: `/ambry-videoei/signedId/part${i}.bin` } });
  }
  if (url.endsWith("/rest/videos?action=finalizeUpload")) return new Response("", { status: 200 });
  if (url.startsWith("https://api.linkedin.com/rest/videos/")) {
    if (failReason) return json(200, { status: "PROCESSING_FAILED", processingFailureReason: failReason });
    return json(200, { status: statuses.shift() ?? "AVAILABLE" });
  }
  if (url.endsWith("/rest/posts") && method === "POST") {
    return new Response("", { status: 201, headers: { "x-restli-id": "urn:li:share:777" } });
  }
  throw new Error(`unexpected ${method} ${url}`);
}) as typeof fetch;

// ------------------------------------------------------------ media download fake
// fetchMedia uses https.get; answer it with a file of the asked size.
let served = { type: "video/mp4", size: 10 * MB };
(https as unknown as { get: unknown }).get = (_url: URL, _opts: unknown, cb: (res: Readable & { statusCode: number; headers: Record<string, string> }) => void) => {
  const req = Object.assign(new EventEmitter(), { destroy() {} });
  const body = Buffer.alloc(served.size, 7);
  const res = Object.assign(Readable.from([body]), {
    statusCode: 200,
    headers: { "content-type": served.type, "content-length": String(served.size) },
  });
  queueMicrotask(() => cb(res));
  return req;
};

const fast = { attempts: 5, intervalMs: 1 };
const video = (size: number, type = "video/mp4", url = "https://cdn.example.com/posts/clip.mp4") => ({
  bytes: new Uint8Array(new ArrayBuffer(size)),
  contentType: type,
  url,
});

async function main() {
  console.log("\nupload");
  calls = [];
  statuses = ["PROCESSING", "PROCESSING"];
  const urn = await uploadLinkedInVideo("urn:li:person:ME", "tok", video(10 * MB), fast);
  const init = calls.find((c) => c.url.includes("initializeUpload"));
  const puts = calls.filter((c) => c.method === "PUT");
  const fin = calls.find((c) => c.url.includes("finalizeUpload"));
  const polls = calls.filter((c) => c.url.startsWith("https://api.linkedin.com/rest/videos/"));
  check("returns the video URN", urn === "urn:li:video:V1");
  check(
    "initializeUpload names the owner and the size",
    (init?.body as { initializeUploadRequest: { owner: string; fileSizeBytes: number } })?.initializeUploadRequest.owner === "urn:li:person:ME" &&
      (init?.body as { initializeUploadRequest: { fileSizeBytes: number } }).initializeUploadRequest.fileSizeBytes === 10 * MB,
  );
  check("sends the LinkedIn-Version header", init?.headers.get("linkedin-version") === "202606");
  check("three parts, sized by LinkedIn's byte ranges", puts.length === 3 && puts[0].bytes === PART && puts[1].bytes === PART && puts[2].bytes === 2 * MB, puts.map((p) => p.bytes));
  check("parts go as octet-stream without the token", puts.every((p) => p.headers.get("content-type") === "application/octet-stream" && !p.headers.get("authorization")));
  check(
    "finalize lists the ETags in part order",
    JSON.stringify((fin?.body as { finalizeUploadRequest: { uploadedPartIds: string[] } }).finalizeUploadRequest.uploadedPartIds) ===
      JSON.stringify(["/ambry-videoei/signedId/part0.bin", "/ambry-videoei/signedId/part1.bin", "/ambry-videoei/signedId/part2.bin"]),
  );
  check("waits until LinkedIn says AVAILABLE", polls.length === 3, polls.length);

  console.log("\nupload edge cases");
  calls = [];
  partNeedsAuth = 1;
  await uploadLinkedInVideo("urn:li:person:ME", "tok", video(9 * MB), fast);
  const p1 = calls.filter((c) => c.url.includes("/part1"));
  check("a part URL that wants the token gets it on a second try", p1.length === 2 && p1[1].headers.get("authorization") === "Bearer tok");
  partNeedsAuth = -1;

  failReason = "Unsupported codec";
  const err = await uploadLinkedInVideo("urn:li:person:ME", "tok", video(MB), fast).catch((e: Error) => e.message);
  check("processing failure is reported with LinkedIn's reason", typeof err === "string" && err.includes("Unsupported codec"), err);
  failReason = null;

  calls = [];
  statuses = Array(10).fill("PROCESSING");
  const slow = await uploadLinkedInVideo("urn:li:person:ME", "tok", video(MB), { attempts: 3, intervalMs: 1 });
  check("still processing after the wait: returns the URN to try the post", slow === "urn:li:video:V1");

  calls = [];
  const mov = await uploadLinkedInVideo("urn:li:person:ME", "tok", video(MB, "video/quicktime", "https://cdn.example.com/posts/clip.mov"), fast).catch((e: Error) => e.message);
  check("a .mov is refused before anything is uploaded", typeof mov === "string" && /MP4/.test(mov) && calls.length === 0, mov);
  const tiny = await uploadLinkedInVideo("urn:li:person:ME", "tok", video(10 * 1024), fast).catch((e: Error) => e.message);
  check("under 75 KB is refused", typeof tiny === "string" && /75 KB/.test(tiny));

  console.log("\npublish");
  calls = [];
  statuses = [];
  served = { type: "video/mp4", size: 5 * MB };
  const res = await linkedinAdapter.publish({
    body: "Our new roastery tour 🎬",
    media: [{ type: "VIDEO", url: "https://cdn.example.com/posts/tour.mp4" }],
    accessToken: "tok",
    externalId: "urn:li:organization:42",
  });
  const post = calls.find((c) => c.url.endsWith("/rest/posts"));
  const content = (post?.body as { content?: { media?: { id: string } }; author: string; commentary: string }) ?? null;
  check("posts with the video as its media", content?.content?.media?.id === "urn:li:video:V1", content);
  check("as the Page, with the caption", content?.author === "urn:li:organization:42" && content.commentary === "Our new roastery tour 🎬");
  check("returns the post id and link", res.externalPostId === "urn:li:share:777" && res.permalink === "https://www.linkedin.com/feed/update/urn:li:share:777/");

  calls = [];
  await linkedinAdapter.publish({
    body: "Old post",
    media: [
      { type: "IMAGE", url: "https://cdn.example.com/posts/a.jpg" },
      { type: "VIDEO", url: "https://cdn.example.com/posts/tour.mp4" },
    ],
    accessToken: "tok",
    externalId: "urn:li:person:ME",
  }).catch(() => null);
  check("images still win over a video (posts scheduled before this)", !calls.some((c) => c.url.includes("/rest/videos")));

  console.log("\nwhat LinkedIn accepts");
  const v = (url = "https://x.example/posts/a.mp4", sizeBytes?: number) => ({ type: "VIDEO" as const, url, sizeBytes });
  const img = { type: "IMAGE" as const, url: "https://x.example/posts/b.jpg" };
  check("one MP4 is fine", linkedInVideoProblem([v()]) === null);
  check("images only are fine", linkedInVideoProblem([img, img]) === null);
  check("two videos aren't", /one video/.test(linkedInVideoProblem([v(), v()]) ?? ""));
  check("a video with images isn't", /video and images/.test(linkedInVideoProblem([v(), img]) ?? ""));
  check("a .mov isn't", /\.mov/.test(linkedInVideoProblem([v("https://x.example/posts/a.mov")]) ?? ""));
  check("a 20 KB video isn't", /75 KB/.test(linkedInVideoProblem([v(undefined, 20 * 1024)]) ?? ""));

  const li = [{ id: "a1", platform: "LINKEDIN" as const, displayName: "Acme" }];
  const base = { clientId: "c", accountIds: ["a1"], body: "Hi", action: "schedule" as const };
  const rejects = (media: { type: "IMAGE" | "VIDEO" | "DOCUMENT"; url: string; storageKey: string }[], action: "schedule" | "draft" = "schedule") => {
    try {
      // @ts-expect-error only the fields the rule reads
      assertPostIsPublishable(li, { ...base, action, media });
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
  const key = "posts/2f0c0000-0000-4000-8000-000000000000.mp4";
  check("the server refuses a video with images for LinkedIn", /video and images/.test(rejects([{ type: "VIDEO", url: "https://x.example/posts/a.mp4", storageKey: key }, { type: "IMAGE", url: "https://x.example/posts/b.jpg", storageKey: key }]) ?? ""));
  check("but a draft may still be incomplete", rejects([{ type: "VIDEO", url: "https://x.example/posts/a.mov", storageKey: key }], "draft") === null);
  check("and one MP4 is accepted", rejects([{ type: "VIDEO", url: "https://x.example/posts/a.mp4", storageKey: key }]) === null);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
